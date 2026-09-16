import Image from 'next/image';
import { signOut } from '@/app/auth/actions';

export default function PendingApprovalPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-10">
      <div className="card w-full max-w-sm px-6 py-8 text-center">
        <Image
          src="/sponsor.jpg"
          alt="Numune Fırın Futbol Ligi"
          width={320}
          height={114}
          className="mx-auto w-44 rounded-lg"
        />
        <span className="badge badge-muted mt-6">Onay bekleniyor</span>
        <h1 className="mt-3 text-xl font-bold text-cream-100">Hesabın yönetici onayında</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          Lig kapalı bir gruptur. Yöneticiler seni onayladıktan sonra ankete girebilir,
          kadroyu ve puan durumunu görebilirsin.
        </p>
        <form action={signOut} className="mt-6">
          <button className="btn btn-ghost btn-block">Çıkış yap</button>
        </form>
      </div>
    </main>
  );
}
