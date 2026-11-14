import {NextResponse} from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
export async function middleware(request:NextRequest){if(request.nextUrl.pathname==='/demo'||['/field-sw.js','/offline.html','/offline.js','/offline.css'].includes(request.nextUrl.pathname))return NextResponse.next();return updateSession(request)}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
