import type { AppRole } from './database.types';
import { createClient } from './server';
export type AppUser={id:string;email:string;fullName:string;role:AppRole};
export async function getCurrentUser():Promise<{user:AppUser|null;error:string|null}>{
 const supabase=await createClient();
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)return {user:null,error:null};
 const {data:profile,error:profileError}=await supabase.from('profiles').select('id,email,full_name,role,account_status').eq('id',user.id).maybeSingle();
 if(profileError)return {user:null,error:profileError.message};
 if(!profile)return {user:null,error:'Your account profile is missing. Contact your FireCase administrator.'};
 if(profile.account_status==='pending')return {user:null,error:'Your registration succeeded, but your account is awaiting approval. An administrator must activate it in User Management. If this is the first administrator account, complete the first-admin setup in Supabase.'};
 if(profile.account_status!=='active')return {user:null,error:'Your account has been deactivated. Contact your FireCase administrator.'};
 return {user:{id:profile.id,email:profile.email,fullName:profile.full_name,role:profile.role},error:null};
}
