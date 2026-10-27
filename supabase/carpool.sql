-- Covoiturage sur les convocations (evenements). A RELIRE, NON APPLIQUE. Fichier unique, rejouable.
--
-- Principe
--  * events.carpool : option activable par le coach de l'equipe ou le dirigeant du club.
--  * yps.event_carpool : une ligne par (evenement, parent) = son choix. Un parent avec plusieurs
--    enfants convoques au meme evenement fait UN seul choix (pas de places comptees deux fois).
--      drive        « Je peux conduire »       places libres obligatoires, 1 a 8
--      need         « J'ai besoin d'une place » (nombre = enfants du parent convoques a l'evenement)
--      self         « Je me debrouille »
--      unavailable  « Indisponible »
--  * Un parent dont TOUS les enfants convoques ont repondu « absent » n'est pas concerne : il ne peut
--    pas enregistrer de choix (not_found) et n'apparait ni dans les totaux ni dans le detail. Un enfant
--    sans reponse ou « present » compte. Si un parent passe a « absent » apres avoir choisi, son choix
--    est conserve en base mais ignore partout (il reapparait si l'enfant repasse a « present »).
--  * Aucune coordonnee (email, telephone) n'est lue, stockee ni renvoyee. Pas de texte libre.
--  * Table fermee : RLS activee, aucune policy, aucun droit direct. Tout passe par des RPC
--    SECURITY DEFINER (search_path fixe), droits retires a public et anon.
--  * Suppression : ON DELETE CASCADE sur l'evenement (et sur le compte du parent).
--    Desactiver l'option supprime aussi les choix deja saisis.
--  * Journal d'audit : action + cible + compteurs, jamais le choix ni les noms.
--
-- Hors perimetre (inchange) : create_event, rsvp, my_convocations, event_responses.
-- L'option se coche apres la creation de l'evenement (set_event_carpool).

-- 1. Option sur l'evenement ------------------------------------------------
alter table yps.events
  add column if not exists carpool boolean not null default false;

-- 2. Table des choix ---------------------------------------------------------
create table if not exists yps.event_carpool (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references yps.events(id) on delete cascade,
  parent_user_id uuid not null references yps.app_users(id) on delete cascade,
  choice         text not null,
  seats          smallint,
  updated_at     timestamptz not null default now(),
  constraint event_carpool_uniq unique (event_id, parent_user_id),
  constraint event_carpool_choice check (choice in ('drive','need','self','unavailable')),
  constraint event_carpool_seats check (
    (choice = 'drive' and seats between 1 and 8) or (choice <> 'drive' and seats is null))
);

alter table yps.event_carpool enable row level security;
-- Aucune policy : seules les fonctions ci-dessous (SECURITY DEFINER) lisent et ecrivent.
revoke all on yps.event_carpool from public, anon, authenticated;

-- 3. Activer / desactiver (coach de l'equipe ou dirigeant du club) ---------------
create or replace function yps.set_event_carpool(p_event uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_enabled is null then raise exception 'invalid_value'; end if;
  select team_id into v_team from yps.events where id = p_event;
  if v_team is null then raise exception 'event_not_found'; end if;
  if not exists (select 1 from yps.coach_teams ct where ct.team_id = v_team and ct.coach_user_id = v_uid)
     and not exists (select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
                     where t.id = v_team and m.user_id = v_uid and m.role = 'admin') then
    raise exception 'not_allowed';
  end if;
  update yps.events set carpool = p_enabled where id = p_event;
  if not p_enabled then
    delete from yps.event_carpool where event_id = p_event;
  end if;
  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'carpool_toggle', 'event:' || p_event::text, jsonb_build_object('enabled', p_enabled));
end $function$;

-- 4. Enregistrer son choix (parent concerne uniquement) ----------------------------
-- Parent concerne = parent actif d'au moins un joueur convoque a cet evenement.
-- Erreurs : not_authenticated, not_found (evenement ou convocation inconnus pour ce parent),
-- carpool_off, event_past, invalid_choice, invalid_seats.
create or replace function yps.set_carpool_choice(p_event uuid, p_choice text, p_seats integer default null)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_on boolean; v_dt timestamptz; v_seats smallint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_choice is null or p_choice not in ('drive','need','self','unavailable') then
    raise exception 'invalid_choice';
  end if;
  select e.carpool, e.datetime into v_on, v_dt from yps.events e where e.id = p_event;
  if v_on is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from yps.event_convocations ec
    join yps.player_parents pp on pp.player_id = ec.player_id
    where ec.event_id = p_event and pp.parent_user_id = v_uid and pp.status = 'active'
      and ec.response is distinct from 'absent'
  ) then
    raise exception 'not_found';
  end if;
  if not v_on then raise exception 'carpool_off'; end if;
  if v_dt is not null and v_dt < now() then raise exception 'event_past'; end if;
  if p_choice = 'drive' then
    if p_seats is null or p_seats < 1 or p_seats > 8 then raise exception 'invalid_seats'; end if;
    v_seats := p_seats;
  else
    v_seats := null;  -- places ignorees hors « conduire »
  end if;
  insert into yps.event_carpool (event_id, parent_user_id, choice, seats, updated_at)
  values (p_event, v_uid, p_choice, v_seats, now())
  on conflict (event_id, parent_user_id)
  do update set choice = excluded.choice, seats = excluded.seats, updated_at = now();
  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'carpool_set', 'event:' || p_event::text, '{}'::jsonb);
end $function$;

-- 5. Totaux + choix du parent appelant (parents concernes, coach, dirigeant) ------------
-- Renvoie : { enabled, seats_offered, seats_requested, drivers, mine:{choice,seats} | null }
-- Aucun nom, aucune coordonnee. « Demandes » = enfants convoques des parents ayant choisi « besoin d'une place ».
-- Un parent non concerne par l'evenement et qui n'est pas staff de l'equipe : not_found.
create or replace function yps.carpool_summary(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_team uuid; v_on boolean; v_staff boolean; res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select team_id, carpool into v_team, v_on from yps.events where id = p_event;
  if v_team is null then raise exception 'not_found'; end if;
  v_staff := exists (select 1 from yps.coach_teams ct where ct.team_id = v_team and ct.coach_user_id = v_uid)
          or exists (select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
                     where t.id = v_team and m.user_id = v_uid and m.role = 'admin');
  if not v_staff and not exists (
    select 1 from yps.event_convocations ec
    join yps.player_parents pp on pp.player_id = ec.player_id
    where ec.event_id = p_event and pp.parent_user_id = v_uid and pp.status = 'active'
  ) then
    raise exception 'not_found';
  end if;
  if not v_on then return jsonb_build_object('enabled', false); end if;
  -- Parent dont tous les enfants sont « absent » : aucune donnee, pas de choix possible.
  if not v_staff and not exists (
    select 1 from yps.event_convocations ec
    join yps.player_parents pp on pp.player_id = ec.player_id
    where ec.event_id = p_event and pp.parent_user_id = v_uid and pp.status = 'active'
      and ec.response is distinct from 'absent'
  ) then
    return jsonb_build_object('enabled', true, 'excluded', true);
  end if;

  select jsonb_build_object(
    'enabled', true,
    'seats_offered',   coalesce(sum(cp.seats) filter (where cp.choice = 'drive'), 0),
    'drivers',         count(*) filter (where cp.choice = 'drive'),
    'seats_requested', coalesce(sum(kids.n) filter (where cp.choice = 'need'), 0),
    'mine', (select jsonb_build_object('choice', m.choice, 'seats', m.seats)
             from yps.event_carpool m where m.event_id = p_event and m.parent_user_id = v_uid)
  ) into res
  from yps.event_carpool cp
  left join lateral (
    select count(distinct ec.player_id) n
    from yps.event_convocations ec
    join yps.player_parents pp on pp.player_id = ec.player_id
    where ec.event_id = p_event and pp.parent_user_id = cp.parent_user_id and pp.status = 'active'
      and ec.response is distinct from 'absent'
  ) kids on true
  where cp.event_id = p_event and kids.n > 0;
  return res;
end $function$;

-- 6. Detail (coach de l'equipe et dirigeant du club uniquement) -----------------------
-- Renvoie : { enabled, seats_offered, seats_requested, no_answer, people:[{ parent_name, children:[..],
--   choice, seats, updated_at }] }. Aucun email ni telephone. Seuls les parents encore actifs
-- et dont un enfant convoque n'a pas repondu « absent » apparaissent.
create or replace function yps.carpool_detail(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_team uuid; v_on boolean; res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select team_id, carpool into v_team, v_on from yps.events where id = p_event;
  if v_team is null then raise exception 'not_found'; end if;
  if not exists (select 1 from yps.coach_teams ct where ct.team_id = v_team and ct.coach_user_id = v_uid)
     and not exists (select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
                     where t.id = v_team and m.user_id = v_uid and m.role = 'admin') then
    raise exception 'not_allowed';
  end if;
  if not v_on then return jsonb_build_object('enabled', false); end if;

  with fam as (   -- un parent = ses enfants convoques non « absent » a cet evenement
    select pp.parent_user_id,
           array_agg(p.first_name || ' ' || p.last_name order by p.first_name, p.last_name) as kids,
           count(*) as n
    from yps.event_convocations ec
    join yps.players p on p.id = ec.player_id
    join yps.player_parents pp on pp.player_id = p.id and pp.status = 'active'
    where ec.event_id = p_event and ec.response is distinct from 'absent'
    group by pp.parent_user_id
  )
  select jsonb_build_object(
    'enabled', true,
    'seats_offered',   coalesce((select sum(cp.seats) from yps.event_carpool cp
                                 join fam on fam.parent_user_id = cp.parent_user_id
                                 where cp.event_id = p_event and cp.choice = 'drive'), 0),
    'seats_requested', coalesce((select sum(fam.n) from yps.event_carpool cp
                                 join fam on fam.parent_user_id = cp.parent_user_id
                                 where cp.event_id = p_event and cp.choice = 'need'), 0),
    'no_answer',       (select count(*) from fam
                        where not exists (select 1 from yps.event_carpool cp
                                          where cp.event_id = p_event and cp.parent_user_id = fam.parent_user_id)),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'parent_name', coalesce(nullif(btrim(u.full_name), ''), '—'),
               'children', to_jsonb(fam.kids),
               'choice', cp.choice,
               'seats', cp.seats,
               'updated_at', cp.updated_at) order by cp.choice, u.full_name)
      from yps.event_carpool cp
      join fam on fam.parent_user_id = cp.parent_user_id
      left join yps.app_users u on u.id = cp.parent_user_id
      where cp.event_id = p_event), '[]'::jsonb)
  ) into res;
  return res;
end $function$;

-- 7. Droits : retires a public et anon, accordes aux comptes connectes ---------------------
revoke all on function yps.set_event_carpool(uuid, boolean)        from public, anon;
revoke all on function yps.set_carpool_choice(uuid, text, integer) from public, anon;
revoke all on function yps.carpool_summary(uuid)                   from public, anon;
revoke all on function yps.carpool_detail(uuid)                    from public, anon;
grant execute on function yps.set_event_carpool(uuid, boolean)        to authenticated;
grant execute on function yps.set_carpool_choice(uuid, text, integer) to authenticated;
grant execute on function yps.carpool_summary(uuid)                   to authenticated;
grant execute on function yps.carpool_detail(uuid)                    to authenticated;
