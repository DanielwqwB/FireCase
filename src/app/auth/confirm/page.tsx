
'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
export default function ConfirmEmail(){
 const [message,setMessage]=useState('Confirming your email...');
 useEffect(()=>{let alive=true;
 async function confirm(){try{
  const client=createClient();
  const params=new URLSearchParams(window.location.search);
  if(params.has('error'))throw new Error('The confirmation link is invalid or expired. Please request a new confirmation email.');
  const code=params.get('code');
  if(!code)throw new Error('Missing confirmation code. Open the confirmation link from your email.');
  const {error}=await client.auth.exchangeCodeForSession(code);
  if(error)throw error;
  await client.auth.signOut();
  if(alive)setMessage('Email confirmed. Your account requires administrator approval before you can sign in.');
 }catch(error){if(alive)setMessage(error instanceof Error?error.message:'Unable to confirm your email.')}}
 void confirm();return()=>{alive=false};},[]);
 return <main className="login-loading"><section><h1>FireCase account confirmation</h1><p role="status">{message}</p><Link href="/">Back to sign in</Link></section></main>;
}
