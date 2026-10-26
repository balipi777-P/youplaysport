-- Coachs ayant rejoint le club avec le code (memberships.role = 'coach') mais rattaches
-- a aucune equipe du club (coach_teams). Reserve aux dirigeants du club (ou superadmin) :
-- app_users n'est pas lisible par le dirigeant, d'ou cette fonction SECURITY DEFINER.
-- Le rattachement se fait ensuite avec admin_link_coach_by_email(p_team, email).
create or replace function yps.pending_coaches_for_admin(p_club uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'yps', 'public'
as $function$
begin
  if not (yps.is_platform_admin() or yps.is_club_admin(p_club)) then
    raise exception 'non autorisé';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', m.user_id, 'email', u.email, 'full_name', u.full_name, 'joined_at', m.created_at)
           order by m.created_at)
    from yps.memberships m
    join yps.app_users u on u.id = m.user_id
    where m.club_id = p_club and m.role = 'coach'
      and not exists (
        select 1 from yps.coach_teams ct join yps.teams t on t.id = ct.team_id
        where ct.coach_user_id = m.user_id and t.club_id = p_club)
  ), '[]'::jsonb);
end $function$;

revoke all on function yps.pending_coaches_for_admin(uuid) from public, anon;
grant execute on function yps.pending_coaches_for_admin(uuid) to authenticated;
