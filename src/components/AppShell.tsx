import type { ReactNode } from 'react';
import { signOut } from '@/app/auth/actions';
import { createServerSupabase, type Profile } from '@/lib/supabase/server';
import { AppChrome, type NavGroup } from './AppChrome';
import { UnresolvedBanner } from './UnresolvedBanner';

const PLAYER_GROUP: NavGroup = {
  title: 'Lig',
  items: [
    { href: '/', label: 'Ana sayfa', description: 'Aktif anket ve özet' },
    { href: '/matches', label: 'Maçlar', description: 'Geçmiş anketler ve maçlar' },
    { href: '/standings', label: 'Puan durumu', description: 'Sezonun oyuncu sıralaması' },
    { href: '/players', label: 'Oyuncular', description: 'Kadro listesi ve mevkiler' },
    {
      href: '/balances',
      label: 'Bakiyeler',
      description: 'Kim alacaklı, kim borçlu',
    },
    {
      href: '/feedback',
      label: 'İstek ve şikayet',
      description: 'Yöneticilere yaz, cevabını gör',
    },
  ],
};

/** Onay bekleyen uye sayisi menude rozet olarak durur; sayfa acmadan gorulur. */
function adminGroup(pendingCount: number, openFeedback: number): NavGroup {
  return {
  title: 'Yönetim',
  items: [
    {
      href: '/admin',
      label: 'Yönetim paneli',
      description: 'Yeni anket ve son maçlar',
    },
    {
      href: '/admin/members',
      label: 'Üyeler ve davetler',
      description: 'Onay bekleyenler ve davetler',
      badge: pendingCount,
    },
    {
      href: '/admin/feedback',
      label: 'İstek ve şikayetler',
      description: 'Üyelerden gelen mesajlar',
      badge: openFeedback,
    },
    { href: '/admin/teams', label: 'Takımlar', description: 'Takım tanımı ve sahadaki ikisi' },
    {
      href: '/admin/accounting',
      label: 'Muhasebe',
      description: 'Sezonun para özeti ve borçlar',
    },

    {
      href: '/admin/adjustments',
      label: 'Ceza ve ödül',
      description: 'Sıraya eklenen ya da düşülen saniyeler',
    },
    { href: '/admin/seasons', label: 'Sezonlar', description: 'Sezon tanımı, başlangıç ve bitiş' },
    {
      href: '/admin/schedule',
      label: 'Anket takvimi',
      description: 'Her hafta kendiliğinden açılan maçlar',
    },
  ],
  };
}

/** Solda menu, sagda icerik. Butun ic sayfalar bunu kullanir. */
export async function AppShell({
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

  let pendingCount = 0;
  let openFeedback = 0;
  if (isAdmin) {
    const supabase = await createServerSupabase();
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    pendingCount = count ?? 0;

    // Cevap bekleyen istek/sikayet sayisi menude rozet olarak durur
    const { data: openCount } = await supabase.rpc('open_feedback_count');
    openFeedback = (openCount as number | null) ?? 0;
  }

  return (
    <AppChrome
      groups={isAdmin ? [PLAYER_GROUP, adminGroup(pendingCount, openFeedback)] : [PLAYER_GROUP]}
      userName={profile.full_name || 'Oyuncu'}
      isAdmin={isAdmin}
      signOutAction={signOut}
      title={title}
      subtitle={subtitle}
      action={action}
    >
      {/* Askida kalan hafta yoneticiyi her sayfada karsilar */}
      {isAdmin && <UnresolvedBanner />}
      {children}
    </AppChrome>
  );
}
