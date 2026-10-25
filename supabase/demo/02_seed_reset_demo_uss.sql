-- 02 — Seed + reset du club DEMO-USS « Union Sportive de Savanville ».
-- demo_uss_reset() supprime UNIQUEMENT les lignes rattachées au club dont join_code = 'DEMO-USS', puis recrée tout.
-- Prérequis : 01_schema_demo.sql appliqué ET les 4 comptes créés via l'inscription normale
-- (mots de passe forts, jamais écrits ici) : balipi777+demo-admin / -coach / -parent / -ville @gmail.com.
-- Aucun e-mail n'est envoyé : seuls les alias de Pierre sont utilisés.

create or replace function yps.demo_uss_reset() returns text
 language plpgsql security definer set search_path to 'yps','public' as $fn$
declare
  v_club uuid; v_admin uuid; v_coach uuid; v_parent uuid; v_ville uuid;
  v_sport record; v_team uuid; v_player uuid; v_sess uuid; v_event uuid;
  v_teams uuid[] := '{}'; v_t_u11 uuid; v_t_u13 uuid;
  v_names text[] := array['Aliou','Maëlys','Noé','Inaya','Soren','Lïa','Tiago','Zélie','Odran','Mélia','Kassim','Yaëlle','Elio','Névé','Ruben','Sacha','Thaïs','Oscar','Lorys','Anaë','Malo','Elyne','Ismaël','Cléo','Nolan','Ysée','Gaspard','Maïwenn','Rayan','Océane','Evan','Jade','Basile','Kenza','Loïc','Mathis','Naëlle','Timéo','Albane','Solal'];
  v_cat text[] := array['U11','U13','U13','8-12 ans'];
  v_tn  text[] := array['U11 Football','U13 Football','U13 Basket','Judo enfants (8-12 ans)'];
  v_sp  text[] := array['football','football','basket','judo'];
  i int; j int; k int; n int := 0;
  v_themes text[] := array['Passes et contrôles','Jeu sans ballon','Défense en bloc','Esquives et déplacements','Tirs et finitions','Chutes et équilibre'];
begin
  select id into v_admin  from yps.app_users where email = 'balipi777+demo-admin@gmail.com';
  select id into v_coach  from yps.app_users where email = 'balipi777+demo-coach@gmail.com';
  select id into v_parent from yps.app_users where email = 'balipi777+demo-parent@gmail.com';
  select id into v_ville  from yps.app_users where email = 'balipi777+demo-ville@gmail.com';

  -- ===== RESET (strictement limité au club DEMO-USS) =====
  select id into v_club from yps.clubs where join_code = 'DEMO-USS';
  if v_club is not null then
    delete from yps.event_convocations where event_id in (select e.id from yps.events e join yps.teams t on t.id=e.team_id where t.club_id=v_club);
    delete from yps.events where team_id in (select id from yps.teams where club_id=v_club);
    delete from yps.messages where session_id in (select s.id from yps.sessions s join yps.teams t on t.id=s.team_id where t.club_id=v_club)
                                or team_id in (select id from yps.teams where club_id=v_club);
    delete from yps.session_axes where session_id in (select s.id from yps.sessions s join yps.teams t on t.id=s.team_id where t.club_id=v_club);
    delete from yps.session_challenge where session_id in (select s.id from yps.sessions s join yps.teams t on t.id=s.team_id where t.club_id=v_club);
    delete from yps.attendance where session_id in (select s.id from yps.sessions s join yps.teams t on t.id=s.team_id where t.club_id=v_club);
    delete from yps.sessions where team_id in (select id from yps.teams where club_id=v_club);
    delete from yps.player_parents where player_id in (select id from yps.players where club_id=v_club);
    delete from yps.coach_teams where team_id in (select id from yps.teams where club_id=v_club);
    delete from yps.players where club_id=v_club;
    delete from yps.teams where club_id=v_club;
    delete from yps.memberships where club_id=v_club;
    delete from yps.support_tickets where club_id=v_club;
    delete from yps.subscriptions where club_id=v_club;
    delete from yps.clubs where id=v_club;
  end if;

  -- ===== SEED =====
  insert into yps.clubs (name, slug, join_code, status, plan_key, is_demo)
  values ('Union Sportive de Savanville','demo-uss','DEMO-USS','trial', (select key from yps.plans order by price limit 1), true)
  returning id into v_club;

  if v_admin  is not null then insert into yps.memberships(user_id,club_id,role) values (v_admin,v_club,'admin'); end if;
  if v_coach  is not null then insert into yps.memberships(user_id,club_id,role) values (v_coach,v_club,'coach'); end if;
  if v_parent is not null then insert into yps.memberships(user_id,club_id,role) values (v_parent,v_club,'parent'); end if;
  if v_ville  is not null then
    insert into yps.city_viewers(user_id,label,include_demo) values (v_ville,'Mairie de Savanville (démo)',true)
    on conflict (user_id) do update set include_demo = true;
  end if;

  for i in 1..4 loop
    insert into yps.teams(club_id, sport_id, name, category, is_demo)
    values (v_club, (select id from yps.sports where key = v_sp[i]), v_tn[i], v_cat[i], true)
    returning id into v_team;
    v_teams := v_teams || v_team;
    if i = 1 then v_t_u11 := v_team; end if;
    if i = 2 then v_t_u13 := v_team; end if;
    if v_coach is not null and i <= 2 then insert into yps.coach_teams(coach_user_id, team_id) values (v_coach, v_team); end if;

    -- 10 joueurs fictifs par équipe (prénoms inventés, pas de nom de famille)
    for j in 1..10 loop
      n := n + 1;
      insert into yps.players(club_id, team_id, first_name, birthdate, is_demo)
      values (v_club, v_team, v_names[n], (date '2026-01-01' - ((9 + (i % 3)) * 365 + j * 20)), true)
      returning id into v_player;
      if n in (1, 11) and v_parent is not null then   -- 2 enfants rattachés au parent de démo
        insert into yps.player_parents(player_id, parent_user_id, consent_rgpd, consent_at, status, validated_at)
        values (v_player, v_parent, true, now(), 'active', now());
      end if;
    end loop;
  end loop;

  -- 6 entraînements passés (équipes 1 et 2 en alternance) avec présences
  for k in 1..6 loop
    v_team := case when k % 2 = 1 then v_t_u11 else v_t_u13 end;
    insert into yps.sessions(team_id, date, start_time, end_time, theme, coach_user_id, published_at, is_demo)
    values (v_team, current_date - (k * 7), '18:00', '19:30', v_themes[k], v_coach, now() - (k * interval '7 days'), true)
    returning id into v_sess;
    insert into yps.attendance(session_id, player_id, status)
    select v_sess, p.id, (case when random() < 0.75 then 'present' when random() < 0.5 then 'late' else 'absent' end)::yps.attendance_status
    from yps.players p where p.team_id = v_team;
    insert into yps.session_axes(session_id, axis, comment) values (v_sess, 'technique', 'Bon travail du groupe.');
    if k = 1 then
      insert into yps.messages(session_id, team_id, type, body, author_user_id)
      values (v_sess, v_team, 'mot_coach', 'Bravo à tous pour votre énergie cette semaine ! On continue sur cette lancée.', v_coach);
      insert into yps.messages(session_id, team_id, type, body, author_user_id)
      values (v_sess, v_team, 'objectif', 'Objectif de la semaine : mieux se placer sans le ballon.', v_coach);
    end if;
  end loop;

  -- 1 match à venir
  insert into yps.events(team_id, type, opponent, place, datetime, rsvp_deadline)
  values (v_t_u13, 'match', 'FC Rivebelle', 'Stade municipal de Savanville', now() + interval '9 days', now() + interval '6 days');

  -- 1 tournoi avec convocations
  insert into yps.events(team_id, type, opponent, place, datetime, rsvp_deadline)
  values (v_t_u11, 'tournoi', 'Tournoi des Pins', 'Gymnase des Pins', now() + interval '21 days', now() + interval '14 days')
  returning id into v_event;
  insert into yps.event_convocations(event_id, player_id)
  select v_event, id from yps.players where team_id = v_t_u11;
  update yps.event_convocations set response = 'present', responded_at = now()
  where event_id = v_event and player_id in (select id from yps.players where team_id = v_t_u11 order by first_name limit 7);

  return format('DEMO-USS recréé : club %s, %s joueurs, comptes liés admin=%s coach=%s parent=%s ville=%s',
    v_club, n, v_admin is not null, v_coach is not null, v_parent is not null, v_ville is not null);
end $fn$;

revoke all on function yps.demo_uss_reset() from public, anon, authenticated;
-- Exécution (éditeur SQL, rôle postgres uniquement) :  select yps.demo_uss_reset();
