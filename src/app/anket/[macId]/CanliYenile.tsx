'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tarayiciIstemcisi } from '@/lib/supabase/client';

/**
 * match_entries tablosunda bu maca ait bir degisiklik oldugunda sayfayi tazeler.
 * Siralamayi yeniden hesaplamaz; sunucudan yeni listeyi ister.
 */
export function CanliYenile({ macId }: { macId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = tarayiciIstemcisi();

    const kanal = supabase
      .channel(`anket-${macId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_entries', filter: `mac_id=eq.${macId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(kanal);
    };
  }, [macId, router]);

  return null;
}
