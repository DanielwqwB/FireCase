export function formatDate(value:string){
 const date=new Date(value);
 if(!value||Number.isNaN(date.getTime()))return value||'Not recorded';
 return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}
