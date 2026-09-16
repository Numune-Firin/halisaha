'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

/**
 * match_entries tablosunda bu maca ait bir degisiklik oldugunda sayfayi tazeler.
 * Siralamayi yeniden hesaplamaz; sunucudan yeni listeyi ister.
 */
export function LiveRefresh({ matchId }: { matchId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();

    const channel = supabase
      .channel(`poll-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_entries', filter: `match_id=eq.${matchId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, router]);

  return null;
}
