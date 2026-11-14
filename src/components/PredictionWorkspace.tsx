'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Activity, BrainCircuit, Clock3, LoaderCircle, Save } from 'lucide-react';
import { Card, Heading, Badge } from '@/components/ui';
import { apiRequest } from '@/lib/services';

type ModelResult = {
  observation_date: string;
  prediction_date: string;
  predicted_class: number;
  high_activity: boolean;
  high_activity_probability: number;
  high_activity_hotspot_threshold: number;
  [key: string]: unknown;
};
type PredictionRecord = {
  prediction_id: string;
  model_name: 'daily' | 'lstm';
  observation_data: unknown;
  prediction_result: ModelResult | null;
  prediction_status: 'pending' | 'succeeded' | 'failed';
  error_message: string | null;
  created_at: string;
};
const fields = [
  ['CLDTMP', 'Cloud temperature'], ['PS', 'Surface pressure'], ['T2M', '2 m temperature'],
  ['TO3', 'Total ozone'], ['TQV', 'Total precipitable water'], ['TS', 'Surface temperature'],
  ['U10M', '10 m eastward wind'], ['U50M', '50 m eastward wind'],
  ['V10M', '10 m northward wind'], ['V50M', '50 m northward wind'],
] as const;
const emptyLstmExample = '[\n  {\n    "observation_date": "YYYY-MM-DD", "CLDTMP": 0, "PS": 0, "T2M": 0,\n    "TO3": 0, "TQV": 0, "TS": 0, "U10M": 0, "U50M": 0,\n    "V10M": 0, "V50M": 0, "total_hotspots": 0\n  }\n]';

export function PredictionWorkspace() {
  const [model, setModel] = useState<'daily' | 'lstm'>('daily');
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [result, setResult] = useState<ModelResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  async function loadHistory() {
    try {
      const response = await apiRequest<{ predictions: PredictionRecord[] }>('/api/predictions');
      setRecords(response.predictions);
      setLoadError('');
    } catch (caught) {
      setLoadError((caught as Error).message);
    }
  }
  useEffect(() => { void loadHistory(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      let body: Record<string, unknown>;
      if (model === 'daily') {
        body = { model, observation: {
          observation_date: String(form.get('observation_date')),
          ...Object.fromEntries(fields.map(([key]) => [key, Number(form.get(key))])),
          hotspots_today: Number(form.get('hotspots_today')),
          hotspots_prev7_mean: Number(form.get('hotspots_prev7_mean')),
        } };
      } else {
        const observations = JSON.parse(String(form.get('observations') || ''));
        if (!Array.isArray(observations) || observations.length !== 14) throw new Error('The LSTM model requires exactly 14 consecutive daily observations, oldest first.');
        body = { model, observations };
      }
      const response = await apiRequest<{ predictionId: string; prediction: ModelResult }>('/api/predictions', {
        method: 'POST', body: JSON.stringify(body),
      });
      setResult(response.prediction);
      await loadHistory();
    } catch (caught) {
      setError((caught as Error).message || 'Prediction could not be completed.');
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Heading eyebrow="FIRE ANALYSIS / PREDICTION" title="Fire activity prediction" sub="Run the documented FireCase model with your observations. Inputs and model outputs are saved to the FireCase database."/>
    <div className="prediction-layout">
      <Card className="prediction-form-card">
        <div className="card-head"><div><h3>Model inputs</h3><p>Use actual daily weather and hotspot observations.</p></div><BrainCircuit size={19}/></div>
        <div className="prediction-model-select"><button type="button" className={model==='daily'?'selected':''} onClick={()=>{setModel('daily');setError('');setResult(null)}}><Activity size={16}/> Daily model</button><button type="button" className={model==='lstm'?'selected':''} onClick={()=>{setModel('lstm');setError('');setResult(null)}}><BrainCircuit size={16}/> LSTM (14 days)</button></div>
        <form className="prediction-form" onSubmit={submit}>
          {model==='daily' ? <>
            <label>Observation date<input name="observation_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
            <div className="prediction-fields">{fields.map(([key,label])=><label key={key}>{label} ({key})<input name={key} type="number" step="any" required/></label>)}</div>
            <div className="prediction-fields"><label>Hotspots today<input name="hotspots_today" type="number" min="0" step="1" required/></label><label>Mean hotspots, previous 7 days<input name="hotspots_prev7_mean" type="number" min="0" step="any" required/></label></div>
          </> : <>
            <p className="prediction-help">Paste 14 consecutive observations in oldest-first order. Each row must include the date, all 10 weather features, and <code>total_hotspots</code>. The model API currently expects exactly 14 rows.</p>
            <label>Daily observations (JSON)<textarea name="observations" rows={15} required placeholder={emptyLstmExample}/></label>
          </>}
          {error&&<div className="form-error">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy?<><LoaderCircle size={15} className="spin"/> Running model and saving result…</>:<><Save size={15}/> Predict and save</>}</button>
        </form>
      </Card>
      <div className="prediction-results">
        {result&&<Card className="prediction-result-card"><div className="card-head"><div><div className="eyebrow">SAVED MODEL RESULT</div><h3>{result.high_activity?'High activity predicted':'High activity not predicted'}</h3></div><Badge tone={result.high_activity?'active':'contained'}>{result.high_activity?'High activity':'Normal'}</Badge></div><div className="prediction-probability">{(result.high_activity_probability*100).toFixed(1)}<span>%</span><small>High-activity probability</small></div><div className="detail-row"><span>Predicted class</span><b>{result.predicted_class}</b></div><div className="detail-row"><span>Observation date</span><b>{result.observation_date}</b></div><div className="detail-row"><span>Prediction date</span><b>{result.prediction_date}</b></div><div className="detail-row"><span>Hotspot threshold</span><b>{result.high_activity_hotspot_threshold}</b></div></Card>}
        <Card className="prediction-history"><div className="card-head"><div><h3>Saved predictions</h3><p>Latest predictions recorded in Supabase</p></div><Clock3 size={18}/></div>
          {loadError&&<div className="form-error">{loadError}</div>}
          {records.length===0&&!loadError&&<div className="empty-inline"><span>No prediction records yet. Run a model to save its result here.</span></div>}
          {records.map(record=><details key={record.prediction_id} className="prediction-record"><summary><span><b>{record.model_name==='lstm'?'LSTM':'Daily'} model</b><small>{new Date(record.created_at).toLocaleString()}</small></span><Badge tone={record.prediction_status==='succeeded'?'contained':record.prediction_status==='failed'?'closed':'requested'}>{record.prediction_status}</Badge></summary>{record.prediction_result?<><div className="detail-row"><span>High activity</span><b>{record.prediction_result.high_activity?'Yes':'No'}</b></div><div className="detail-row"><span>Probability</span><b>{(record.prediction_result.high_activity_probability*100).toFixed(1)}%</b></div><div className="detail-row"><span>Prediction date</span><b>{record.prediction_result.prediction_date}</b></div></>:record.error_message&&<p className="prediction-error">{record.error_message}</p>}<pre>{JSON.stringify(record.observation_data,null,2)}</pre></details>)}
        </Card>
      </div>
    </div>
  </>;
}
