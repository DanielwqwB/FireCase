import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/supabase/auth';
export async function GET(){
 const {user,error}=await getCurrentUser();
 if(!user)return NextResponse.json({error:error||'Authentication required.'},{status:401});
 const savingConfigured=Boolean(process.env.SUPABASE_SECRET_KEY);
 try{
  const base=(process.env.FIRECASE_PREDICTION_API_URL||'https://firecase.onrender.com').replace(/\/$/,'');
  const response=await fetch(`${base}/health`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Service health check failed.');
  const health=await response.json();
  return NextResponse.json({available:health.status==='ok',dailyReady:health.model_loaded===true,lstmReady:health.lstm_model_loaded===true,savingConfigured,message:health.status==='ok'?`Online. Daily model ${health.model_loaded?'ready':'unavailable'}; LSTM ${health.lstm_model_loaded?'ready':'unavailable'}.`:'Service is not ready.'});
 }catch{return NextResponse.json({available:false,dailyReady:false,lstmReady:false,savingConfigured,message:'Prediction service is unavailable or still starting. Try again shortly.'})}
}
