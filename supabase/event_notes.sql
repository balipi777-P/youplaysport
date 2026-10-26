-- Precisions / commentaire d'un evenement (tenue, materiel, repas, covoiturage,
-- horaire de retour, tarif...) + choix des joueurs convoques. Fichier unique. A appliquer dans l'editeur SQL Supabase.
-- Droits inchanges : l'ecriture reste reservee au coach de l'equipe et a
-- l'admin du club (comme create_event) ; la lecture suit ev_select (can_read_team)
-- et my_convocations (familles convoquees).

alter table yps.events
  add column if not exists notes text;

alter table yps.events
  drop constraint if exists events_notes_len;
alter table yps.events
  add constraint events_notes_len check (notes is null or char_length(notes) <= 1000);

-- create_event : nouveaux parametres optionnels p_notes et p_players.
--  * p_players null  -> tout l'effectif de l'equipe (comportement historique)
--  * p_players donne -> seulement ces joueurs ; chacun doit appartenir a p_team
--    (donc a son club), sinon l'appel est REFUSE (player_not_in_team) : un coach
--    ne peut jamais convoquer un joueur d'une autre equipe ou d'un autre club.
--  * liste vide -> refusee (no_players).
-- Les anciennes signatures sont supprimees pour ne garder qu'une seule version.
drop function if exists yps.create_event(uuid, yps.event_type, timestamptz, text, text, timestamptz);
drop function if exists yps.create_event(uuid, yps.event_type, timestamptz, text, text, timestamptz, text);

create or replace function yps.create_event(
  p_team uuid, p_type yps.event_type, p_datetime timestamptz,
  p_place text default null, p_opponent text default null,
  p_rsvp_deadline timestamptz default null, p_notes text default null,
  p_players uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_event uuid; v_ids uuid[];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from yps.coach_teams ct where ct.team_id = p_team and ct.coach_user_id = v_uid
  ) and not exists (
    select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
    where t.id = p_team and m.user_id = v_uid and m.role = 'admin'
  ) then
    raise exception 'not_authorized';
  end if;

  if p_players is null then
    select coalesce(array_agg(p.id), '{}') into v_ids from yps.players p where p.team_id = p_team;
  else
    select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_players) x where x is not null;
    if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no_players'; end if;
    if exists (
      select 1 from unnest(v_ids) x
      where not exists (select 1 from yps.players p where p.id = x and p.team_id = p_team)
    ) then
      raise exception 'player_not_in_team';
    end if;
  end if;

  insert into yps.events (team_id, type, datetime, place, opponent, rsvp_deadline, notes)
    values (p_team, p_type, p_datetime, nullif(btrim(p_place),''), nullif(btrim(p_opponent),''),
            p_rsvp_deadline, nullif(btrim(p_notes),''))
    returning id into v_event;
  insert into yps.event_convocations (event_id, player_id)
    select v_event, x from unnest(v_ids) x;
  return v_event;
end $function$;

revoke all on function yps.create_event(uuid, yps.event_type, timestamptz, text, text, timestamptz, text, uuid[]) from public, anon;
grant execute on function yps.create_event(uuid, yps.event_type, timestamptz, text, text, timestamptz, text, uuid[]) to authenticated;

-- Ajouter des joueurs oublies a un evenement deja publie. Memes controles que
-- create_event ; sans doublon (contrainte unique event_id+player_id, on conflict do nothing).
-- Renvoie le nombre de joueurs reellement ajoutes.
create or replace function yps.add_event_convocations(p_event uuid, p_players uuid[])
returns integer
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_team uuid; v_ids uuid[]; v_n integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select team_id into v_team from yps.events where id = p_event;
  if v_team is null then raise exception 'event_not_found'; end if;
  if not exists (
    select 1 from yps.coach_teams ct where ct.team_id = v_team and ct.coach_user_id = v_uid
  ) and not exists (
    select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
    where t.id = v_team and m.user_id = v_uid and m.role = 'admin'
  ) then
    raise exception 'not_authorized';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_players, '{}')) x where x is not null;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no_players'; end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from yps.players p where p.id = x and p.team_id = v_team)
  ) then
    raise exception 'player_not_in_team';
  end if;

  insert into yps.event_convocations (event_id, player_id)
    select p_event, x from unnest(v_ids) x
    on conflict (event_id, player_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

revoke all on function yps.add_event_convocations(uuid, uuid[]) from public, anon;
grant execute on function yps.add_event_convocations(uuid, uuid[]) to authenticated;

-- Modifier les precisions d'un evenement deja publie (seul champ modifiable).
create or replace function yps.update_event_notes(p_event uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_team uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select team_id into v_team from yps.events where id = p_event;
  if v_team is null then raise exception 'event_not_found'; end if;
  if not exists (
    select 1 from yps.coach_teams ct where ct.team_id = v_team and ct.coach_user_id = v_uid
  ) and not exists (
    select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
    where t.id = v_team and m.user_id = v_uid and m.role = 'admin'
  ) then
    raise exception 'not_authorized';
  end if;
  update yps.events set notes = nullif(btrim(p_notes),'') where id = p_event;
end $function$;

revoke all on function yps.update_event_notes(uuid, text) from public, anon;
grant execute on function yps.update_event_notes(uuid, text) to authenticated;

-- my_convocations : renvoie aussi notes.
create or replace function yps.my_convocations()
returns jsonb
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); res jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(jsonb_agg(row order by (row->>'datetime')), '[]'::jsonb) into res
  from (
    select jsonb_build_object(
      'event_id', e.id, 'type', e.type, 'datetime', e.datetime,
      'place', e.place, 'opponent', e.opponent, 'rsvp_deadline', e.rsvp_deadline,
      'notes', e.notes,
      'team_id', e.team_id,
      'player_id', p.id, 'player_name', p.first_name || ' ' || p.last_name,
      'response', ec.response, 'responded_at', ec.responded_at
    ) row
    from yps.event_convocations ec
    join yps.events e on e.id = ec.event_id
    join yps.players p on p.id = ec.player_id
    where e.datetime >= now() - interval '1 day'
      and (
        exists (select 1 from yps.player_parents pp
                where pp.player_id = p.id and pp.parent_user_id = v_uid and pp.status = 'active')
        or p.user_id = v_uid
      )
  ) q;
  return res;
end
$function$;
