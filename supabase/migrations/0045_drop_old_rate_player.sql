-- Eski imzali rate_player kaldirilir.
--
-- 0044 agirlik parametresini ekleyince fonksiyonun iki surumu birden olustu:
--   rate_player(uuid, uuid, uuid, smallint)        <- eski
--   rate_player(uuid, uuid, uuid, smallint, int)   <- agirlikli
--
-- PostgREST cagriyi eski surume yonlendirdigi icin gonderilen agirlik yok
-- sayiliyor, her oy bir sayiliyordu. Eski surum kalkinca tek aday kalir.

drop function if exists public.rate_player(uuid, uuid, uuid, smallint);
