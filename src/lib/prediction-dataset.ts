import {z} from 'zod';

export const weatherKeys=['CLDTMP','PS','T2M','TO3','TQV','TS','U10M','U50M','V10M','V50M'] as const;
const weather=Object.fromEntries(weatherKeys.map(key=>[key,z.number().finite()])) as Record<typeof weatherKeys[number],z.ZodNumber>;
export const dailyObservationSchema=z.object({observation_date:z.string().date(),...weather,hotspots_today:z.number().int().nonnegative(),hotspots_prev7_mean:z.number().nonnegative()}).strict();
export const lstmObservationSchema=z.object({observation_date:z.string().date(),...weather,total_hotspots:z.number().int().nonnegative()}).strict();
export const predictionContextSchema=z.object({place:z.string().trim().min(2).max(160),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional(),source:z.string().trim().min(2).max(500)}).strict();
export const predictionRequestSchema=z.discriminatedUnion('model',[
 z.object({model:z.literal('daily'),observation:dailyObservationSchema,context:predictionContextSchema.optional()}).strict(),
 z.object({model:z.literal('lstm'),observations:z.array(lstmObservationSchema).length(14),context:predictionContextSchema.optional()}).strict(),
]).superRefine((value,ctx)=>{
 if(value.context&&((value.context.latitude===undefined)!==(value.context.longitude===undefined)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Supply both coordinates, or leave both blank for a regional dataset.',path:['context']});
 if(value.model==='lstm')for(let i=1;i<value.observations.length;i++){
  if(Date.parse(value.observations[i].observation_date)-Date.parse(value.observations[i-1].observation_date)!==86400000){ctx.addIssue({code:z.ZodIssueCode.custom,message:'LSTM needs 14 consecutive dates, oldest first.',path:['observations',i,'observation_date']});break;}
 }
});

// Handles quoted fields, escaped quotes, CRLF and commas inside source labels.
function csvRows(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field.trim());field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw new Error('CSV contains an unclosed quoted field.');
 row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export function parsePredictionDataset(text:string,model:'daily'|'lstm'){
 const clean=text.replace(/^\uFEFF/,'').trim();let observations:unknown;
 if(clean.startsWith('[')||clean.startsWith('{')){
  const parsed=JSON.parse(clean);if(!parsed||typeof parsed!=='object')throw new Error('JSON must contain observation objects.');observations=Array.isArray(parsed)?parsed:parsed.observations??[parsed.observation??parsed];
 }else{
  const [headers,...rows]=csvRows(clean);
  if(!headers||new Set(headers).size!==headers.length)throw new Error('CSV needs unique column headers.');
  observations=rows.map((row,index)=>{
   if(row.length!==headers.length)throw new Error(`CSV row ${index+2} has the wrong number of columns.`);
   return Object.fromEntries(headers.map((key,i)=>[key,key==='observation_date'?row[i]:row[i]===''?null:Number(row[i])]));
  });
 }
 if(!Array.isArray(observations)||observations.length===0)throw new Error('Dataset contains no observations.');
 if(model==='daily'&&observations.length!==1)throw new Error('Daily import requires one observation. For a time series, select LSTM and supply exactly 14 days.');
 const parsed=predictionRequestSchema.safeParse(model==='daily'?{model,observation:observations[0]}:{model,observations});
 if(!parsed.success){const first=parsed.error.issues[0];throw new Error(`${first.path.join('.')}: ${first.message}. Check the template and model selection.`);}
 return parsed.data;
}
