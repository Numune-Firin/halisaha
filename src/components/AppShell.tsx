import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/auth/actions';
import type { Profile } from '@/lib/supabase/server';
import { SiteNav, type NavGroup } from './SiteNav';

const PLAYER_GROUP: NavGroup = {
  title: 'Lig',
  items: [
    { href: '/', label: 'Ana sayfa', description: 'Açık anket ve yaklaşan maçlar' },
    { href: '/matches', label: 'Maçlar', description: 'Geçmiş ve gelecek tüm maçlar' },
  ],
};

const ADMIN_GROUP: NavGroup = {
  title: 'Yönetim',
  items: [
    { href: '/admin', label: 'Yönetim paneli', description: 'Üye onayları ve yeni anket' },
    { href: '/admin/seasons', label: 'Sezonlar', description: 'Sezon tanımı, başlangıç ve bitiş' },
    {
      href: '/admin/schedule',
      label: 'Anket takvimi',
      description: 'Her hafta kendiliğinden açılan maçlar',
    },
  ],
};

/** Ustte marka + menu, altta sayfa icerigi. Butun ic sayfalar bunu kullanir. */
export function AppShell({
  profile,
  title,
  subtitle,
  action,
  children,
}: {
  profile: Profile;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const isAdmin = profile.role === 'admin';
  const groups = isAdmin ? [PLAYER_GROUP, ADMIN_GROUP] : [PLAYER_GROUP];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-pitch-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/sponsor.jpg"
              alt="Numune Fırın Futbol Ligi"
              width={320}
              height={114}
              priority
              className="h-9 w-auto rounded-md"
            />
          </Link>
          <SiteNav
            groups={groups}
            userName={profile.full_name || 'Oyuncu'}
            isAdmin={isAdmin}
            signOutAction={signOut}
          />
        </div>
      </header>

      <main className="page">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-cream-100">{title}</h1>
            {subtitle && <div className="mt-1 text-sm text-ink-300">{subtitle}</div>}
          </div>
          {action}
        </div>
        {children}
      </main>
    </>
  );
}
