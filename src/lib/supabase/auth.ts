import type { AppRole } from './database.types';
import { createClient } from './server';
export type AppUser={id:string;email:string;fullName:string;role:AppRole};
export async function getCurrentUser():Promise<{user:AppUser|null;error:string|null}>{
 const supabase=await createClient();
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)return {user:null,error:null};
 const {data:profile,error:profileError}=await supabase.from('profiles').select('id,email,full_name,role,account_status').eq('id',user.id).maybeSingle();
 if(profileError)return {user:null,error:profileError.message};
 if(!profile||profile.account_status!=='active')return {user:null,error:'This account is pending or inactive.'};
 return {user:{id:profile.id,email:profile.email,fullName:profile.full_name,role:profile.role},error:null};
}
