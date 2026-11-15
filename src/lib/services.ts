import type { AppRole, Database } from './supabase/database.types';
import { createClient } from './supabase/client';
export const uiRole=(role:AppRole)=>({admin:'Admin',emergency_responder:'Emergency Responder',firefighter:'Firefighter',land_manager:'Land Manager'} as const)[role];
export async function signIn(email:string,password:string){
 const supabase=createClient();
 const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error)throw new Error(error.message);
 const response=await fetch('/api/auth/me',{cache:'no-store'});
 const body=await response.json();
 if(!response.ok){await supabase.auth.signOut();throw new Error(body.error||'This account is not active. Contact an administrator.');}
 return {id:body.user.id as string,email:body.user.email as string,fullName:body.user.fullName as string,role:uiRole(body.user.role as AppRole)};
}
export async function signUp(fullName:string,email:string,password:string,role:import('./types').Role){
 const dbRole=({Admin:'admin','Emergency Responder':'emergency_responder',Firefighter:'firefighter','Land Manager':'land_manager'} as const)[role];
 const supabase=createClient();
 const {error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName,requested_role:dbRole},emailRedirectTo:`${window.location.origin}/auth/confirm`}});
 if(error)throw new Error(error.message);
 await supabase.auth.signOut();
}
export async function signOut(){const supabase=createClient();const {error}=await supabase.auth.signOut();if(error)throw error;}
export async function currentProfile(){const response=await fetch('/api/auth/me',{cache:'no-store'});if(!response.ok)return null;return response.json() as Promise<{user:{id:string;email:string;fullName:string;role:AppRole}}>}
export async function apiRequest<T>(path:string,init?:RequestInit):Promise<T>{let response:Response;try{response=await fetch(path,{...init,signal:init?.signal??AbortSignal.timeout(path.startsWith('/api/predictions')&&init?.method==='POST'?150000:30000),headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init?.headers},cache:'no-store'})}catch(error){const timedOut=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);throw new Error(timedOut?'The service is taking too long. Try again in a moment.':'Unable to connect. Check your connection and try again.')}const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data as T}
export const fromDbRole=(role:AppRole)=>uiRole(role);
export type {Database};
