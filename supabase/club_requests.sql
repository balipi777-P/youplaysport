-- Contacter le club (parent / coach -> dirigeant du club) + ticket Support ouvert aux parents et coachs.
-- A RELIRE puis appliquer soi-meme : ce fichier n'a PAS ete execute.
--
-- Regles :
--  * Seuls un parent ou un coach du club peuvent ecrire au club. Un athlete (compte autonome, mineur) ne peut pas,
--    le dirigeant du club non plus (il est le destinataire).
--  * Texte seul : pas de piece jointe, pas de lien (refuse cote base). Sujet <= 120 car., message <= 2000 car.
--  * Frequence limitee par utilisateur : 3 demandes / heure, 8 demandes / 24 h, 20 messages / heure.
--  * Lecture : le demandeur voit SES demandes, l'admin du club voit celles de SON club. Personne d'autre
--    (ni coach, ni autre club, ni admin plateforme). Aucune ecriture directe : tout passe par les fonctions.
--  * Suppression de compte : les cles vers auth.users sont en ON DELETE SET NULL. Le fil reste, l'auteur
--    devient NULL et s'affiche « Ancien membre ». Rien n'est supprime en cascade. delete_my_account n'a pas a changer.
--  * Chaque creation / reponse / cloture est journalisee dans yps.audit_log (jamais le contenu du message).
--
-- Ecarts par rapport aux colonnes demandees (ajouts) : club_requests.updated_at (tri, derniere activite) et
-- club_request_messages.author_side ('member' | 'club') pour savoir de quel cote est un message meme si son auteur
-- a supprime son compte.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists yps.club_requests (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references yps.clubs(id) on delete cascade,
  from_user_id uuid references auth.users(id) on delete set null,
  from_role    text not null check (from_role in ('parent', 'coach')),
  subject      text not null check (char_length(subject) between 1 and 120),
  status       text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists yps.club_request_messages (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references yps.club_requests(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_side    text not null check (author_side in ('member', 'club')),
  body           text not null check (char_length(body) between 1 and 2000),
  created_at     timestamptz not null default now()
);

create index if not exists club_requests_club_idx on yps.club_requests (club_id, status, updated_at desc);
create index if not exists club_requests_user_idx on yps.club_requests (from_user_id, created_at desc);
create index if not exists club_request_messages_req_idx on yps.club_request_messages (request_id, created_at);
create index if not exists club_request_messages_author_idx on yps.club_request_messages (author_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS : lecture seule pour le demandeur et l'admin du club
-- ---------------------------------------------------------------------------
alter table yps.club_requests enable row level security;
alter table yps.club_request_messages enable row level security;

drop policy if exists cr_select on yps.club_requests;
create policy cr_select on yps.club_requests for select to authenticated
  using (from_user_id = (select auth.uid()) or yps.is_club_admin(club_id));

drop policy if exists crm_select on yps.club_request_messages;
create policy crm_select on yps.club_request_messages for select to authenticated
  using (exists (
    select 1 from yps.club_requests r
    where r.id = request_id
      and (r.from_user_id = (select auth.uid()) or yps.is_club_admin(r.club_id))));

revoke all on yps.club_requests, yps.club_request_messages from public, anon, authenticated;
grant select on yps.club_requests, yps.club_request_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Role de l'appelant dans un club : 'coach' | 'parent' | null (athlete seul, dirigeant, inconnu)
-- ---------------------------------------------------------------------------
create or replace function yps._club_contact_role(p_club uuid)
returns text
language sql
stable
security definer
set search_path to 'yps', 'public'
as $$
  select case
    when auth.uid() is null then null
    when yps.is_club_admin(p_club) then null
    when exists (select 1 from yps.coach_teams ct join yps.teams t on t.id = ct.team_id
                 where ct.coach_user_id = auth.uid() and t.club_id = p_club) then 'coach'
    when exists (select 1 from yps.memberships m
                 where m.user_id = auth.uid() and m.club_id = p_club and m.role = 'parent')
      or exists (select 1 from yps.player_parents pp join yps.players p on p.id = pp.player_id
                 where pp.parent_user_id = auth.uid() and p.club_id = p_club
                   and coalesce(pp.status, 'active') in ('active', 'pending')) then 'parent'
    else null
  end;
$$;
revoke all on function yps._club_contact_role(uuid) from public, anon, authenticated;

-- Texte seul : refuse les liens (http(s), www., adresses de site courantes).
create or replace function yps._text_has_link(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_text, '') ~* '(https?:|www\.|://|[[:alnum:]-]+\.(com|fr|net|org|io|ly|me|co|app|eu|info|biz|xyz)([^[:alnum:]]|$))';
$$;
revoke all on function yps._text_has_link(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_club_request(p_club, p_subject, p_body) -> id de la demande
-- ---------------------------------------------------------------------------
create or replace function yps.create_club_request(p_club uuid, p_subject text, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_role := yps._club_contact_role(p_club);
  if v_role is null then raise exception 'not_allowed'; end if;
  if v_subject = '' or v_body = '' then raise exception 'empty'; end if;
  if char_length(v_subject) > 120 or char_length(v_body) > 2000 then raise exception 'too_long'; end if;
  if yps._text_has_link(v_subject) or yps._text_has_link(v_body) then raise exception 'links_forbidden'; end if;
  if (select count(*) from yps.club_requests where from_user_id = v_uid and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from yps.club_requests where from_user_id = v_uid and created_at > now() - interval '24 hours') >= 8 then
    raise exception 'rate_limited';
  end if;

  insert into yps.club_requests (club_id, from_user_id, from_role, subject)
  values (p_club, v_uid, v_role, v_subject) returning id into v_id;
  insert into yps.club_request_messages (request_id, author_user_id, author_side, body)
  values (v_id, v_uid, 'member', v_body);

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'club_request_create', 'club_request:' || v_id::text,
          jsonb_build_object('club', p_club, 'role', v_role));
  return v_id;
end $$;
revoke all on function yps.create_club_request(uuid, text, text) from public, anon;
grant execute on function yps.create_club_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. reply_club_request(p_request, p_body) : demandeur ou admin du club
-- ---------------------------------------------------------------------------
create or replace function yps.reply_club_request(p_request uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_req yps.club_requests%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_side text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from yps.club_requests where id = p_request for update;
  if not found then raise exception 'not_allowed'; end if;
  if yps.is_club_admin(v_req.club_id) then v_side := 'club';
  elsif v_req.from_user_id = v_uid then v_side := 'member';
  else raise exception 'not_allowed'; end if;
  if v_req.status = 'closed' then raise exception 'closed'; end if;
  if v_body = '' then raise exception 'empty'; end if;
  if char_length(v_body) > 2000 then raise exception 'too_long'; end if;
  if yps._text_has_link(v_body) then raise exception 'links_forbidden'; end if;
  if (select count(*) from yps.club_request_messages where author_user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  -- Un membre qui n'est plus parent / coach du club ne peut plus relancer.
  if v_side = 'member' and yps._club_contact_role(v_req.club_id) is null then raise exception 'not_allowed'; end if;

  insert into yps.club_request_messages (request_id, author_user_id, author_side, body)
  values (p_request, v_uid, v_side, v_body);
  update yps.club_requests
     set status = case when v_side = 'club' then 'answered' else 'open' end, updated_at = now()
   where id = p_request;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'club_request_reply', 'club_request:' || p_request::text, jsonb_build_object('side', v_side));
end $$;
revoke all on function yps.reply_club_request(uuid, text) from public, anon;
grant execute on function yps.reply_club_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. close_club_request(p_request) : demandeur ou admin du club
-- ---------------------------------------------------------------------------
create or replace function yps.close_club_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_req yps.club_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from yps.club_requests where id = p_request for update;
  if not found or not (yps.is_club_admin(v_req.club_id) or v_req.from_user_id = v_uid) then
    raise exception 'not_allowed';
  end if;
  update yps.club_requests set status = 'closed', updated_at = now() where id = p_request;
  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'club_request_close', 'club_request:' || p_request::text,
          jsonb_build_object('by', case when v_req.from_user_id = v_uid then 'member' else 'club' end));
end $$;
revoke all on function yps.close_club_request(uuid) from public, anon;
grant execute on function yps.close_club_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Lecture : console du club (admin) et « Mes demandes » (demandeur)
--    Pas d'email dans ces retours. Auteur supprime -> « Ancien membre » (NULL cote nom).
-- ---------------------------------------------------------------------------
create or replace function yps.club_requests_for_admin(p_club uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not yps.is_club_admin(p_club) then raise exception 'not_allowed'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'updated_at') desc)
    from (
      select jsonb_build_object(
        'id', r.id, 'subject', r.subject, 'status', r.status, 'from_role', r.from_role,
        'from_name', (select nullif(btrim(u.full_name), '') from yps.app_users u where u.id = r.from_user_id),
        'created_at', r.created_at, 'updated_at', r.updated_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', m.id, 'side', m.author_side, 'body', m.body, 'created_at', m.created_at,
                   'author_name', (select nullif(btrim(u.full_name), '') from yps.app_users u where u.id = m.author_user_id))
                 order by m.created_at)
          from yps.club_request_messages m where m.request_id = r.id), '[]'::jsonb)) as x
      from yps.club_requests r
      where r.club_id = p_club
      order by r.updated_at desc
      limit 200) q), '[]'::jsonb);
end $$;
revoke all on function yps.club_requests_for_admin(uuid) from public, anon;
grant execute on function yps.club_requests_for_admin(uuid) to authenticated;

create or replace function yps.my_club_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'updated_at') desc)
    from (
      select jsonb_build_object(
        'id', r.id, 'subject', r.subject, 'status', r.status,
        'club_name', (select c.name from yps.clubs c where c.id = r.club_id),
        'created_at', r.created_at, 'updated_at', r.updated_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.id, 'side', m.author_side, 'body', m.body, 'created_at', m.created_at)
                           order by m.created_at)
          from yps.club_request_messages m where m.request_id = r.id), '[]'::jsonb)) as x
      from yps.club_requests r
      where r.from_user_id = auth.uid()
      order by r.updated_at desc
      limit 50) q), '[]'::jsonb);
end $$;
revoke all on function yps.my_club_requests() from public, anon;
grant execute on function yps.my_club_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ticket Support plateforme pour un parent / coach
--    support_tickets n'autorise l'insertion qu'aux dirigeants (policy st_insert) et n'a pas de colonne auteur :
--    cette fonction insere au nom du parent / coach et place son nom, son email et son role en tete du texte
--    pour que la plateforme puisse repondre. Limite : 3 tickets / 24 h par utilisateur.
-- ---------------------------------------------------------------------------
create or replace function yps.create_platform_ticket(p_club uuid, p_subject text, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
  v_mail text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_role := yps._club_contact_role(p_club);
  if v_role is null then raise exception 'not_allowed'; end if;
  if v_subject = '' or v_body = '' then raise exception 'empty'; end if;
  if char_length(v_subject) > 120 or char_length(v_body) > 4000 then raise exception 'too_long'; end if;
  if (select count(*) from yps.audit_log
       where actor_user_id = v_uid and action = 'platform_ticket_create' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited';
  end if;
  select nullif(btrim(full_name), ''), email into v_name, v_mail from yps.app_users where id = v_uid;

  insert into yps.support_tickets (club_id, subject, body, priority)
  values (p_club, v_subject,
          '[' || v_role || ' — ' || coalesce(v_name, 'sans nom') || ' — ' || coalesce(v_mail, 'sans email') || ']'
            || E'\n\n' || v_body,
          'normal')
  returning id into v_id;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'platform_ticket_create', 'support_ticket:' || v_id::text,
          jsonb_build_object('club', p_club, 'role', v_role));
  return v_id;
end $$;
revoke all on function yps.create_platform_ticket(uuid, text, text) from public, anon;
grant execute on function yps.create_platform_ticket(uuid, text, text) to authenticated;
