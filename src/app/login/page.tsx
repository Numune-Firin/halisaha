'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Basarili olursa tarayici Google'a yonlenir; buraya yalnizca hata halinde donulur.
    if (error) setBusy(false);
  }

  // Ust bolum ortalanir, altbilgi ekranin dibinde kalir
  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] px-5 py-10">
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="card w-full max-w-sm overflow-hidden">
          <div className="flex flex-col items-center gap-4 border-b border-[color:var(--line)] bg-[color:var(--surface)] px-6 py-8">
            <Image
              src="/firin.jpg"
              alt="Numune Fırın Futbol Ligi"
              width={1794}
              height={592}
              priority
              className="w-56 rounded-lg shadow-lg"
            />
            <p className="text-center text-sm text-ink-300">
              Haftalık halı saha anketi, kadro ve puan durumu tek yerde.
            </p>
          </div>

          <div className="flex flex-col gap-3 px-6 py-6">
            <button onClick={signInWithGoogle} disabled={busy} className="btn btn-primary btn-block">
              <GoogleMark />
              {busy ? 'Yönlendiriliyor…' : 'Google ile giriş yap'}
            </button>
            <p className="text-center text-xs leading-relaxed text-ink-300">
              Lig kapalı bir gruptur. İlk girişinden sonra hesabın yönetici onayına düşer,
              onaylandığında ankete girebilirsin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-widest text-ink-500">
          <span className="h-px w-8 bg-[color:var(--line-strong)]" />
          Numune Fırın Futbol Ligi
          <span className="h-px w-8 bg-[color:var(--line-strong)]" />
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-500">
        Numune Fırın Football Federation A.Ş. tarafından geliştirilmiştir
      </p>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
