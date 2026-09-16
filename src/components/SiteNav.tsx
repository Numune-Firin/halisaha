'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; description: string };

export type NavGroup = { title: string; items: NavItem[] };

/**
 * Uygulamanin tek menusu. Butun sayfalar buradan acilir; yonetici bolumleri
 * yalnizca admin icin gonderilen gruplarla gelir.
 */
export function SiteNav({
  groups,
  userName,
  isAdmin,
  signOutAction,
}: {
  groups: NavGroup[];
  userName: string;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Sayfa degisince menu kendiliginden kapanir
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn btn-ghost btn-sm"
      >
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="block h-[2px] w-4 bg-current" />
          <span className="block h-[2px] w-4 bg-current" />
          <span className="block h-[2px] w-4 bg-current" />
        </span>
        Menü
      </button>

      {open && (
        <div
          role="menu"
          className="card menu-panel absolute right-0 z-50 mt-2 w-72 overflow-hidden p-1"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-cream-100">{userName}</p>
            <p className="text-xs text-ink-300">{isAdmin ? 'Yönetici' : 'Oyuncu'}</p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="border-t border-white/10 py-1">
              <p className="px-3 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">
                {group.title}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={`block rounded-lg px-3 py-2 transition hover:bg-white/10 ${
                    pathname === item.href ? 'bg-white/10' : ''
                  }`}
                >
                  <span className="block text-sm font-medium text-ink-100">{item.label}</span>
                  <span className="block text-xs text-ink-300">{item.description}</span>
                </Link>
              ))}
            </div>
          ))}

          <form action={signOutAction} className="border-t border-white/10 p-1">
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10">
              Çıkış yap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
