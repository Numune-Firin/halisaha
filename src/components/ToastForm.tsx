'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useToast } from './Toast';
import type { ActionResult } from '@/lib/actions/result';

/**
 * Sonucu bildirimle gosteren form.
 *
 * Normal <form> ile ayni kullanilir; tek fark, islem bitince ekranin sag
 * altinda "oldu" ya da "olmadi, sebebi su" bildirimi cikmasi. Mesaji islemin
 * kendisi dondurur (bkz. runAction), burada uydurulmaz.
 */
export function ToastForm({
  action,
  children,
  ...rest
}: {
  action: (formData: FormData) => Promise<ActionResult | void>;
  children: ReactNode;
} & Omit<ComponentProps<'form'>, 'action' | 'children'>) {
  const { show } = useToast();

  return (
    <form
      {...rest}
      action={async (formData) => {
        try {
          const result = await action(formData);
          // Mesaj donmeyen islem sessiz kalir; yalan bildirim gostermeyiz
          if (result?.message) show(result.message, result.ok);
        } catch {
          // Sunucuya hic ulasilamadiysa (baglanti koptu, oturum dustu) buraya duseriz
          show('İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.', false);
        }
      }}
    >
      {children}
    </form>
  );
}
