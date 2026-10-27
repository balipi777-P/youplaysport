-- Messages du club : signal « non lu » cote demandeur (parent / coach).
-- A RELIRE puis appliquer soi-meme : ce fichier n'a PAS ete execute. A lancer APRES club_requests.sql
-- (qui, d'apres la base, est deja en place).
--
-- Principe : un message du club (author_side = 'club') est non lu pour le demandeur tant que
-- club_requests.member_last_read_at est anterieur a sa date. Seul le demandeur peut faire avancer ce repere,
-- via mark_club_request_read. Un message ecrit par le demandeur lui-meme n'est jamais « non lu ».
--
-- Notifications : yps.notifications (user_id, type, payload, read_at, created_at) accepte bien une insertion
-- cote base, MAIS la page Alertes affiche UNIQUEMENT les lignes de cette table des qu'elle en contient une
-- (la boite composee a partir des seances, competences et convocations disparait alors pour cet utilisateur).
-- Inserer une notification a chaque reponse du club ferait donc disparaitre le reste des alertes du parent.
-- On s'en tient a la pastille : aucune ecriture dans notifications ici.

-- ---------------------------------------------------------------------------
-- 1. Colonne de lecture
-- ---------------------------------------------------------------------------
alter table yps.club_requests add column if not exists member_last_read_at timestamptz;

-- Reprise de l'existant : les reponses deja presentes ne passent pas toutes en « non lu » au deploiement.
update yps.club_requests set member_last_read_at = updated_at where member_last_read_at is null;

-- ---------------------------------------------------------------------------
-- 2. mark_club_request_read(p_request) : demandeur uniquement
-- ---------------------------------------------------------------------------
create or replace function yps.mark_club_request_read(p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Ne touche ni a updated_at ni au statut : seul le repere de lecture avance.
  update yps.club_requests
     set member_last_read_at = now()
   where id = p_request and from_user_id = v_uid;
  if not found then raise exception 'not_allowed'; end if;
end $$;
revoke all on function yps.mark_club_request_read(uuid) from public, anon;
grant execute on function yps.mark_club_request_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. my_club_unread() : compteur + derniere demande non lue (pastilles et carte du Journal)
--    Renvoie { "count": n, "latest": { "id": ..., "subject": ... } | null }
-- ---------------------------------------------------------------------------
create or replace function yps.my_club_unread()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_latest jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select count(*) into v_count
    from yps.club_requests r
   where r.from_user_id = v_uid
     and exists (select 1 from yps.club_request_messages m
                  where m.request_id = r.id and m.author_side = 'club'
                    and m.created_at > coalesce(r.member_last_read_at, '-infinity'::timestamptz));

  select jsonb_build_object('id', r.id, 'subject', r.subject) into v_latest
    from yps.club_requests r
   where r.from_user_id = v_uid
     and exists (select 1 from yps.club_request_messages m
                  where m.request_id = r.id and m.author_side = 'club'
                    and m.created_at > coalesce(r.member_last_read_at, '-infinity'::timestamptz))
   order by r.updated_at desc
   limit 1;

  return jsonb_build_object('count', v_count, 'latest', v_latest);
end $$;
revoke all on function yps.my_club_unread() from public, anon;
grant execute on function yps.my_club_unread() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. my_club_requests() : ajoute « unread » a chaque demande (page /messages)
--    Meme corps que dans club_requests.sql, plus la cle 'unread'. La signature ne change pas.
-- ---------------------------------------------------------------------------
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
        'unread', exists (select 1 from yps.club_request_messages m
                           where m.request_id = r.id and m.author_side = 'club'
                             and m.created_at > coalesce(r.member_last_read_at, '-infinity'::timestamptz)),
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
