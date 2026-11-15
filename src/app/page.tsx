'use client';

import {useEffect,useRef,useState} from 'react';

import {MapPin,Flame,X,ChevronDown,LogOut,Search,Plus,Map,Users,AlertTriangle,Activity,Satellite,RefreshCw,ShieldCheck,ClipboardList,Check,MoreHorizontal,Pencil,ChevronRight,FileText} from 'lucide-react';

import {PaginatedTable,PaginatedItems} from '@/components/PaginatedTable';
import {AdminDashboard} from '@/components/AdminDashboard';
import {Login} from '@/components/Login';

import {WorkspaceTools,NotificationCenter,WarningDelivery} from '@/components/WorkspaceTools';
import {ResponderWorkspace,FirefighterWorkspace,LandManagerWorkspace} from '@/components/RoleWorkspaces';
import {deleteFieldKit} from '@/lib/offline-field';
import {triageCases} from '@/lib/role-workspaces';
import {PredictionWorkspace} from '@/components/PredictionWorkspace';

import {Badge,Card,Heading,Metric,MapView,nav,Person,EmptyState} from '@/components/ui';

import {roles,Role,User,Area,WildfireCase,FieldReport,Warning,AuditLog} from '@/lib/types';

import type {ResearchSummary} from '@/lib/research-types';

import {formatDate} from '@/lib/format';

import {apiRequest,currentProfile,fromDbRole,signOut} from '@/lib/services';

export default function Home(){

const modalRef=useRef<HTMLDivElement>(null);

const [dataLoading,DataLoading]=useState(true),[research,Research]=useState<ResearchSummary|null>(null),[analysisPhase,AnalysisPhase]=useState<'pre'|'during'|'post'>('pre');

const [dataErrors,DataErrors]=useState<string[]>([]);

const [auth,A]=useState<{id:string;email:string;fullName:string;role:Role}|null>(null),[authChecked,AuthChecked]=useState(false),[page,P]=useState('overview'),[users,U]=useState<User[]>([]),[areas,AR]=useState<Area[]>([]),[cases,C]=useState<WildfireCase[]>([]),[reports,FR]=useState<FieldReport[]>([]),[warnings,W]=useState<Warning[]>([]),[logs,Logs]=useState<AuditLog[]>([]),[sync,Sync]=useState<any[]>([]),[dailyActivity,DailyActivity]=useState<{date:string;count:number;level:number}[]>([]),[recovery,Recovery]=useState<any[]>([]),[selected,Sel]=useState(''),[query,Q]=useState(''),[filter,F]=useState('All'),[modal,Modal]=useState(''),[edit,Edit]=useState<User|null>(null),[areaEdit,AE]=useState<Area|null>(null),[profile,Prof]=useState(false),[notice,N]=useState('');

const [casePageSize,CasePageSize]=useState(4);
useEffect(()=>{const query=window.matchMedia('(max-height:800px)');const update=()=>CasePageSize(query.matches?2:4);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);

const [toolsIntent,ToolsIntent]=useState('map'),[recordCase,RecordCase]=useState(''),[landArea,LandArea]=useState('');

const role=auth?.role||'Admin',items=nav[role].items,me:User=auth?{id:auth.id,name:auth.fullName,email:auth.email,role:auth.role,active:true}:{id:'',name:'',email:'',role:'Admin',active:false};

const eligibleCases=role==='Firefighter'?triageCases(cases):role==='Emergency Responder'? [...triageCases(cases),...cases.filter(c=>!['Watch','Active'].includes(c.status))]:cases;

const shown=eligibleCases.filter(c=>(filter==='All'||c.status===filter)&&`${c.id} ${c.location} ${c.area}`.toLowerCase().includes(query.toLowerCase()));

const activeCase=shown.find(c=>c.id===selected)||shown[0];

function toast(s:string){N(s);setTimeout(()=>N(''),3200)}

function pickPage(id:string){if(id.startsWith('land-area:')){LandArea(id.slice(10));id='overview'}if(id.startsWith('record-observation')){RecordCase(id.split(':')[1]||'');ToolsIntent('record');id='tools'}else if(id==='tools')ToolsIntent('map');if(!nav[role].items.some(item=>item.id===id))id='overview';P(id);const target=new URL(window.location.href);if(target.searchParams.get('page')!==id){target.searchParams.set('page',id);window.history.pushState({page:id},'',target)}Q('');F('All');Prof(false)}

useEffect(()=>{const nav=document.querySelector('.workspace-nav');if(!nav)return;const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--workspace-nav-height',nav.getBoundingClientRect().height+'px'));observer.observe(nav);return()=>observer.disconnect()},[authChecked,auth?.id]);

useEffect(()=>{window.scrollTo({top:0});document.querySelector('.content')?.scrollTo({top:0});},[page]);

useEffect(()=>{if(!auth)return;const readPage=()=>{const target=new URLSearchParams(window.location.search).get('page')||'overview';P(nav[auth.role].items.some(item=>item.id===target)?target:'overview');Prof(false)};readPage();window.addEventListener('popstate',readPage);return()=>window.removeEventListener('popstate',readPage)},[auth?.role]); // eslint-disable-line react-hooks/exhaustive-deps

function openAnalysis(phase:'pre'|'during'|'post'='pre'){AnalysisPhase(phase);pickPage('predictions')}

const loadCases=async()=>{const r=await apiRequest<{cases:WildfireCase[]}>('/api/cases');C(r.cases);if(!selected&&r.cases.length)Sel(r.cases[0].id)};

const loadAreas=async()=>{const r=await apiRequest<{areas:Area[]}>('/api/areas');AR(r.areas)};

const loadRecovery=async()=>{const result=await apiRequest<{recovery:any[]}>('/api/recovery');Recovery(result.recovery)};

const loadUsers=async()=>{const r=await apiRequest<{users:any[]}>('/api/admin/users');U(r.users.map(x=>({id:x.id,name:x.full_name,email:x.email,role:fromDbRole(x.role),active:x.account_status==='active',accountStatus:x.account_status})))};

useEffect(()=>{let alive=true;currentProfile().then((r)=>{if(!alive)return;if(r?.user)A({id:r.user.id,email:r.user.email,fullName:r.user.fullName,role:fromDbRole(r.user.role)});AuthChecked(true)}).catch(()=>{if(alive)AuthChecked(true)});return()=>{alive=false}},[]);

useEffect(()=>{

 if(!auth)return;

 let alive=true;

 DataLoading(true);DataErrors([]);Research(null);C([]);AR([]);U([]);FR([]);W([]);Logs([]);Sync([]);DailyActivity([]);Recovery([]);Sel('');

 async function load<T,>(label:string,path:string,apply:(value:T)=>void){

  try{const value=await apiRequest<T>(path);if(alive)apply(value)}

  catch(error){if(alive)DataErrors(previous=>[...previous,`${label}: ${(error as Error).message}`])}

 }

 const jobs:Promise<void>[]=[

  load<ResearchSummary>('Research datasets','/api/datasets',r=>Research(r)),

  load<{cases:WildfireCase[]}>('Cases','/api/cases',r=>{C(r.cases);Sel(r.cases[0]?.id||'')}),

  load<{areas:Area[]}>('Monitoring areas','/api/areas',r=>AR(r.areas)),

 ];

 if(auth.role!=='Firefighter')jobs.push(load<{activity:{month:string;count:number}[];dailyActivity:{date:string;count:number;level:number}[]}>('Satellite observations','/api/activity',r=>{DailyActivity(r.dailyActivity)}));

 if(auth.role==='Admin'){

  jobs.push(load<{users:any[]}>('User accounts','/api/admin/users',r=>U(r.users.map(x=>({id:x.id,name:x.full_name,email:x.email,role:fromDbRole(x.role),active:x.account_status==='active',accountStatus:x.account_status})))));

  jobs.push(load<{logs:AuditLog[];sync:any[]}>('System activity','/api/admin/system',r=>{Logs(r.logs);Sync(r.sync)}));

 }

 if(auth.role==='Land Manager')jobs.push(load<{recovery:any[]}>('Recovery','/api/recovery',r=>Recovery(r.recovery)));

 if(auth.role==='Emergency Responder')jobs.push(load<{warnings:any[]}>('Warnings','/api/warnings',r=>W(r.warnings.map(x=>({id:x.warning_id,caseId:x.case_id,title:x.warning_title,message:x.warning_message,status:x.warning_status==='reviewed'?'Reviewed':'Draft',createdAt:x.created_at})))));


 if(auth.role==='Firefighter')jobs.push(load<{reports:any[]}>('Field reports','/api/field-reports',r=>FR(r.reports.map(x=>({id:x.report_id,caseId:x.case_reference||x.case_id,result:x.verification_result,incident:x.incident_status,remarks:x.remarks||'',photo:x.photo_url||undefined,submittedAt:x.submitted_at})))));

 void Promise.allSettled(jobs).then(()=>{if(alive)DataLoading(false)});

 return()=>{alive=false};

},[auth]);

useEffect(()=>{

 const previous=document.body.style.overflow;

 if(modal)document.body.style.overflow='hidden';

 const focusBefore=document.activeElement as HTMLElement|null;

 if(modal)modalRef.current?.querySelector<HTMLElement>('button,input,select,textarea')?.focus();

 function keyboard(event:KeyboardEvent){

  if(event.key==='Escape'){Modal('');Prof(false)}

  if(event.key==='Tab'&&modal&&modalRef.current){

   const controls=Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'));

   const first=controls[0],last=controls[controls.length-1];

   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}

   if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}

  }

 }

 function outside(event:PointerEvent){if(event.target instanceof Element&&!event.target.closest('.profile-wrap'))Prof(false)}

 document.addEventListener('keydown',keyboard);document.addEventListener('pointerdown',outside);

 return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',keyboard);document.removeEventListener('pointerdown',outside);if(modal)focusBefore?.focus()};

},[modal]);



async function logout(){try{if(auth)await deleteFieldKit(auth.id)}catch{}try{await signOut()}catch{}A(null);P('overview');Prof(false)}

function onLogin(value:{id:string;email:string;fullName:string;role:Role}){A(value);P('overview')}

async function req(c:WildfireCase){try{await apiRequest('/api/verification-requests',{method:'POST',body:JSON.stringify({caseId:c.caseId,note:'Please verify this satellite detection in the field.'})});await loadCases();toast('Verification request recorded.')}catch(e){toast((e as Error).message)}}

async function submitReport(form:FormData){try{await apiRequest('/api/field-reports',{method:'POST',body:form});await Promise.all([loadCases(),apiRequest<{reports:any[]}>('/api/field-reports').then(r=>FR(r.reports.map(x=>({id:x.report_id,caseId:x.case_reference||x.case_id,result:x.verification_result,incident:x.incident_status,remarks:x.remarks||'',photo:x.photo_url||undefined,submittedAt:x.submitted_at}))))]);toast('Field report saved.')}catch(e){throw e}}

if(!authChecked)return <main className="login-loading">Connecting to FireCase…</main>;

if(!auth)return <Login onLogin={onLogin}/>;



return <div className="app-shell"><main className="main-area"><header className="topbar"><button className="top-brand" onClick={()=>pickPage('overview')}><Flame size={25} fill="currentColor"/><b>FireCase</b></button><div className="breadcrumbs">{nav[role].group} <span>/</span> <b>{items.find(x=>x.id===page)?.label||'Overview'}</b></div><div className="header-right">{page==='map'&&<div className="header-search"><Search size={16}/><input aria-label="Search current page" placeholder="Search cases..." value={query} onChange={e=>Q(e.target.value)}/></div>}<NotificationCenter userId={me.id} cases={cases} warnings={warnings} logs={logs} errors={dataErrors}/><span className="header-role">{role}</span><div className="profile-wrap"><button className="header-profile" aria-label="Open account menu" aria-expanded={profile} onClick={()=>Prof(!profile)}><i>{(me.name.trim()||me.email||'U').split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase()}</i><span>{me.name.trim().split(/\s+/)[0]||'Account'}</span><ChevronDown size={14}/></button>{profile&&<div className="profile-menu top-profile"><button onClick={()=>{Prof(false);toast(me.email)}}><ShieldCheck size={15}/> Account details</button><button onClick={logout}><LogOut size={15}/> Sign out</button></div>}</div></div></header><nav className="workspace-nav" aria-label="Main navigation"><div className="workspace-links">{items.map(({id,label,icon:Icon})=><button key={id} aria-label={label} aria-current={page===id?'page':undefined} onClick={()=>pickPage(id)}><Icon size={18}/><span>{label}</span>{id==='warnings'&&warnings.length>0&&<em aria-label={warnings.length+' warnings'}>{warnings.length}</em>}</button>)}</div><label className="mobile-page-nav">Go to<select aria-label="Navigate to page" value={page} onChange={e=>pickPage(e.target.value)}>{items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></nav><div className="content">{cases.some(c=>c.id.startsWith('DEMO-'))&&<div className="synthetic-records-banner" role="status"><b>Synthetic demo records</b><span>Records marked DEMO are fictional training data. Existing historical observations are separate.</span></div>}

{!dataLoading&&role==='Emergency Responder'&&page==='overview'&&<ResponderWorkspace userId={me.id} cases={cases} areas={areas} hotspots={research?.sampleHotspots} onNavigate={pickPage} onRequest={req}/>}
{!dataLoading&&role==='Firefighter'&&['overview','cases'].includes(page)&&<FirefighterWorkspace userId={me.id} cases={cases} areas={areas} reports={reports} onNavigate={pickPage} onReport={submitReport}/>}
{!dataLoading&&role==='Land Manager'&&['overview','calendar','recovery'].includes(page)&&<LandManagerWorkspace key={landArea} initialArea={landArea} initialCaseId={recordCase} userId={me.id} cases={cases} areas={areas} recovery={recovery} dailyActivity={dailyActivity} onNavigate={pickPage} section={page==='calendar'?'calendar':page==='recovery'?'recovery':'all'}/>}

{!dataLoading&&page==='tools'&&<WorkspaceTools key={toolsIntent+recordCase} initialView={toolsIntent} initialCaseId={recordCase} userId={me.id} role={role} cases={cases} areas={areas} hotspots={research?.sampleHotspots} onAreasChanged={loadAreas} onRecoveryChanged={loadRecovery} onNavigate={pickPage}/>}

{dataErrors.length>0&&<div className="alert-error" role="alert"><b>Some data could not be loaded</b>{dataErrors.map(message=><p key={message}>{message}</p>)}<button className="btn secondary small" onClick={()=>{if(auth)A({...auth})}}>Retry loading</button></div>}

{dataLoading&&<div className="loading-indicator" role="status"><RefreshCw size={15} className="spin"/> Loading cases, areas and account records...</div>}

{!dataLoading&&!activeCase&&!['Firefighter'].includes(role)&&['cases','map'].includes(page)&&<><Heading eyebrow={nav[role].group.toUpperCase()} title={page==='map'?'Fire monitoring map':role==='Firefighter'?'Active cases':'Wildfire cases'} sub="Operational case records and field verification for your workspace."/><Card className="case-empty-card"><div className="empty-card-label"><span className="status-dot"/> {dataLoading?'Checking case records':'Case records'}</div><EmptyState title={dataLoading?'Loading cases...':eligibleCases.length?'No matching cases':'No active case to display'} description={dataLoading?'Your permitted records are being loaded.':eligibleCases.length?'Try a different search or clear your filters to see the available cases.':'There are no case records available for your account. Historical satellite detections are available separately in Wildfire analysis.'} action={!dataLoading&&<>{eligibleCases.length>0&&<button className="btn secondary" onClick={()=>{Q('');F('All')}}>Clear filters</button>}<button className="btn primary" onClick={()=>openAnalysis('during')}><Satellite size={16}/> View Bicol observations</button><button className="btn secondary" onClick={()=>pickPage('overview')}>Back to overview</button></>}/></Card><div className="empty-guidance"><Card><Satellite size={20}/><h3>Explore historical data</h3><p>{research?`${research.hotspots.count.toLocaleString()} imported Bicol hotspot observations are available for research.`:'Open Wildfire analysis to inspect imported Bicol observations.'}</p><button className="text-link" onClick={()=>openAnalysis('during')}>View observations <ChevronRight size={15}/></button></Card><Card><ClipboardList size={20}/><h3>Field verification</h3><p>{role==='Firefighter'?'Reports can be submitted when a case is available to your account.':'Case records track incident status, verification, and response activity.'}</p>{role==='Firefighter'&&<button className="text-link" onClick={()=>pickPage('reports')}>View your reports <ChevronRight size={15}/></button>}</Card><Card><Activity size={20}/><h3>Evaluate fire activity</h3><p>Use stored observations to review historical Daily and LSTM predictions.</p><button className="text-link" onClick={()=>openAnalysis()}>Open analysis <ChevronRight size={15}/></button></Card></div></>}

{!dataLoading&&page==='overview'&&role==='Admin'&&<AdminDashboard users={users} areas={areas} cases={cases} logs={logs} onNavigate={pickPage} onCreateUser={()=>{Edit(null);Modal('user')}}/>}

{!dataLoading&&page==='users'&&role==='Admin'&&<><Heading eyebrow="ADMINISTRATION / USERS" title="User management" sub="Manage access, role assignments, and account status." action={<button className="btn primary" onClick={()=>{Edit(null);Modal('user')}}><Plus size={16}/> Create user</button>}/><Card className="table-card"><div className="table-tools"><div className="searchbox"><Search size={16}/><input placeholder="Search name or email" value={query} onChange={e=>Q(e.target.value)}/></div><select aria-label="Filter records" value={filter} onChange={e=>F(e.target.value)}><option>All</option>{roles.map(r=><option key={r}>{r}</option>)}</select><span>{users.filter(u=>(filter==='All'||u.role===filter)&&`${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase())).length} accounts</span></div><PaginatedTable key={query+filter}><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last active</th><th/></tr></thead><tbody>{!users.some(u=>(filter==='All'||u.role===filter)&&`${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()))&&<tr><td colSpan={5}><EmptyState compact icon={Users} title="No matching accounts" description="Try another name, email, or role filter."/></td></tr>}{users.filter(u=>(filter==='All'||u.role===filter)&&`${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase())).map(u=><tr key={u.id}><td><Person user={u}/></td><td>{u.role}</td><td><Badge tone={u.active?'contained':'closed'}>{u.active?'Active':u.accountStatus==='pending'?'Pending approval':'Inactive'}</Badge></td><td className="muted">Not recorded</td><td><button className="icon-button" disabled={u.role==='Admin'} title={u.role==='Admin'?'Administrator roles are managed separately':'Edit role'} onClick={()=>{Edit(u);Modal('user')}} aria-label="Edit account"><Pencil size={15}/></button><button className="icon-button" onClick={()=>{apiRequest('/api/admin/users',{method:'PATCH',body:JSON.stringify({id:u.id,accountStatus:u.active?'inactive':'active'})}).then(()=>loadUsers()).then(()=>toast(`Account ${u.active?'deactivated':'activated'}.`)).catch(error=>toast(error.message))}} disabled={u.role==='Admin'&&u.accountStatus!=='pending'} aria-label={(u.active?'Deactivate ':u.accountStatus==='pending'?'Approve ':'Activate ')+u.name}>{u.active?'Deactivate':u.accountStatus==='pending'?'Approve':'Activate'}</button></td></tr>)}</tbody></table></PaginatedTable></Card><div className="notice"><ShieldCheck size={18}/><div><b>Role access is controlled by Admin</b><span>Emergency Responder, Firefighter, and Land Manager roles are assigned by administrators.</span></div></div></>}

{!dataLoading&&page==='areas'&&role==='Admin'&&<><Heading eyebrow="ADMINISTRATION / GEOGRAPHY" title="Monitoring areas" sub="Manage geographic coverage and Land Manager assignments." action={<button className="btn primary" onClick={()=>{AE(null);Modal('area')}}><Plus size={16}/> Add monitoring area</button>}/><div className="area-layout"><Card><div className="card-head"><div><h3>Area boundaries</h3><p>Stored records</p></div></div><MapView cases={cases} boundaries={areas.map(a=>a.boundary).filter(Boolean)}/></Card><Card><div className="card-head"><div><h3>Managed areas</h3><p>{areas.length} areas configured</p></div></div>{areas.length===0&&<EmptyState compact icon={Map} title="No monitoring areas yet" description="Add an area boundary, then assign a Land Manager to give them access." action={<button className="btn secondary" onClick={()=>{AE(null);Modal('area')}}>Add your first area</button>}/>} <PaginatedItems pageSize={4}>{areas.map(a=><div className="area-row" key={a.id}><i><MapPin size={17}/></i><div><b>{a.name}</b><span>{a.region}  /  {a.hectares.toLocaleString()} ha</span><small>{a.coordinates}</small></div><button className="icon-button" aria-label={'Edit area '+a.name} onClick={()=>{AE(a);Modal('area')}}><MoreHorizontal size={17}/></button></div>)}</PaginatedItems></Card></div></>}

{!dataLoading&&page==='predictions'&&<PredictionWorkspace areas={areas} cases={cases} role={role} initialPhase={analysisPhase} onNavigate={pickPage}/>}

{!dataLoading&&page==='system'&&role==='Admin'&&<><Heading eyebrow="ADMINISTRATION / SYSTEM" title="System activity" sub="Latest satellite synchronization status and audit records."/><div className="metrics four"><Metric label="Latest sync" value={sync[0]?.sync_status||'No records'} change={sync[0]?.data_source||'No sync recorded'} icon={Satellite}/><Metric label="Last completed" value={sync[0]?.completed_at?new Date(sync[0].completed_at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}):'Unavailable'} change="Stored sync record" icon={RefreshCw} tone="green"/><Metric label="Failed syncs" value={`${sync.filter(x=>x.sync_status==='failed').length}`} change="Visible sync history" icon={AlertTriangle} tone="blue"/><Metric label="Audit events" value={`${logs.length}`} change="Latest 100 events" icon={Activity} tone="purple"/></div><Card className="table-card"><div className="card-head"><div><h3>Recent activity</h3><p>Administrative and case operations</p></div></div><PaginatedItems pageSize={6} compactSize={4}>{logs.map((x,i)=><div className="log-line" key={i}><i><Activity size={15}/></i><div><b>{x.action}</b><span>{x.actor} · {formatDate(x.time)}</span></div></div>)}</PaginatedItems>{logs.length===0&&<div className="empty-inline"><span>No audit events recorded.</span></div>}</Card><div className="notice"><AlertTriangle size={18}/><div><b>Satellite ingestion is not configured</b><span>Synchronization status reflects stored job logs. There is no ingestion worker connected yet.</span></div></div></>}

{!dataLoading&&activeCase&&(page==='cases'||page==='map')&&(role==='Emergency Responder'||role==='Admin')&&<section className={page==='cases'?'case-workspace':'map-workspace'}><Heading eyebrow="OPERATIONS / PRIORITIZATION" title={page==='map'?'Fire monitoring map':'Wildfire case queue'} sub="Review shared case lifecycle, risk priority, and verification status."/>{page==='map'?<div className="monitor-layout"><Card><div className="card-head"><div><h3>Regional monitoring map</h3><p>Select a case marker to inspect its record</p></div><select aria-label="Filter records" value={filter} onChange={e=>F(e.target.value)}><option>All</option>{['Watch','Active','Recovery','Closed'].map(x=><option key={x}>{x}</option>)}</select></div><MapView cases={shown} onPick={c=>Sel(c.id)}/></Card><Card className="case-summary"><div className="eyebrow">SELECTED CASE</div><h2>{activeCase.id}</h2><Badge>{activeCase.status}</Badge><p><MapPin size={15}/>{activeCase.location}</p><div className="summary-row"><span>Risk</span><b>{activeCase.risk}</b></div><div className="summary-row"><span>Detection</span><b>{formatDate(activeCase.detected)}</b></div><div className="summary-row"><span>Verification</span><b>{activeCase.verification}</b></div>{role==='Emergency Responder'&&<button className="btn primary full" onClick={()=>req(activeCase)}><ClipboardList size={16}/> Request ground verification</button>}</Card></div>:<><div className="table-tools"><div className="searchbox"><Search size={16}/><input placeholder="Search case, location, area" value={query} onChange={e=>Q(e.target.value)}/></div><select aria-label="Filter records" value={filter} onChange={e=>F(e.target.value)}><option>All</option>{['Watch','Active','Recovery','Closed'].map(x=><option key={x}>{x}</option>)}</select><span>{shown.length} cases</span></div><div className="case-layout"><Card className="case-list"><PaginatedItems key={query+filter} pageSize={casePageSize} compactSize={3}>{shown.map(c=><button key={c.id} className={'case-list-item '+(activeCase.id===c.id?'selected':'')} onClick={()=>Sel(c.id)}><span className="case-list-top"><b>{c.id}</b><Badge>{c.status}</Badge></span><span>{c.location}</span><span className="case-list-bottom">{formatDate(c.detected)}<i>{c.risk} risk</i></span></button>)}</PaginatedItems></Card><Card className="case-detail"><div className="case-detail-head"><div><div className="eyebrow">CASE DETAILS</div><h2>{activeCase.id}</h2></div></div><div className="badge-row"><Badge>{activeCase.status}</Badge><Badge tone={activeCase.verification==='Confirmed'?'contained':'watch'}>{activeCase.verification}</Badge><Badge tone={activeCase.incident==='Out'?'closed':'active'}>Incident: {activeCase.incident}</Badge></div><MapView cases={[activeCase]}/><div className="facts">{[['Location',activeCase.location],['Monitoring area',activeCase.area],['Detection time',formatDate(activeCase.detected)],['Risk priority',activeCase.risk],['Satellite FRP',activeCase.intensity===null?'Not supplied':`${activeCase.intensity} MW`],['Satellite information',activeCase.source]].map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div><div className="action-row">{role==='Emergency Responder'&&activeCase.verification==='Unverified'&&<button className="btn primary" onClick={()=>req(activeCase)}><ClipboardList size={15}/> Request verification</button>}<button className="btn secondary" onClick={()=>Modal('status')}>Update incident status</button></div><div className="case-history"><b>Case history</b><span>Detection entered  /  {formatDate(activeCase.detected)}<small>Database record</small></span><span>Lifecycle status  /  {activeCase.status}<small>Current</small></span>{reports.filter(x=>x.caseId===activeCase.id).map(x=><span key={x.id}>Field report  /  {x.submittedAt}<small>{x.result}  /  Incident {x.incident}</small></span>)}</div></Card></div></>}</section>}

{!dataLoading&&page==='warnings'&&role==='Emergency Responder'&&<><Heading eyebrow="OPERATIONS / COMMUNICATIONS" title="Warning drafts" sub="Compose case warnings, review them, and send through your configured delivery provider." action={<button className="btn primary" disabled={!activeCase} onClick={()=>Modal('warning')}><Plus size={16}/> Draft warning</button>}/>{warnings.length===0?<Card className="empty-state"><AlertTriangle/><h3>No warning drafts yet</h3><p>{activeCase?'Prepare a warning linked to a case, then mark it reviewed.':'A case must be available before you can create a warning draft. Explore historical Bicol data while awaiting an incident.'}</p><button className="btn secondary" disabled={!activeCase} onClick={()=>Modal('warning')}>Create draft</button></Card>:<PaginatedItems className="warning-list" pageSize={4} compactSize={2}>{warnings.map(w=><Card key={w.id}><div className="card-head"><b>{w.caseId}</b><Badge tone={w.status==='Reviewed'?'contained':'watch'}>{w.status}</Badge></div><h3>{w.title}</h3><p>{w.message}</p><WarningDelivery warning={w}/><button className="btn secondary small" onClick={()=>{apiRequest('/api/warnings',{method:'PATCH',body:JSON.stringify({id:w.id,status:'reviewed'})}).then(()=>apiRequest<{warnings:any[]}>('/api/warnings')).then(r=>W(r.warnings.map(x=>({id:x.warning_id,caseId:cases.find(c=>c.caseId===x.case_id)?.id||x.case_id,title:x.warning_title,message:x.warning_message,status:x.warning_status==='reviewed'?'Reviewed':'Draft',createdAt:x.created_at})))) .then(()=>toast('Warning marked reviewed.')).catch(error=>toast(error.message))}}><Check size={15}/> Review</button></Card>)}</PaginatedItems>}<div className="notice"><AlertTriangle size={18}/><div><b>Warning delivery</b><span>Review a draft before sending. Delivery uses the server-configured provider and recipients.</span></div></div></>}

{!dataLoading&&page==='reports'&&role==='Firefighter'&&<><Heading eyebrow="FIELD OPERATIONS / REPORTS" title="Field reports" sub="Reports available to your account."/><Card className="table-card">{reports.length===0?<div className="empty-state"><FileText/><h3>No reports available</h3><p>Reports will appear here when they are available to your account.</p><button className="btn secondary" onClick={()=>pickPage('cases')}>Open active cases</button></div>:<PaginatedTable key={query+filter}><table><thead><tr><th>Report</th><th>Case</th><th>Verification</th><th>Incident status</th><th>Submitted</th></tr></thead><tbody>{reports.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.caseId}</td><td><Badge tone="contained">{r.result}</Badge></td><td><Badge>{r.incident}</Badge></td><td>{formatDate(r.submittedAt)}</td></tr>)}</tbody></table></PaginatedTable>}</Card></>}

{!dataLoading&&role==='Land Manager'&&page==='areas'&&<><Heading eyebrow="LAND & RECOVERY / AREAS" title="My monitoring areas" sub="Assigned landscape boundaries and fire activity."/>{areas.filter(a=>a.managerId===me.id).length===0&&<Card><EmptyState icon={Map} title="No monitoring areas assigned" description="Ask your administrator to assign an area. You can explore the shared historical Bicol dataset in the meantime." action={<button className="btn primary" onClick={()=>openAnalysis('during')}>Explore Bicol observations</button>}/></Card>}<PaginatedItems className="assigned-grid" pageSize={3} compactSize={1}>{areas.filter(a=>a.managerId===me.id).map(a=><Card key={a.id}><MapView cases={cases.filter(c=>c.area===a.name)} boundaries={a.boundary?[a.boundary]:[]}/><div className="assigned-info"><div className="eyebrow">{a.region}</div><h3>{a.name}</h3><p>{a.hectares.toLocaleString()} hectares  /  {a.coordinates}</p><button className="btn secondary small" onClick={()=>{pickPage('land-area:'+a.name)}}>View activity <ChevronRight size={15}/></button></div></Card>)}</PaginatedItems></>}

{modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)Modal('')}}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={modal==='user'?'Manage user':modal==='area'?'Monitoring area':modal==='warning'?'Warning draft':'Update case'}><div className="modal-head"><div><div className="eyebrow">{modal==='user'?'ADMINISTRATION':modal==='area'?'GEOGRAPHY':modal==='warning'?'COMMUNICATIONS':'CASE UPDATE'}</div><h2>{modal==='user'?(edit?'Edit user':'Create user'):modal==='area'?(areaEdit?'Edit monitoring area':'Add monitoring area'):modal==='warning'?'Draft warning':'Update incident status'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={()=>Modal('')}><X size={18}/></button></div>

{modal==='user'&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')),email=String(f.get('email')),r=String(f.get('role')) as Role;try{const roleMap:Record<string,string>={'Emergency Responder':'emergency_responder','Firefighter':'firefighter','Land Manager':'land_manager'};if(edit)await apiRequest('/api/admin/users',{method:'PATCH',body:JSON.stringify({id:edit.id,role:roleMap[r]})});else await apiRequest('/api/admin/users',{method:'POST',body:JSON.stringify({fullName:name,email,role:roleMap[r]})});await loadUsers();Modal('');toast(edit?'User changes saved.':'Invitation sent to the user.')}catch(error){toast((error as Error).message)}}}><label>Full name</label><input aria-label="Full name" name="name" required readOnly={Boolean(edit)} defaultValue={edit?.name} placeholder="Name"/><label>Email address</label><input aria-label="Email address" name="email" type="email" required readOnly={Boolean(edit)} defaultValue={edit?.email} placeholder="name@organization.gov"/><label>Assigned role</label><select aria-label="Assigned role" name="role" defaultValue={edit?.role||'Emergency Responder'}>{roles.filter(x=>x!=='Admin').map(r=><option key={r}>{r}</option>)}</select><p className="form-help">{edit?'Change this account’s assigned role.':'The user receives an invitation to set up their account.'}</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>Modal('')}>Cancel</button><button className="btn primary">{edit?'Save changes':'Create user'}</button></div></form>}

{modal==='area'&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);let boundary:any;try{boundary=JSON.parse(String(f.get('boundary')))}catch{toast('Boundary must be valid GeoJSON Polygon.');return}const managerId=String(f.get('managerId')||'')||null;try{let areaId=areaEdit?.id;if(areaEdit)await apiRequest('/api/areas',{method:'PATCH',body:JSON.stringify({id:areaEdit.id,name:String(f.get('name')),description:String(f.get('description')||''),boundary,isActive:true})});else{const created=await apiRequest<{id:string}>('/api/areas',{method:'POST',body:JSON.stringify({name:String(f.get('name')),description:String(f.get('description')||''),boundary})});areaId=created.id}if(areaId&&areaEdit?.managerId&&areaEdit.managerId!==managerId)await apiRequest('/api/areas/assignments',{method:'DELETE',body:JSON.stringify({areaId,userId:areaEdit.managerId})});if(areaId&&managerId&&managerId!==areaEdit?.managerId)await apiRequest('/api/areas/assignments',{method:'POST',body:JSON.stringify({areaId,userId:managerId})});await loadAreas();Modal('');toast('Monitoring area saved.')}catch(error){toast((error as Error).message)}}}><label>Area name</label><input aria-label="Area name" name="name" required defaultValue={areaEdit?.name}/><label>Area description / region</label><input aria-label="Area description" name="description" defaultValue={areaEdit?.region}/><label>Assign Land Manager</label><select aria-label="Land manager" name="managerId" defaultValue={areaEdit?.managerId||''}><option value="">Unassigned</option>{users.filter(u=>u.role==='Land Manager').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><label>Boundary Polygon (GeoJSON)</label><textarea aria-label="Boundary GeoJSON" name="boundary" rows={6} required defaultValue={areaEdit?.boundary?JSON.stringify(areaEdit.boundary):''} placeholder='{"type":"Polygon","coordinates":[[[124,8],[125,8],[125,9],[124,9],[124,8]]]} '/><p className="form-help">Coordinates use longitude, latitude in EPSG:4326. The boundary must be a valid polygon.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>Modal('')}>Cancel</button><button className="btn primary">Save area</button></div></form>}

{modal==='status'&&activeCase&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('status') as any;try{await apiRequest('/api/cases',{method:'PATCH',body:JSON.stringify({id:activeCase.caseId,incidentStatus:String(value).toLowerCase()})});await loadCases();Modal('');toast('Incident status updated.')}catch(error){toast((error as Error).message)}}}><p>Update the operational incident status for <b>{activeCase.id}</b>. Case lifecycle remains {activeCase.status}.</p><label>Incident status</label><select aria-label="Incident status" name="status" defaultValue={activeCase.incident}><option>Confirmed</option><option>Contained</option><option>Out</option></select><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>Modal('')}>Cancel</button><button className="btn primary">Save update</button></div></form>}

{modal==='warning'&&activeCase&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await apiRequest('/api/warnings',{method:'POST',body:JSON.stringify({caseId:String(f.get('caseId')),title:String(f.get('title')),message:String(f.get('message'))})});const result=await apiRequest<{warnings:any[]}>('/api/warnings');W(result.warnings.map(x=>({id:x.warning_id,caseId:cases.find(c=>c.caseId===x.case_id)?.id||x.case_id,title:x.warning_title,message:x.warning_message,status:x.warning_status==='reviewed'?'Reviewed':'Draft',createdAt:x.created_at})));Modal('');pickPage('warnings');toast('Warning draft saved. No external warning was sent.')}catch(error){toast((error as Error).message)}}}><label>Related case</label><select aria-label="Warning case" name="caseId" defaultValue={activeCase.caseId}>{cases.map(c=><option key={c.caseId} value={c.caseId}>{c.id}</option>)}</select><label>Draft title</label><input aria-label="Warning title" name="title" required placeholder="e.g. Fire activity advisory"/><label>Message preview</label><textarea aria-label="Warning message" name="message" required rows={4} placeholder="Write a draft for review..."/><p className="form-help">This stores a draft only. No external notification is sent.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>Modal('')}>Cancel</button><button className="btn primary">Save draft</button></div></form>}

</div></div>}{notice&&<div className="toast" role="status"><Check size={17}/>{notice}</div>}</div></main></div>

}
