import {predictionRequestSchema,weatherKeys} from './prediction-dataset';
export type ModelObservation={observation_date:string;total_hotspots:number}&Record<typeof weatherKeys[number],number>;
export function storedModelInput(rows:ModelObservation[],model:'daily'|'lstm',date:string){
 const index=rows.findIndex(row=>row.observation_date===date);
 const length=model==='daily'?8:14;
 if(index<length-1)throw new Error(`Choose a date with ${length-1} preceding days in the stored dataset.`);
 const sequence=rows.slice(index-length+1,index+1);
 for(let i=1;i<sequence.length;i++)if(Date.parse(sequence[i].observation_date)-Date.parse(sequence[i-1].observation_date)!==86400000)throw new Error('Stored observations contain a date gap.');
 const latest=rows[index];
 const weather=Object.fromEntries(weatherKeys.map(key=>[key,latest[key]]));
 const context={place:'Philippines (model training aggregation)',source:'Supabase research-datasets / FireCase_Merged_Daily_2021_2025.csv; historical evaluation, not a Bicol-specific forecast'};
 return predictionRequestSchema.parse(model==='daily'?{model,context,observation:{observation_date:date,...weather,hotspots_today:latest.total_hotspots,hotspots_prev7_mean:sequence.slice(0,7).reduce((sum,row)=>sum+row.total_hotspots,0)/7}}:{model,context,observations:sequence});
}
