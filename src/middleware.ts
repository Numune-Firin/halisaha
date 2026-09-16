import type { NextRequest } from 'next/server';
import { oturumuTazele } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return oturumuTazele(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
