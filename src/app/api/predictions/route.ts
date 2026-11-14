import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {predictionRequestSchema} from '@/lib/prediction-dataset';

const resultSchema = z.object({
  observation_date: z.string().date(), prediction_date: z.string().date(),
  predicted_class: z.number().int(), high_activity: z.boolean(),
  high_activity_probability: z.number().min(0).max(1),
  high_activity_hotspot_threshold: z.number(),
}).passthrough();

export async function GET() {
  const { user, error } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: error || 'Authentication required.' }, { status: 401 });
  if (!['admin', 'emergency_responder'].includes(user.role)) return NextResponse.json({ error: 'Prediction access is restricted to Admin and Emergency Responder accounts.' }, { status: 403 });
  const db = await createClient();
  const { data, error: queryError } = await db.from('fire_predictions').select('*').order('created_at', { ascending: false }).limit(100);
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });
  return NextResponse.json({ predictions: data || [] });
}

export async function POST(request: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: error || 'Authentication required.' }, { status: 401 });
  if (!['admin', 'emergency_responder'].includes(user.role)) return NextResponse.json({ error: 'Prediction access is restricted to Admin and Emergency Responder accounts.' }, { status: 403 });
  const parsed = predictionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ') }, { status: 400 });

  const input = parsed.data;
  const modelName = input.model;
  const observationData = {...(modelName === 'daily' ? input.observation : { observations: input.observations }), ...(input.context?{context:input.context}:{})};
  const endpoint = modelName === 'daily' ? '/predict' : '/predict/lstm';
  const baseUrl = (process.env.FIRECASE_PREDICTION_API_URL || 'https://firecase.onrender.com').replace(/\/$/, '');
  let admin:ReturnType<typeof createAdminClient>;
  try{admin=createAdminClient()}catch{return NextResponse.json({error:'Prediction saving is not configured. Ask the administrator to set SUPABASE_SECRET_KEY on the server.'},{status:503})}

  const { data: record, error: insertError } = await admin.from('fire_predictions').insert({
    submitted_by: user.id, model_name: modelName, observation_data: observationData,
    prediction_status: 'pending',
  }).select('prediction_id').single();
  if (insertError || !record) return NextResponse.json({ error: insertError?.message || 'Could not save the prediction request.' }, { status: 500 });

  try {
    const upstream = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(modelName === 'daily' ? input.observation : { observations: input.observations }),
      cache: 'no-store', signal: AbortSignal.timeout(120_000),
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = typeof payload?.detail === 'string' ? payload.detail : `Prediction API returned HTTP ${upstream.status}.`;
      await admin.from('fire_predictions').update({ prediction_status: 'failed', error_message: detail, completed_at: new Date().toISOString() }).eq('prediction_id', record.prediction_id);
      return NextResponse.json({ error: detail, predictionId: record.prediction_id }, { status: 502 });
    }
    const result = resultSchema.safeParse(payload);
    if (!result.success) throw new Error('Prediction API response did not match the documented response schema.');
    const { error: saveError } = await admin.from('fire_predictions').update({
      prediction_result: result.data, prediction_status: 'succeeded', completed_at: new Date().toISOString(), error_message: null,
    }).eq('prediction_id', record.prediction_id);
    if (saveError) return NextResponse.json({ error: 'The model returned a result, but it could not be saved to Supabase.', predictionId: record.prediction_id }, { status: 500 });
    return NextResponse.json({ predictionId: record.prediction_id, prediction: result.data }, { status: 201 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Prediction service is temporarily unavailable.';
    await admin.from('fire_predictions').update({ prediction_status: 'failed', error_message: message, completed_at: new Date().toISOString() }).eq('prediction_id', record.prediction_id);
    return NextResponse.json({ error: message, predictionId: record.prediction_id }, { status: 502 });
  }
}
