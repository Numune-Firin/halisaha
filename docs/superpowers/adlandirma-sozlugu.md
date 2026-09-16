> Bu sözlükteki çeviri `3c43619` commit'inde uygulandı.

# Türkçe → İngilizce Adlandırma Sözlüğü

Bu dosya bağlayıcıdır. Her ad **yalnızca** buradaki karşılığıyla değiştirilir.
Sözlükte olmayan bir ad görürsen uydurma — raporunda bildir.

**Değişmeyen:** kullanıcıya görünen tüm metinler Türkçe kalır (buton yazıları,
başlıklar, rozetler, hata mesajlarının kullanıcıya gösterilen hâlleri,
`KURULUM.md` anlatımı). Yalnızca tanımlayıcılar değişir.

---

## 1. Tablo adları — değişmiyor

`profiles`, `seasons`, `matches`, `match_entries`, `match_squad`,
`adjustments`, `settings` zaten İngilizce.

## 2. Enum tipleri ve değerleri

| Eski tip | Yeni tip | Eski değer | Yeni değer |
|---|---|---|---|
| `mevki_t` | `position_t` | `kaleci` | `goalkeeper` |
| | | `defans` | `defender` |
| | | `orta_saha` | `midfielder` |
| | | `forvet` | `forward` |
| `rol_t` | `role_t` | `admin` | `admin` |
| | | `oyuncu` | `player` |
| `uye_durum_t` | `member_status_t` | `onay_bekliyor` | `pending` |
| | | `aktif` | `active` |
| | | `pasif` | `inactive` |
| `mac_durum_t` | `match_status_t` | `anket_acik` | `poll_open` |
| | | `kadro_kesin` | `squad_locked` |
| | | `oynandi` | `played` |
| | | `tamamlandi` | `completed` |
| `giris_tipi_t` | `entry_type_t` | `vip` | `vip` |
| | | `oncelikli` | `priority` |
| | | `normal` | `standard` |
| `takim_t` | `team_t` | `siyah` | `black` |
| | | `beyaz` | `white` |

## 3. Sütun adları

**profiles:** `ad`→`full_name` · `mevki`→`position` · `rol`→`role` · `durum`→`status`
(`id`, `avatar_url`, `created_at` aynı)

**seasons:** `ad`→`name` · `baslangic`→`starts_on` · `bitis`→`ends_on` · `aktif`→`is_active`

**matches:** `sezon_id`→`season_id` · `mac_zamani`→`kickoff_at` · `saha`→`venue` ·
`durum`→`status` · `kadro_boyutu`→`squad_size` · `kisi_basi_ucret`→`fee_per_player` ·
`cikis_penceresi_saat`→`withdrawal_window_hours` ·
`gec_cikis_cezasi_sn`→`late_withdrawal_penalty_seconds` ·
`anket_acilis`→`poll_opened_at` · `son_odeme_gunu`→`payment_due_on` ·
`siyah_skor`→`black_score` · `beyaz_skor`→`white_score`

**match_entries:** `mac_id`→`match_id` · `oyuncu_id`→`player_id` · `tip`→`entry_type` ·
`giris_zamani`→`entered_at` · `ofset_sn`→`offset_seconds` · `vip_sira`→`vip_rank` ·
`cikis_zamani`→`withdrawn_at` · `gec_cikis`→`is_late_withdrawal`

**match_squad:** `mac_id`→`match_id` · `oyuncu_id`→`player_id` · `takim`→`team`

**adjustments:** `oyuncu_id`→`player_id` · `saniye`→`seconds` · `sebep`→`reason` ·
`kaynak_mac_id`→`source_match_id` · `kullanildigi_mac_id`→`applied_match_id`

**settings:** `kadro_boyutu`→`squad_size` · `kisi_basi_ucret`→`fee_per_player` ·
`cikis_penceresi_saat`→`withdrawal_window_hours` ·
`gec_cikis_cezasi_sn`→`late_withdrawal_penalty_seconds`

## 4. SQL fonksiyonları, tetikleyiciler, oturum değişkeni

| Eski | Yeni |
|---|---|
| `is_aktif_uye()` | `is_active_member()` |
| `is_admin()` | `is_admin()` (aynı) |
| `yeni_kullanici_profili()` | `handle_new_user()` |
| `match_entries_giris_zamani_zorla()` | `force_entry_timestamp()` |
| `match_entries_giris_zamani_trg` | `match_entries_entered_at_trg` |
| `match_entries_oyuncu_korumasi()` | `guard_player_entry_fields()` |
| `match_entries_oyuncu_korumasi_trg` | `match_entries_guard_trg` |
| `ankete_gir(...)` | `join_poll(...)` |
| `anketten_cik(...)` | `leave_poll(...)` |
| `kadroyu_kesinlestir(...)` | `lock_squad(...)` |
| `app.sistem_islemi` | `app.system_operation` |

RPC parametreleri: `p_mac_id`→`p_match_id` · `p_oyuncu_id`→`p_player_id` ·
`p_ofset`→`p_offset` · `p_tuketilecek`→`p_consumed_ids` · `p_gec_cikis`→`p_is_late` ·
`p_ceza_sn`→`p_penalty_seconds` · `p_oyuncular`→`p_player_ids`

İndeks adları: `seasons_tek_aktif`→`seasons_single_active` ·
`match_entries_mac_idx`→`match_entries_match_idx` ·
`adjustments_bekleyen_idx`→`adjustments_pending_idx` ·
`match_squad_mac_idx`→`match_squad_match_idx`

RLS politika adları: `..._kendi`→`..._own`, `..._admin` aynı kalır
(`profiles_update_kendi`→`profiles_update_own`,
`match_entries_insert_kendi`→`match_entries_insert_own`,
`match_entries_update_kendi`→`match_entries_update_own`,
`match_entries_all_admin` aynı).

## 5. TypeScript tipleri ve alanları

| Eski | Yeni |
|---|---|
| `Mevki` | `Position` |
| `GirisTipi` | `EntryType` |
| `AnketGirisi` | `PollEntry` |
| `SiraliOyuncu` | `RankedPlayer` |
| `BekleyenOfset` | `PendingOffset` |
| `Profil` | `Profile` |
| `MacOzet` | `MatchSummary` |
| `AnketSatiri` | `PollRow` |

Alanlar: `oyuncuId`→`playerId` · `tip`→`entryType` · `girisZamani`→`enteredAt` ·
`ofsetSn`→`offsetSeconds` · `vipSira`→`vipRank` · `cikisZamani`→`withdrawnAt` ·
`sira`→`rank` · `konum`→`placement` · `efektifZaman`→`effectiveTime` ·
`ad`→`fullName` · `mevki`→`position` · `rol`→`role` · `durum`→`status` ·
`saniye`→`seconds` · `macZamani`→`kickoffAt` · `saha`→`venue` ·
`kadroBoyutu`→`squadSize` · `anketAcilis`→`pollOpenedAt` ·
`cikisPenceresiSaat`→`withdrawalWindowHours` ·
`gecCikisCezasiSn`→`lateWithdrawalPenaltySeconds`

`konum` değerleri: `'kadro'`→`'squad'` · `'yedek'`→`'reserve'`

## 6. TypeScript fonksiyonları

| Eski | Yeni |
|---|---|
| `anketiSirala` | `rankPollEntries` |
| `cikisiDegerlendir` | `evaluateWithdrawal` |
| `toplamOfset` | `sumOffsets` |
| `tuketilecekIdler` | `consumableIds` |
| `sunucuIstemcisi` | `createServerSupabase` |
| `tarayiciIstemcisi` | `createBrowserSupabase` |
| `yoneticiIstemcisi` | `createServiceSupabase` |
| `oturumuTazele` | `refreshSession` |
| `aktifProfil` | `getCurrentProfile` |
| `adminGerekli` | `requireAdmin` |
| `anketiGetir` | `getPoll` |
| `anketeGir` | `joinPoll` |
| `anketenCik` | `leavePoll` |
| `anketeGirVeyaCik` | `togglePollEntry` |
| `uyeyiOnayla` | `approveMember` |
| `anketAc` | `openPoll` |
| `vipEkle` | `addVip` |
| `oncelikliYap` | `markPriority` |
| `cezaVer` | `addAdjustment` |
| `kadroyuKesinlestir` | `lockSquad` |

`cikisiDegerlendir` parametre/dönüş: `{ simdi, macZamani, cikisPenceresiSaat, gecCikisCezasiSn }`
→ `{ now, kickoffAt, windowHours, penaltySeconds }`; dönüş `{ gecCikis, cezaSn }`
→ `{ isLate, penaltySeconds }`.

`anketiSirala` parametreleri: `{ girisler, anketAcilis, kadroBoyutu }`
→ `{ entries, pollOpenedAt, squadSize }`.

## 7. Bileşenler

`AnketListesi`→`PollList` · `CanliYenile`→`LiveRefresh` ·
`AnketSayfasi`→`PollPage` · `AnaSayfa`→`HomePage` · `GirisSayfasi`→`LoginPage` ·
`OnayBekliyor`→`PendingApprovalPage` · `AdminSayfasi`→`AdminPage` ·
`KadroSayfasi`→`SquadPage` · `Bolum`→`Section`

## 8. Dosya ve klasör adları

| Eski | Yeni |
|---|---|
| `src/lib/poll/sirala.ts` (+`.test.ts`) | `src/lib/poll/ranking.ts` |
| `src/lib/poll/cikis.ts` (+`.test.ts`) | `src/lib/poll/withdrawal.ts` |
| `src/lib/poll/ofset.ts` (+`.test.ts`) | `src/lib/poll/offsets.ts` |
| `src/lib/saglik.test.ts` | `src/lib/health.test.ts` |
| `src/lib/supabase/adminKontrol.ts` | `src/lib/supabase/requireAdmin.ts` |
| `src/lib/db/anket.ts` | `src/lib/db/poll.ts` |
| `src/app/anket/[macId]/AnketListesi.tsx` | `src/app/poll/[matchId]/PollList.tsx` |
| `src/app/anket/[macId]/CanliYenile.tsx` | `src/app/poll/[matchId]/LiveRefresh.tsx` |

## 9. URL yolları

| Eski | Yeni |
|---|---|
| `/giris` | `/login` |
| `/onay-bekliyor` | `/pending-approval` |
| `/anket/[macId]` | `/poll/[matchId]` |
| `/anket/[macId]/kadro` | `/poll/[matchId]/squad` |
| `/admin` | `/admin` (aynı) |
| `/auth/callback` | `/auth/callback` (aynı) |

Yol parametresi `macId`→`matchId`. `redirect()` çağrıları ve
`revalidatePath()` yolları da güncellenecek.

## 10. Kod içi hata mesajları

Bunlar kullanıcıya gösterilebiliyor; **Türkçe kalsınlar**, yalnız
tırnak içindeki metin aynen korunur: `'Yetkisiz'`, `'Anket kapali'`,
`'Ankette acik kayit yok'`, `'Mac bulunamadi'`,
`'Bu alanlari yalnizca yonetici degistirebilir'`,
`'Oyuncu bu ankette bulunamadı'`, `'Sıfır ceza yazılamaz'`,
`'Maç bulunamadı'`, `'Geç çıkış'` (adjustments.reason değeri).
