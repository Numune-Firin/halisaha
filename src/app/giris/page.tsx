'use client';

import { tarayiciIstemcisi } from '@/lib/supabase/client';

export default function GirisSayfasi() {
  async function googleIleGir() {
    const supabase = tarayiciIstemcisi();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-semibold">Halı Saha</h1>
      <button
        onClick={googleIleGir}
        className="rounded-lg bg-black px-6 py-3 text-white"
      >
        Google ile giriş yap
      </button>
    </main>
  );
}
