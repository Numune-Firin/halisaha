import type { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
