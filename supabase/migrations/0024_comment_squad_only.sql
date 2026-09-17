-- Yorum yazmak da oy vermek gibi kadroya baglanir.
--
-- Oy verme kurali zaten rate_player icinde: macin kadrosunda olmayan oy
-- veremez, yonetici her zaman verebilir. Yorum ise butun uyelere acikti;
-- artik o da ayni kurala uyar, cunku maci oynamayan kisinin mac hakkinda
-- yorum yazmasi istenmiyor.
--
-- Okumak herkese acik kalir: grup yorumlari gorebilir.

drop policy if exists match_comments_insert on match_comments;

create policy match_comments_insert on match_comments for insert
  with check (
    is_active_member()
    and author_id = auth.uid()
    and exists (
      select 1 from matches m
       where m.id = match_id
         and m.status in ('played', 'completed')
         and (m.voting_closes_at is null or m.voting_closes_at > now())
    )
    and (
      is_admin()
      or exists (
        select 1 from match_squad s
         where s.match_id = match_comments.match_id
           and s.player_id = auth.uid()
      )
    )
  );
