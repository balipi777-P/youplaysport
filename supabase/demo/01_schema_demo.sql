-- 01 — Marqueur démo + exclusion des statistiques + tableau de bord « ville ».
-- À RELIRE puis appliquer sur le projet de TEST (branche / projet séparé). Rien n'est appliqué automatiquement.

alter table yps.clubs add column if not exists is_demo boolean not null default false;

-- Statistiques plateforme : exclut les clubs de démo (et leurs données).
create or replace function yps.sa_overview()
 returns jsonb language plpgsql security definer set search_path to 'yps','public' as $function$
declare res jsonb;
begin
  perform yps.sa_guard();
  select jsonb_build_object(
    'clubs',    (select count(*) from yps.clubs where not is_demo),
    'athletes', (select count(*) from yps.players p join yps.clubs c on c.id=p.club_id where not c.is_demo),
    'coaches',  (select count(distinct m.user_id) from yps.memberships m join yps.clubs c on c.id=m.club_id where m.role='coach' and not c.is_demo),
    'parents',  (select count(distinct pp.parent_user_id) from yps.player_parents pp join yps.players p on p.id=pp.player_id join yps.clubs c on c.id=p.club_id where not c.is_demo),
    'trial',    (select count(*) from yps.clubs where status='trial' and not is_demo),
    'active',   (select count(*) from yps.clubs where status <> 'trial' and not is_demo),
    'mrr',      (select coalesce(sum(p.price),0) from yps.clubs c join yps.plans p on p.key=c.plan_key where c.status <> 'trial' and not c.is_demo),
    'trial_potential', (select coalesce(sum(p.price),0) from yps.clubs c join yps.plans p on p.key=c.plan_key where c.status='trial' and not c.is_demo),
    'expiring', (select count(*) from yps.clubs where status='trial' and not is_demo and trial_ends_at is not null and trial_ends_at < now() + interval '14 days'),
    'by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('key',p.key,'name',p.name,'price',p.price,'clubs',coalesce(c.cnt,0)) order by p.price), '[]'::jsonb)
      from yps.plans p
      left join (select plan_key, count(*) cnt from yps.clubs where not is_demo group by plan_key) c on c.plan_key=p.key
    ),
    'open_tickets', (select count(*) from yps.support_tickets t join yps.clubs c on c.id=t.club_id where t.status <> 'resolved' and not c.is_demo)
  ) into res;
  return res;
end $function$;

-- sa_clubs : expose is_demo sans filtrer le club (la console plateforme voit tout, avec le marqueur).
create or replace function yps.sa_clubs()
 returns jsonb language plpgsql security definer set search_path to 'yps','public' as $function$
declare res jsonb;
begin
  perform yps.sa_guard();
  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb) into res
  from (
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'plan_key', c.plan_key,
      'plan_name', pl.name, 'status', c.status,
      'trial_ends_at', c.trial_ends_at, 'created_at', c.created_at,
      'is_demo', c.is_demo,
      'licencies', (select count(*) from yps.players p where p.club_id=c.id),
      'teams', (select count(*) from yps.teams t where t.club_id=c.id),
      'members', (select count(*) from yps.memberships m where m.club_id=c.id)
    ) row
    from yps.clubs c left join yps.plans pl on pl.key=c.plan_key
  ) s;
  return res;
end $function$;

-- sa_tickets : exclut les tickets des clubs de démonstration.
create or replace function yps.sa_tickets()
 returns jsonb language plpgsql security definer set search_path to 'yps','public' as $function$
declare res jsonb;
begin
  perform yps.sa_guard();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'club', c.name, 'subject', t.subject, 'priority', t.priority,
    'status', t.status, 'body', t.body, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
  into res from yps.support_tickets t left join yps.clubs c on c.id = t.club_id
  where coalesce(c.is_demo, false) = false;
  return res;
end $function$;

-- Tableau de bord « ville » : uniquement des chiffres agrégés, aucune donnée nominative.
create table if not exists yps.city_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  include_demo boolean not null default false  -- true : ne voit QUE les clubs de démo
);
alter table yps.city_viewers enable row level security;  -- aucune policy : lecture/écriture via SQL uniquement

create or replace function yps.city_overview()
 returns jsonb language plpgsql stable security definer set search_path to 'yps','public' as $function$
declare v yps.city_viewers;
begin
  select * into v from yps.city_viewers where user_id = auth.uid();
  if not found then raise exception 'not_city_viewer'; end if;
  return jsonb_build_object(
    'clubs',    (select count(*) from yps.clubs c where c.is_demo = v.include_demo),
    'licensees',(select count(*) from yps.players p join yps.clubs c on c.id=p.club_id where c.is_demo = v.include_demo),
    'events',   (select count(*) from yps.events e join yps.teams t on t.id=e.team_id join yps.clubs c on c.id=t.club_id where c.is_demo = v.include_demo),
    'sessions', (select count(*) from yps.sessions s join yps.teams t on t.id=s.team_id join yps.clubs c on c.id=t.club_id where c.is_demo = v.include_demo and s.published_at is not null)
  );
end $function$;
revoke all on function yps.city_overview() from public, anon;
grant execute on function yps.city_overview() to authenticated;
