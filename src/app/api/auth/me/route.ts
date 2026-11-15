import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/supabase/auth';
export async function GET(){try{const {user,error}=await getCurrentUser();if(error)return NextResponse.json({error},{status:403});if(!user)return NextResponse.json({error:'Not signed in.'},{status:401});return NextResponse.json({user})}catch{return NextResponse.json({error:'Supabase is not configured.'},{status:503})}}
