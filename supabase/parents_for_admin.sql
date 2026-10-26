-- Comptes parents rattaches aux joueurs d'un club (player_parents, tous statuts :
-- active / pending / rejected) avec leur nom (app_users.full_name). Si le nom est
-- vide, l'email est renvoye deja masque (ba***@gmail.com) : l'email complet ne
-- sort jamais de la base. Reserve aux dirigeants du club (ou superadmin) ;
-- app_users reste illisible pour le dirigeant, d'ou cette fonction SECURITY DEFINER
-- filtree sur players.club_id = p_club.
create or replace function yps.parents_for_admin(p_club uuid)
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
             'player_id', pp.player_id,
             'parent_user_id', pp.parent_user_id,
             'status', coalesce(pp.status, 'active'),
             'full_name', nullif(btrim(coalesce(u.full_name, '')), ''),
             'email_masked', case
               when u.email is null or position('@' in u.email) < 2 then null
               else left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2)
             end)
           order by pp.created_at)
    from yps.player_parents pp
    join yps.players p on p.id = pp.player_id
    left join yps.app_users u on u.id = pp.parent_user_id
    where p.club_id = p_club
  ), '[]'::jsonb);
end $function$;

revoke all on function yps.parents_for_admin(uuid) from public, anon;
grant execute on function yps.parents_for_admin(uuid) to authenticated;
