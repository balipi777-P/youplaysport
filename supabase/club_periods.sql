-- Periodes du club (onglet « Periodes » de la console) : nom, debut, fin, option « Aucune seance ».
-- A RELIRE puis appliquer soi-meme : ce fichier n'a PAS ete execute.
--
-- Constat sur la base au moment de l'ecriture : yps.seasons (id, club_id, name, start_date, end_date) est vide,
-- aucune equipe n'y est rattachee, aucune fonction ne l'utilise. Contraintes deja presentes : fin >= debut et
-- duree <= 400 jours, nom de 1 a 80 caracteres. Lecture par RLS (admin plateforme ou membre du club).
-- Les privileges de table donnent encore INSERT/UPDATE/DELETE a anon et authenticated : ce fichier les retire
-- (et supprime la policy d'ecriture si elle existe) pour que TOUTE ecriture passe par les trois fonctions.
--
-- Regles :
--  * create_season / update_season / delete_season : dirigeant du club uniquement.
--  * Erreurs levees : not_authenticated, not_allowed, invalid_name (vide ou > 80), invalid_dates (manquantes ou
--    fin avant debut), period_too_long (> 400 jours), too_many_periods (> 50 par club), not_found.
--  * Chaque creation / modification / suppression est journalisee dans yps.audit_log (sans contenu libre).
--  * Lecture pour les calendriers : club_periods_for_me() renvoie les periodes des clubs de l'appelant
--    (dirigeant, coach, parent actif ou en attente), y compris pour un parent rattache seulement via un enfant.
--  * Une periode « Aucune seance » n'EMPECHE rien : la creation d'une seance reste possible (avertissement cote appli).

-- ---------------------------------------------------------------------------
-- 1. Colonne + verrouillage de l'ecriture directe
-- ---------------------------------------------------------------------------
alter table yps.seasons add column if not exists no_sessions boolean not null default false;

alter table yps.seasons enable row level security;
drop policy if exists seasons_write on yps.seasons;
revoke insert, update, delete, truncate on yps.seasons from anon, authenticated;
revoke all on yps.seasons from anon;

-- ---------------------------------------------------------------------------
-- 2. create_season(p_club, p_name, p_start, p_end, p_no_sessions) -> id
-- ---------------------------------------------------------------------------
create or replace function yps.create_season(p_club uuid, p_name text, p_start date, p_end date, p_no_sessions boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not yps.is_club_admin(p_club) then raise exception 'not_allowed'; end if;
  if v_name = '' or char_length(v_name) > 80 then raise exception 'invalid_name'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_dates'; end if;
  if (p_end - p_start) > 400 then raise exception 'period_too_long'; end if;
  if (select count(*) from yps.seasons where club_id = p_club) >= 50 then raise exception 'too_many_periods'; end if;

  insert into yps.seasons (club_id, name, start_date, end_date, no_sessions)
  values (p_club, v_name, p_start, p_end, coalesce(p_no_sessions, false)) returning id into v_id;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'season_create', 'season:' || v_id::text, jsonb_build_object('club', p_club));
  return v_id;
end $$;
revoke all on function yps.create_season(uuid, text, date, date, boolean) from public, anon;
grant execute on function yps.create_season(uuid, text, date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_season(p_season, p_name, p_start, p_end, p_no_sessions)
-- ---------------------------------------------------------------------------
create or replace function yps.update_season(p_season uuid, p_name text, p_start date, p_end date, p_no_sessions boolean default false)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select club_id into v_club from yps.seasons where id = p_season;
  if v_club is null then raise exception 'not_found'; end if;
  if not yps.is_club_admin(v_club) then raise exception 'not_allowed'; end if;
  if v_name = '' or char_length(v_name) > 80 then raise exception 'invalid_name'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_dates'; end if;
  if (p_end - p_start) > 400 then raise exception 'period_too_long'; end if;

  update yps.seasons
     set name = v_name, start_date = p_start, end_date = p_end, no_sessions = coalesce(p_no_sessions, false)
   where id = p_season;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'season_update', 'season:' || p_season::text, jsonb_build_object('club', v_club));
end $$;
revoke all on function yps.update_season(uuid, text, date, date, boolean) from public, anon;
grant execute on function yps.update_season(uuid, text, date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. delete_season(p_season)
--    Les equipes qui pointaient vers cette periode (teams.season_id) perdent ce lien selon la cle etrangere
--    existante ; aucune equipe n'y est rattachee aujourd'hui.
-- ---------------------------------------------------------------------------
create or replace function yps.delete_season(p_season uuid)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select club_id into v_club from yps.seasons where id = p_season;
  if v_club is null then raise exception 'not_found'; end if;
  if not yps.is_club_admin(v_club) then raise exception 'not_allowed'; end if;

  delete from yps.seasons where id = p_season;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'season_delete', 'season:' || p_season::text, jsonb_build_object('club', v_club));
end $$;
revoke all on function yps.delete_season(uuid) from public, anon;
grant execute on function yps.delete_season(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. club_periods_for_me() : periodes visibles pour l'appelant, pour les calendriers
--    Renvoie un tableau [{ id, club_id, club_name, name, start_date, end_date, no_sessions }] trie par debut.
-- ---------------------------------------------------------------------------
create or replace function yps.club_periods_for_me()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'club_id', s.club_id,
             'club_name', (select c.name from yps.clubs c where c.id = s.club_id),
             'name', s.name, 'start_date', s.start_date, 'end_date', s.end_date,
             'no_sessions', s.no_sessions) order by s.start_date, s.name)
    from yps.seasons s
    where yps.is_club_admin(s.club_id)
       or exists (select 1 from yps.coach_teams ct join yps.teams t on t.id = ct.team_id
                  where ct.coach_user_id = auth.uid() and t.club_id = s.club_id)
       or exists (select 1 from yps.memberships m
                  where m.user_id = auth.uid() and m.club_id = s.club_id)
       or exists (select 1 from yps.player_parents pp join yps.players p on p.id = pp.player_id
                  where pp.parent_user_id = auth.uid() and p.club_id = s.club_id
                    and coalesce(pp.status, 'active') in ('active', 'pending'))
  ), '[]'::jsonb);
end $$;
revoke all on function yps.club_periods_for_me() from public, anon;
grant execute on function yps.club_periods_for_me() to authenticated;
