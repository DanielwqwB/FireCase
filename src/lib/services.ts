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
export async function signOut(){const supabase=createClient();const {error}=await supabase.auth.signOut();if(error)throw error;}
export async function currentProfile(){const response=await fetch('/api/auth/me',{cache:'no-store'});if(!response.ok)return null;return response.json() as Promise<{user:{id:string;email:string;fullName:string;role:AppRole}}>}
export async function apiRequest<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{...init,headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init?.headers},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data as T}
export const fromDbRole=(role:AppRole)=>uiRole(role);
export type {Database};
