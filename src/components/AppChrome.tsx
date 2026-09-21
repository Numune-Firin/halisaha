'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = {
  href: string;
  label: string;
  description: string;
  /** Sifirdan buyukse satirin yaninda sayi rozeti cikar (bekleyen is) */
  badge?: number;
};
export type NavGroup = { title: string; items: NavItem[] };

/**
 * Acik olan menu satiri. Alt yollar da ust baglantiyi isaretler (/poll/... ->
 * Maclar degil, ama /admin/teams -> Takimlar), bu yuzden birden fazla eslesme
 * olursa en uzunu kazanir; yoksa /admin hem kendini hem /admin/teams'i yakardi.
 */
function activeHref(pathname: string, groups: NavGroup[]) {
  let best = '';
  for (const group of groups) {
    for (const item of group.items) {
      const matches =
        item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/**
 * Solda sabit menu, sagda sayfa icerigi. Menu buyuk ekranda hep acik durur,
 * kucuk ekranda ustteki dugmeyle cekmece gibi acilir.
 */
export function AppChrome({
  groups,
  userName,
  isAdmin,
  signOutAction,
  title,
  subtitle,
  action,
  children,
}: {
  groups: NavGroup[];
  userName: string;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Ana sayfada geri gidilecek bir yer yok
  const canGoBack = pathname !== '/';
  const current = activeHref(pathname, groups);

  // Sayfa degisince cekmece kendiliginden kapanir
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col lg:pl-64">
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="min-w-0">
            <Image
              src="/firin.jpg"
              alt="Numune Fırın Futbol Ligi"
              width={1794}
              height={592}
              priority
              className="h-10 w-auto rounded-md"
            />
          </Link>
          {/* .btn kurali utilities'ten sonra tanimli oldugu icin lg:hidden'i
              dogrudan butona vermek ise yaramaz; sarmalayici gizlenir. */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Menüyü kapat"
              className="btn btn-ghost btn-sm"
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-3">
              <p className="px-3 pb-1 pt-3 text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">
                {group.title}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current === item.href ? 'page' : undefined}
                  className={`nav-link ${current === item.href ? 'nav-link-active' : ''}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {item.label}
                    {item.badge ? <span className="badge badge-vip">{item.badge}</span> : null}
                  </span>
                  <span className="block text-xs text-ink-500">{item.description}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-[color:var(--line)] p-3">
          <p className="truncate px-1 text-sm font-semibold text-frost-100">{userName}</p>
          <p className="px-1 text-xs text-ink-300">{isAdmin ? 'Yönetici' : 'Oyuncu'}</p>
          <div className="mt-2">
            <ThemeToggle />
          </div>
          <form action={signOutAction} className="mt-2">
            <button className="w-full rounded-lg px-1 py-1.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10">
              Çıkış yap
            </button>
          </form>
        </div>
      </aside>

      <header className="topbar sticky top-0 z-30 flex items-center gap-3 px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label="Menüyü aç"
          className="btn btn-ghost btn-sm"
        >
          <span aria-hidden className="flex flex-col gap-[3px]">
            <span className="block h-[2px] w-4 bg-current" />
            <span className="block h-[2px] w-4 bg-current" />
            <span className="block h-[2px] w-4 bg-current" />
          </span>
          Menü
        </button>
        {canGoBack && (
          <button
            type="button"
            onClick={() => router.back()}
            className="btn btn-ghost btn-sm"
            aria-label="Geri"
          >
            <span aria-hidden>←</span>
          </button>
        )}
        <span className="truncate text-sm font-semibold text-frost-100">{title}</span>
      </header>

      <main className="page flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {canGoBack && (
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-ghost btn-sm mt-1 hidden lg:inline-flex"
              >
                <span aria-hidden>←</span> Geri
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-frost-100">{title}</h1>
              {subtitle && <div className="mt-1 text-sm text-ink-300">{subtitle}</div>}
            </div>
          </div>
          {action}
        </div>
        {children}
      </main>

      {/* Altbilgi main'in disinda: sayfa kisa oldugunda ortada asili kalmasin,
          uzun oldugunda da icerigin ardindan gelsin */}
      <footer className="page-footer">
        Numune Fırın Football Federation A.Ş. tarafından geliştirilmiştir
      </footer>
    </div>
  );
}
