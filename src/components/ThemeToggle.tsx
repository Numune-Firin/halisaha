'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Acik/koyu tema anahtari. Secim localStorage'da durur ve layout'taki kucuk
 * script sayfa boyanmadan once ayni degeri okur; bu yuzden burada yalnizca
 * degistirme isi kalir.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Gizli sekmede yazilamayabilir; tema yine de bu oturumda degisir
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
      className="btn btn-ghost btn-sm w-full justify-start"
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span>
      {theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
    </button>
  );
}
