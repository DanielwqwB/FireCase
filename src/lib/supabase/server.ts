import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
export async function createClient(){
 const jar=cookies();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key) throw new Error('Supabase server environment is not configured.');
 return createServerClient<Database>(url,key,{cookies:{get(name:string){return jar.get(name)?.value},set(name:string,value:string,options:any){try{jar.set({name,value,...options})}catch{}},remove(name:string,options:any){try{jar.set({name,value:'',...options})}catch{}}}});
}
