'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Activity, BrainCircuit, Clock3, LoaderCircle, Save } from 'lucide-react';
import { Card, Heading, Badge,MapView } from '@/components/ui';
import { apiRequest } from '@/lib/services';
import {parsePredictionDataset} from '@/lib/prediction-dataset';
import type {ResearchSummary} from '@/lib/research-types';
import type {Area,WildfireCase,Role} from '@/lib/types';

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

export function PredictionWorkspace({areas=[],cases=[],onNavigate,role='Admin',initialPhase='pre'}:{areas?:Area[];cases?:WildfireCase[];onNavigate?:(page:string)=>void;role?:Role;initialPhase?:'pre'|'during'|'post'}) {
  const canPredict=role==='Admin'||role==='Emergency Responder';
  const [service,setService]=useState<{available:boolean;dailyReady:boolean;lstmReady:boolean;savingConfigured:boolean;message:string}|null>(null);
  const [research,setResearch]=useState<ResearchSummary|null>(null);
  const [researchError,setResearchError]=useState('');
  const [storedDate,setStoredDate]=useState('');
  const [datasetBusy,setDatasetBusy]=useState(false);
  const [inputMode,setInputMode]=useState<'stored'|'upload'|'manual'>('stored');
  const [isStored,setIsStored]=useState(false);
  const [phase,setPhase]=useState<'pre'|'during'|'post'>(initialPhase);
  const [caseArea,setCaseArea]=useState('');
  const [recoveryRecords,setRecoveryRecords]=useState<{recovery_id:string;case_id:string;recovery_status:string;observation_date:string}[]>([]);
  const [recoveryError,setRecoveryError]=useState('');
  const [place,setPlace]=useState('Bicol Region, Philippines');
  const [source,setSource]=useState('');
  const [dataset,setDataset]=useState<ReturnType<typeof parsePredictionDataset>|null>(null);
  const [fileName,setFileName]=useState('');
  async function importDataset(file:File){
    setError('');setDataset(null);setFileName('');setIsStored(false);
    try{if(file.size>2*1024*1024)throw new Error('Dataset must be 2 MB or smaller.');
      const parsed=parsePredictionDataset(await file.text(),model);setDataset(parsed);setFileName(file.name);
    }catch(caught){setError((caught as Error).message)}
  }
  function downloadTemplate(){
    const header='observation_date,CLDTMP,PS,T2M,TO3,TQV,TS,U10M,U50M,V10M,V50M,'+(model==='daily'?'hotspots_today,hotspots_prev7_mean':'total_hotspots');
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([header+'\n'],{type:'text/csv'}));link.download=`bicol-${model}-template.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);
  }
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
  useEffect(()=>{let alive=true;apiRequest<ResearchSummary>('/api/datasets').then(value=>{if(alive){setResearch(value);setStoredDate(value.model_observations.to);setResearchError('')}}).catch(error=>{if(alive)setResearchError((error as Error).message)});return()=>{alive=false}},[]);
  useEffect(() => {if(canPredict)void loadHistory();}, [canPredict]);
  useEffect(()=>{let alive=true;apiRequest<NonNullable<typeof service>>('/api/predictions/status').then(value=>{if(alive)setService(value)}).catch(()=>{if(alive)setService({available:false,dailyReady:false,lstmReady:false,savingConfigured:false,message:'Unable to check the prediction service.'})});return()=>{alive=false}},[]);

  useEffect(()=>{if(phase!=='post'||role==='Firefighter')return;let alive=true;
   apiRequest<{recovery:typeof recoveryRecords}>('/api/recovery').then(value=>{if(alive){setRecoveryRecords(value.recovery);setRecoveryError('')}}).catch(error=>{if(alive)setRecoveryError((error as Error).message)});
   return()=>{alive=false};
  },[phase,role]);
  const phaseCases=cases.filter(c=>(!caseArea||c.area===caseArea)&&(phase==='during'?(c.status==='Active'||c.status==='Watch'):(c.status==='Recovery'||c.status==='Closed')));
  const visibleRecovery=recoveryRecords.filter(record=>!caseArea||cases.some(c=>c.caseId===record.case_id&&c.area===caseArea));

  async function loadStored(){
   setDatasetBusy(true);setError('');setResult(null);
   try{
    const response=await apiRequest<{input:ReturnType<typeof parsePredictionDataset>}>(`/api/datasets?kind=model&model=${model}&date=${encodeURIComponent(storedDate)}`);
    setDataset(response.input);setFileName(`Stored training observations ending ${storedDate}`);setIsStored(true);setInputMode('stored');
    setTimeout(()=>document.getElementById('prediction-inputs')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
    setPlace(response.input.context?.place||'Philippines (model training aggregation)');setSource(response.input.context?.source||'Stored training observations');
   }catch(error){setError((error as Error).message)}finally{setDatasetBusy(false)}
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!canPredict){setError('Only an Admin or Emergency Responder can run predictions.');return}
    if(inputMode!=='manual'&&!dataset){setError('Load stored observations or upload a valid dataset before predicting.');return}
    setBusy(true); setError(''); setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      let body: Record<string, unknown>;
      if(dataset){body={...dataset};} else if (model === 'daily') {
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
      body.context=isStored&&dataset?.context?dataset.context:{place,...(form.get('latitude')!==''?{latitude:Number(form.get('latitude'))}:{}),...(form.get('longitude')!==''?{longitude:Number(form.get('longitude'))}:{}),source};
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
    <Heading eyebrow="BICOL / WILDFIRE ANALYSIS" title="Wildfire analysis" sub="Choose a place, check available data, and move from fire activity forecasts to incident monitoring and recovery."/>
    <div className="wildfire-phases" aria-label="Wildfire stage">{([['pre','Pre-fire','Forecast fire activity'],['during','During fire','Monitor incidents'],['post','Post-fire','Review recovery']] as const).map(([id,title,description])=><button type="button" key={id} aria-pressed={phase===id} className={phase===id?'selected':''} onClick={()=>setPhase(id)}><b>{title}</b><span>{description}</span></button>)}</div>
    <Card className="data-availability"><div><b>Prediction service</b><span>{service?service.message:'Checking FireCase API...'}</span></div><div><b>Bicol observations</b><span>{research?`${research.hotspots.count.toLocaleString()} historical hotspots stored in Supabase.`:researchError||'Loading stored datasets...'}</span></div><div><b>Saved results</b><span>{service?(service.savingConfigured?'Server saving is configured.':'Saving needs administrator setup.'):'Checking configuration...'}</span></div><a href="https://firecase.onrender.com/docs" target="_blank" rel="noreferrer">View model documentation</a></Card>
    {research&&<Card className="stored-datasets"><div className="card-head"><div><h3>Available research data</h3><p>Imported from your local source files. These are historical observations.</p></div><Badge tone="contained">Supabase connected</Badge></div><div className="research-counts"><div><b>{research.hotspots.count.toLocaleString()}</b><span>Bicol MODIS / VIIRS hotspots</span><small>{research.hotspots.from.slice(0,10)} to {research.hotspots.to.slice(0,10)}</small></div><div><b>{research.weather.count.toLocaleString()}</b><span>Daily weather records</span><small>{research.weather.from} to {research.weather.to}</small></div><div><b>{research.model_observations.count.toLocaleString()}</b><span>Processed model-input days</span><small>{research.model_observations.from} to {research.model_observations.to}</small></div></div><p className="prediction-help">The saved model inputs use Philippines-wide hotspot aggregation. They support historical model evaluation, not a Bicol-specific forecast. The weather CSV does not specify its geographic coverage.</p>{canPredict&&<>        <div className="prediction-model-select"><button type="button" className={model==='daily'?'selected':''} disabled={busy||datasetBusy} onClick={()=>{setIsStored(false);setModel('daily');setError('');setResult(null);setDataset(null);setFileName('')}}><Activity size={16}/> Daily model</button><button type="button" className={model==='lstm'?'selected':''} disabled={busy||datasetBusy} onClick={()=>{setIsStored(false);setModel('lstm');setError('');setResult(null);setDataset(null);setFileName('')}}><BrainCircuit size={16}/> LSTM (14 days)</button></div><div className="stored-load"><label>Historical observation date<input type="date" value={storedDate} min={research.model_observations.from} max={research.model_observations.to} onChange={e=>setStoredDate(e.target.value)}/></label><button type="button" className="btn primary" disabled={datasetBusy||busy||!storedDate} onClick={()=>{setPhase('pre');void loadStored()}}>{datasetBusy?'Loading stored inputs...':`Load stored ${model==='daily'?'Daily':'LSTM'} inputs`}</button></div></>}</Card>}

    {phase==='during'&&research&&<Card className="stored-datasets"><h3>Historical Bicol satellite detections</h3><p>Latest {research.sampleHotspots.length} of {research.hotspots.count.toLocaleString()} imported observations. These are not currently active or confirmed wildfire cases.</p><MapView cases={[]} hotspots={research.sampleHotspots}/><div className="table-scroll"><table><thead><tr><th>Observed (UTC)</th><th>Sensor</th><th>Latitude</th><th>Longitude</th><th>FRP (MW)</th></tr></thead><tbody>{research.sampleHotspots.slice(0,20).map(point=><tr key={point.id}><td>{point.observedAt.replace('T',' ').slice(0,16)}</td><td>{point.sensor}</td><td>{point.latitude.toFixed(4)}</td><td>{point.longitude.toFixed(4)}</td><td>{point.frp??'Not supplied'}</td></tr>)}</tbody></table></div></Card>}
    {phase==='post'&&research&&<div className="notice"><div><b>Burned-area measurements are not available</b><span>{research.other_sources.burned_area}</span></div></div>}
    {phase!=='pre'&&<Card className="phase-summary"><h3>{phase==='during'?'During-fire monitoring':'Post-fire recovery'}</h3><p>{phase==='during'?'Review stored fire incidents and field verification. The connected prediction models do not provide real-time fire spread estimates.':'Review cases in recovery or closed status. Recovery forecasting needs a separate validated dataset and model.'}</p><p>Select a configured Bicol monitoring area to view its records. All accessible records are shown until you choose an area.</p><label>Monitoring area<select value={caseArea} onChange={e=>setCaseArea(e.target.value)}><option value="">All accessible areas</option>{Array.from(new Set([...areas.map(a=>a.name),...cases.map(c=>c.area)])).map(name=><option key={name}>{name}</option>)}</select></label>{phaseCases.map(c=><div className="detail-row" key={c.caseId}><span>{c.id} / {c.area}<small> {c.location}</small></span><Badge>{c.status}</Badge></div>)}{phaseCases.length===0&&<div className="empty-inline">No {phase==='during'?'incident':'recovery case'} records available. No live satellite feed is connected.</div>}{phase==='post'&&<><h4>Recovery observations</h4>{recoveryError&&<div className="form-error" role="alert">{recoveryError}</div>}{visibleRecovery.map(record=><div className="detail-row" key={record.recovery_id}><span>{cases.find(c=>c.caseId===record.case_id)?.id||record.case_id} / {record.observation_date}</span><b>{record.recovery_status}</b></div>)}{visibleRecovery.length===0&&!recoveryError&&<p>No accessible recovery observations for this selection.</p>}</>}{onNavigate&&<button className="btn secondary" onClick={()=>onNavigate(role==='Land Manager'?(phase==='post'?'recovery':'areas'):'cases')}>Open case records</button>}</Card>}
    {phase==='pre'&&!canPredict&&<Card className="phase-summary"><h3>Pre-fire activity forecasts</h3><p>An Admin or Emergency Responder can import Bicol observations and run the Daily or LSTM model. Your role can review the During fire and Post-fire tabs above.</p></Card>}
    {phase==='pre'&&canPredict&&<>
    <div className="prediction-layout">
      <Card className="prediction-form-card">
        <div className="card-head"><div><h3>Pre-fire activity forecast</h3><p>Import observations for your selected place, then run the model.</p></div><BrainCircuit size={19}/></div>

        {!research&&<>        <div className="prediction-model-select"><button type="button" className={model==='daily'?'selected':''} disabled={busy||datasetBusy} onClick={()=>{setIsStored(false);setModel('daily');setError('');setResult(null);setDataset(null);setFileName('')}}><Activity size={16}/> Daily model</button><button type="button" className={model==='lstm'?'selected':''} disabled={busy||datasetBusy} onClick={()=>{setIsStored(false);setModel('lstm');setError('');setResult(null);setDataset(null);setFileName('')}}><BrainCircuit size={16}/> LSTM (14 days)</button></div></>}
        <div className="input-method-selector" aria-label="Prediction input source">{([['stored','Stored observations'],['upload','Upload dataset'],['manual','Enter manually']] as const).map(([id,label])=><button type="button" key={id} disabled={busy||datasetBusy} aria-pressed={inputMode===id} className={inputMode===id?'selected':''} onClick={()=>{setInputMode(id);setDataset(null);setFileName('');setIsStored(false);setError('');setResult(null);setSource('');setPlace('Bicol Region, Philippines')}}>{label}</button>)}</div>
        {inputMode==='stored'&&!dataset&&<div className="stored-input-prompt"><BrainCircuit size={28}/><h4>Start with your stored observations</h4><p>Choose an observation date in Available research data above, then load the Daily or LSTM inputs. Your weather and hotspot values will be filled automatically.</p></div>}
        {(inputMode!=='stored'||dataset)&&<form id="prediction-inputs" className="prediction-form" onSubmit={submit}>
          {!isStored&&<><label>Bicol coverage<select disabled={isStored} value={['Bicol Region, Philippines','Albay','Camarines Norte','Camarines Sur','Catanduanes','Masbate','Sorsogon'].includes(place)?place:''} onChange={e=>setPlace(e.target.value)}><option value="">Specific city / municipality</option>{['Bicol Region, Philippines','Albay','Camarines Norte','Camarines Sur','Catanduanes','Masbate','Sorsogon'].map(name=><option key={name}>{name}</option>)}</select></label><label>Location<input readOnly={isStored} value={place} onChange={e=>setPlace(e.target.value)} minLength={2} maxLength={160} required/></label>
          {areas.length>0&&<label>Or select a monitoring area<select disabled={isStored} defaultValue="" onChange={e=>{if(e.target.value)setPlace(e.target.value)}}><option value="">Choose a configured area</option>{areas.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></label>}
          <div className="prediction-fields"><label>Latitude (optional for a regional dataset)<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="Dataset latitude"/></label><label>Longitude (optional for a regional dataset)<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="Dataset longitude"/></label></div>
          <label>Dataset source<input readOnly={isStored} value={source} onChange={e=>setSource(e.target.value)} minLength={2} maxLength={500} required placeholder="Source name or URL for these observations"/></label></>}
          {inputMode==='upload'&&<div className="dataset-import"><h4>Import location observations</h4><p>Daily: one row. LSTM: 14 consecutive daily rows, oldest first. Use the documented weather features and units; do not substitute missing values with zero.</p><button type="button" className="btn secondary small" onClick={downloadTemplate}>Download CSV headers</button><label>CSV or JSON file<input key={model} type="file" accept=".csv,.json,text/csv,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void importDataset(file)}}/></label>{dataset&&<p role="status">Validated: {fileName} ({dataset.model==='daily'?'1 day':'14 days'}). <button type="button" className="text-link" onClick={()=>{setDataset(null);setFileName('');setIsStored(false);setInputMode('manual')}}>Use manual entry</button></p>}</div>}
          {isStored&&dataset&&<div className="dataset-import"><b>Historical evaluation inputs loaded</b><p>{dataset.model==='daily'?`Observation: ${dataset.observation.observation_date}; hotspots: ${dataset.observation.hotspots_today}; previous 7-day mean: ${dataset.observation.hotspots_prev7_mean.toFixed(2)}`:`${dataset.observations.length} days ending ${dataset.observations[dataset.observations.length-1].observation_date}`}</p><details><summary>Review loaded values</summary><pre>{JSON.stringify(dataset,null,2)}</pre></details></div>}
          <p className="prediction-help">Location and source are saved with your prediction. The model receives observation values, not coordinates. Bicol accuracy depends on model training coverage and the dataset you supply.</p>
          {inputMode==='manual'&&!dataset&&<div className="manual-observations">
          {model==='daily' ? <>
            <label>Observation date<input name="observation_date" type="date" required defaultValue={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}/></label>
            <div className="prediction-fields">{fields.map(([key,label])=><label key={key}>{label} ({key})<input name={key} type="number" step="any" required/></label>)}</div>
            <div className="prediction-fields"><label>Hotspots today<input name="hotspots_today" type="number" min="0" step="1" required/></label><label>Mean hotspots, previous 7 days<input name="hotspots_prev7_mean" type="number" min="0" step="any" required/></label></div>
          </> : <>
            <p className="prediction-help">Paste 14 consecutive observations in oldest-first order. Each row must include the date, all 10 weather features, and <code>total_hotspots</code>. The model API currently expects exactly 14 rows.</p>
            <label>Daily observations (JSON)<textarea name="observations" rows={15} required placeholder={emptyLstmExample}/></label>
          </>}
          </div>}
          {error&&<div className="form-error" role="alert">{error}</div>}
          <button className="btn primary" disabled={busy||datasetBusy||(inputMode!=='manual'&&!dataset)}>{busy?<><LoaderCircle size={15} className="spin"/> Running model and saving result…</>:<><Save size={15}/> Predict and save</>}</button>
        </form>}
        {inputMode==='stored'&&!dataset&&error&&<div className="form-error" role="alert">{error}</div>}
      </Card>
      <div className="prediction-results">
        {result&&<Card className="prediction-result-card"><p className="prediction-help">High hotspot activity is the model target. This is not the probability that a new wildfire will ignite.</p><div className="card-head"><div><div className="eyebrow">SAVED MODEL RESULT</div><h3>{result.high_activity?'High activity predicted':'High activity not predicted'}</h3></div><Badge tone={result.high_activity?'active':'contained'}>{result.high_activity?'High activity':'Below threshold'}</Badge></div><div className="prediction-probability">{(result.high_activity_probability*100).toFixed(1)}<span>%</span><small>Probability of high hotspot activity</small></div><div className="detail-row"><span>Predicted class</span><b>{result.predicted_class}</b></div><div className="detail-row"><span>Observation date</span><b>{result.observation_date}</b></div><div className="detail-row"><span>Prediction date</span><b>{result.prediction_date}</b></div><div className="detail-row"><span>Hotspot threshold</span><b>{result.high_activity_hotspot_threshold}</b></div></Card>}
        <Card className="prediction-history"><div className="card-head"><div><h3>Saved predictions</h3><p>Latest predictions recorded in Supabase</p></div><Clock3 size={18}/></div>
          {loadError&&<div className="form-error">{loadError}</div>}
          {records.length===0&&!loadError&&<div className="empty-inline"><span>No prediction records yet. Run a model to save its result here.</span></div>}
          {records.map(record=><details key={record.prediction_id} className="prediction-record"><summary><span><b>{record.model_name==='lstm'?'LSTM':'Daily'} model</b><small>{new Date(record.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</small></span><Badge tone={record.prediction_status==='succeeded'?'contained':record.prediction_status==='failed'?'closed':'requested'}>{record.prediction_status}</Badge></summary>{record.prediction_result?<><div className="detail-row"><span>High activity</span><b>{record.prediction_result.high_activity?'Yes':'No'}</b></div><div className="detail-row"><span>High hotspot activity probability</span><b>{(record.prediction_result.high_activity_probability*100).toFixed(1)}%</b></div><div className="detail-row"><span>Prediction date</span><b>{record.prediction_result.prediction_date}</b></div></>:record.error_message&&<p className="prediction-error">{record.error_message}</p>}<pre>{JSON.stringify(record.observation_data,null,2)}</pre></details>)}
        </Card>
      </div>
    </div>
    </>}
  </>;
}
