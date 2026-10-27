-- Compteurs d'alertes des accueils (pastilles rouges de l'Acces rapide).
-- A RELIRE puis appliquer soi-meme : ce fichier n'a PAS ete execute. Independant de carpool.sql sauf pour
-- events.carpool et event_carpool (deja appliques) et de club_requests_read.sql (my_club_unread, deja prevu).
--
-- Principes
--  * Lecture uniquement par des fonctions SECURITY DEFINER a search_path fixe ; droits retires a public et anon.
--  * Les compteurs ne renvoient que des nombres (et des identifiants d'evenement pour le detail) :
--    jamais de nom, d'enfant, de message ni de choix.
--  * Aucune ecriture dans yps.notifications (la page Alertes n'afficherait plus que ses lignes).
--  * Un seul ecrit nouveau : le repere de lecture par utilisateur et par evenement (yps.event_reads),
--    avance par mark_event_seen a l'ouverture de l'evenement.
--  * Perimetre « staff » = coach de l'equipe (coach_teams) ou dirigeant du club (memberships.role = 'admin').
--  * Fenetres : evenements a venir (ou passes depuis moins de 24 h) ; seances non pointees des 30 derniers jours.
--    Fuseau de reference des dates : Europe/Paris.

-- ---------------------------------------------------------------------------
-- 1. Repere de lecture par utilisateur et par evenement
-- ---------------------------------------------------------------------------
create table if not exists yps.event_reads (
  user_id  uuid not null references yps.app_users(id) on delete cascade,
  event_id uuid not null references yps.events(id) on delete cascade,
  seen_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table yps.event_reads enable row level security;
-- Aucune policy : seules les fonctions ci-dessous (SECURITY DEFINER) lisent et ecrivent.
revoke all on yps.event_reads from public, anon, authenticated;

-- Reprise de l'existant : au deploiement, rien de ce qui est deja en base n'apparait « nouveau ».
insert into yps.event_reads (user_id, event_id, seen_at)
select s.uid, e.id, now()
from yps.events e
join lateral (
  select ct.coach_user_id as uid from yps.coach_teams ct where ct.team_id = e.team_id
  union
  select m.user_id from yps.teams t join yps.memberships m on m.club_id = t.club_id
   where t.id = e.team_id and m.role = 'admin'
) s on true
where e.datetime >= now() - interval '1 day'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Evenements dans le perimetre staff de l'appelant (utilitaire interne)
-- ---------------------------------------------------------------------------
create or replace function yps._staff_event_ids(p_uid uuid)
returns table (event_id uuid)
language sql
stable
security definer
set search_path to 'yps', 'public'
as $$
  select e.id
  from yps.events e
  where e.datetime >= now() - interval '1 day'
    and (exists (select 1 from yps.coach_teams ct where ct.team_id = e.team_id and ct.coach_user_id = p_uid)
         or exists (select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
                     where t.id = e.team_id and m.user_id = p_uid and m.role = 'admin'));
$$;
revoke all on function yps._staff_event_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. mark_event_seen(p_event) : l'utilisateur a ouvert l'evenement
-- ---------------------------------------------------------------------------
create or replace function yps.mark_event_seen(p_event uuid)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from yps._staff_event_ids(v_uid) s where s.event_id = p_event) then
    raise exception 'not_allowed';
  end if;
  insert into yps.event_reads (user_id, event_id, seen_at) values (v_uid, p_event, now())
  on conflict (user_id, event_id) do update set seen_at = excluded.seen_at;
end $$;
revoke all on function yps.mark_event_seen(uuid) from public, anon;
grant execute on function yps.mark_event_seen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. staff_event_news() : detail par evenement (ids et nombres seulement)
--    -> [{ event_id, responses, carpool }] pour les evenements qui ont du nouveau
--    responses = reponses Present/Absent posees depuis le repere ; carpool = choix saisis ou modifies depuis le repere.
--    Sans repere (evenement cree apres le deploiement) : tout ce qui suit la creation de l'evenement est nouveau.
-- ---------------------------------------------------------------------------
create or replace function yps.staff_event_news()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('event_id', x.id, 'responses', x.r, 'carpool', x.c) order by x.id)
    from (
      select e.id,
        (select count(*) from yps.event_convocations ec
          where ec.event_id = e.id and ec.response is not null
            and ec.responded_at > coalesce(rd.seen_at, e.created_at))::int as r,
        (select count(*) from yps.event_carpool cp
          where e.carpool and cp.event_id = e.id
            and cp.updated_at > coalesce(rd.seen_at, e.created_at))::int as c
      from yps._staff_event_ids(v_uid) s
      join yps.events e on e.id = s.event_id
      left join yps.event_reads rd on rd.event_id = e.id and rd.user_id = v_uid
    ) x
    where x.r + x.c > 0), '[]'::jsonb);
end $$;
revoke all on function yps.staff_event_news() from public, anon;
grant execute on function yps.staff_event_news() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. staff_alert_counts() : pastilles de l'accueil coach / dirigeant
--    -> { events, sessions, messages }
--    events   = nouvelles reponses + nouveaux choix de covoiturage (somme du detail ci-dessus)
--    sessions = seances terminees, des 30 derniers jours, sans aucun pointage, sur les equipes du perimetre
--    messages = reponses du club non lues par l'appelant (comme my_club_unread) ; pour un dirigeant, on y ajoute
--               les demandes ouvertes de son club (status = 'open') qui attendent une reponse
-- ---------------------------------------------------------------------------
create or replace function yps.staff_alert_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_events int;
  v_sessions int;
  v_replies int;
  v_open int;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_time time := (now() at time zone 'Europe/Paris')::time;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select coalesce(sum((n->>'responses')::int + (n->>'carpool')::int), 0)::int into v_events
    from jsonb_array_elements(yps.staff_event_news()) n;

  select count(*)::int into v_sessions
    from yps.sessions s
   where s.date between v_today - 30 and v_today
     and (s.date < v_today or (s.end_time is not null and s.end_time < v_time))
     and (exists (select 1 from yps.coach_teams ct where ct.team_id = s.team_id and ct.coach_user_id = v_uid)
          or exists (select 1 from yps.teams t join yps.memberships m on m.club_id = t.club_id
                      where t.id = s.team_id and m.user_id = v_uid and m.role = 'admin'))
     and not exists (select 1 from yps.attendance a where a.session_id = s.id);

  select count(*)::int into v_replies
    from yps.club_requests r
   where r.from_user_id = v_uid
     and exists (select 1 from yps.club_request_messages m
                  where m.request_id = r.id and m.author_side = 'club'
                    and m.created_at > coalesce(r.member_last_read_at, '-infinity'::timestamptz));

  select count(*)::int into v_open
    from yps.club_requests r
   where r.status = 'open' and yps.is_club_admin(r.club_id);

  return jsonb_build_object('events', v_events, 'sessions', v_sessions, 'messages', v_replies + v_open);
end $$;
revoke all on function yps.staff_alert_counts() from public, anon;
grant execute on function yps.staff_alert_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. parent_alert_counts() : pastille Agenda du parent
--    -> { convocations, carpool }
--    convocations = evenements a venir ou l'un de ses enfants (rattachement actif) n'a pas repondu
--    carpool      = evenements a venir ou l'option est activee, ou un enfant est « Present »,
--                   et ou le parent n'a enregistre aucun choix
--    Un meme evenement peut compter dans les deux lignes (une reponse a donner, un covoiturage a renseigner).
--    La pastille Club du parent reste my_club_unread().
-- ---------------------------------------------------------------------------
create or replace function yps.parent_alert_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_conv int;
  v_carpool int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select count(distinct ec.event_id)::int into v_conv
    from yps.event_convocations ec
    join yps.events e on e.id = ec.event_id
    join yps.player_parents pp on pp.player_id = ec.player_id
   where pp.parent_user_id = v_uid and pp.status = 'active'
     and ec.response is null
     and e.datetime >= now();

  select count(distinct e.id)::int into v_carpool
    from yps.events e
    join yps.event_convocations ec on ec.event_id = e.id
    join yps.player_parents pp on pp.player_id = ec.player_id
   where e.carpool and e.datetime >= now()
     and pp.parent_user_id = v_uid and pp.status = 'active'
     and ec.response = 'present'
     and not exists (select 1 from yps.event_carpool cp where cp.event_id = e.id and cp.parent_user_id = v_uid);

  return jsonb_build_object('convocations', v_conv, 'carpool', v_carpool);
end $$;
revoke all on function yps.parent_alert_counts() from public, anon;
grant execute on function yps.parent_alert_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. my_pending_convocations() : alerte « nouvel evenement » du parent
--    -> { count, next: { id, date, type } | null }
--    count = convocations a venir (evenement non passe) sans reponse, pour les enfants a rattachement actif
--            du parent connecte. Un evenement n'est compte qu'une fois meme si plusieurs enfants sont convoques.
--    next  = le plus proche de ces evenements : identifiant, date, type. Ni nom d'enfant, ni lieu, ni notes.
--    Le compteur tombe a 0 des que le parent a repondu Present ou Absent. Aucune ecriture.
-- ---------------------------------------------------------------------------
create or replace function yps.my_pending_convocations()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_next jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  with pending as (
    select distinct e.id, e.datetime, e.type
      from yps.event_convocations ec
      join yps.events e on e.id = ec.event_id
      join yps.player_parents pp on pp.player_id = ec.player_id
     where pp.parent_user_id = v_uid and pp.status = 'active'
       and ec.response is null
       and e.datetime >= now()
  )
  select (select count(*) from pending)::int,
         (select jsonb_build_object('id', p.id, 'date', p.datetime, 'type', p.type)
            from pending p order by p.datetime asc, p.id limit 1)
    into v_count, v_next;

  return jsonb_build_object('count', v_count, 'next', v_next);
end $$;
revoke all on function yps.my_pending_convocations() from public, anon;
grant execute on function yps.my_pending_convocations() to authenticated;
