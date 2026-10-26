-- Exports de donnees : (1) fiche d'un enfant pour son parent, (2) CSV club pour l'admin du club.
-- A RELIRE puis appliquer soi-meme. Aucun acces direct aux tables depuis l'app :
-- les deux fonctions sont SECURITY DEFINER, filtrees par role et par club, et journalisent
-- chaque appel dans yps.audit_log (qui = actor_user_id, quand = created_at, quoi = action/target/meta).
-- audit_log n'a qu'une policy SELECT (admin plateforme) : l'ecriture ne passe que par ces fonctions.
-- Le journal ne contient JAMAIS le contenu exporte, seulement le type, la cible et le nombre de lignes.

-- ---------------------------------------------------------------------------
-- 1. export_child_data(p_player) : parent lie (rattachement actif) uniquement
-- ---------------------------------------------------------------------------
create or replace function yps.export_child_data(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Le parent doit etre rattache a CET enfant (statut actif). Sinon : meme erreur
  -- que l'enfant n'existe pas, pour ne rien reveler.
  if not exists (
    select 1 from yps.player_parents pp
    where pp.player_id = p_player
      and pp.parent_user_id = v_uid
      and coalesce(pp.status, 'active') = 'active'
  ) then
    raise exception 'not_authorized';
  end if;

  select jsonb_build_object(
    'exporte_le', now(),
    'fiche', (select jsonb_build_object(
                'prenom', p.first_name, 'nom', p.last_name, 'naissance', p.birthdate,
                'club', c.name, 'inscrit_le', p.created_at)
              from yps.players p join yps.clubs c on c.id = p.club_id
              where p.id = p_player),
    'equipe', (select jsonb_build_object('nom', t.name, 'categorie', t.category)
               from yps.players p join yps.teams t on t.id = p.team_id
               where p.id = p_player),
    'presences', coalesce((
      select jsonb_agg(jsonb_build_object('date', se.date, 'theme', coalesce(se.theme_custom, se.theme),
                                          'statut', a.status) order by se.date)
      from yps.attendance a join yps.sessions se on se.id = a.session_id
      where a.player_id = p_player), '[]'::jsonb),
    'competences_validees', coalesce((
      select jsonb_agg(jsonb_build_object('competence', s.label, 'axe', s.axis,
                                          'statut', s.status, 'valide_le', s.validated_at)
                       order by s.validated_at)
      from yps.skills s
      where s.player_id = p_player and s.validated_at is not null), '[]'::jsonb),
    'convocations', coalesce((
      select jsonb_agg(jsonb_build_object('evenement', e.type, 'adversaire', e.opponent, 'lieu', e.place,
                                          'date', e.datetime, 'reponse', ec.response,
                                          'repondu_le', ec.responded_at)
                       order by e.datetime)
      from yps.event_convocations ec join yps.events e on e.id = ec.event_id
      where ec.player_id = p_player), '[]'::jsonb)
  ) into res;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'export_child_data', 'player:' || p_player::text,
          jsonb_build_object('presences', jsonb_array_length(res->'presences'),
                             'competences', jsonb_array_length(res->'competences_validees'),
                             'convocations', jsonb_array_length(res->'convocations')));
  return res;
end $$;

revoke all on function yps.export_child_data(uuid) from public, anon;
grant execute on function yps.export_child_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. club_export(p_club, p_kind) : admin du club uniquement, limite a p_club
--    p_kind : 'licencies' | 'equipes' | 'presences'
--    Renvoie un tableau JSON de lignes ; le CSV est assemble cote navigateur.
--    Pas d'e-mail ni de donnees de compte des parents dans ces exports.
-- ---------------------------------------------------------------------------
create or replace function yps.club_export(p_club uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path to 'yps', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not yps.is_club_admin(p_club) then raise exception 'not_authorized'; end if;
  if p_kind not in ('licencies', 'equipes', 'presences') then raise exception 'bad_kind'; end if;

  if p_kind = 'licencies' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'prenom', p.first_name, 'nom', p.last_name, 'naissance', p.birthdate,
             'equipe', t.name, 'categorie', t.category,
             'parents_lies', (select count(*) from yps.player_parents pp
                              where pp.player_id = p.id and coalesce(pp.status, 'active') = 'active'),
             'inscrit_le', p.created_at)
           order by t.name, p.last_name, p.first_name), '[]'::jsonb)
    into res
    from yps.players p left join yps.teams t on t.id = p.team_id
    where p.club_id = p_club;

  elsif p_kind = 'equipes' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'equipe', t.name, 'categorie', t.category,
             'joueurs', (select count(*) from yps.players p where p.team_id = t.id),
             'coachs', (select count(*) from yps.coach_teams ct where ct.team_id = t.id),
             'creee_le', t.created_at)
           order by t.name), '[]'::jsonb)
    into res
    from yps.teams t
    where t.club_id = p_club;

  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', se.date, 'equipe', t.name,
             'prenom', p.first_name, 'nom', p.last_name, 'statut', a.status)
           order by se.date, t.name, p.last_name), '[]'::jsonb)
    into res
    from yps.attendance a
    join yps.players p on p.id = a.player_id
    join yps.sessions se on se.id = a.session_id
    join yps.teams t on t.id = se.team_id
    where p.club_id = p_club and t.club_id = p_club;
  end if;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'export_club_' || p_kind, 'club:' || p_club::text,
          jsonb_build_object('rows', jsonb_array_length(res)));
  return res;
end $$;

revoke all on function yps.club_export(uuid, text) from public, anon;
grant execute on function yps.club_export(uuid, text) to authenticated;
