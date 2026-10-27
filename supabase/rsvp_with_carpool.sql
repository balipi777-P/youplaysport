-- Reponse a une convocation + covoiturage en un seul appel.
-- A RELIRE puis appliquer soi-meme : ce fichier n'a PAS ete execute. Suppose carpool.sql deja applique
-- (events.carpool, event_carpool) et ne modifie ni yps.rsvp ni set_carpool_choice, qui restent en place.
--
-- rsvp_with_carpool(p_event, p_player, p_response, p_choice, p_seats)
--   * Meme controle que yps.rsvp : appelant authentifie, can_read_player(p_player), enfant convoque (sinon not_convoked).
--   * Tout se fait dans une seule transaction : si le covoiturage est refuse, la reponse n'est pas enregistree.
--   * p_choice vide ou null est equivalent. Valeurs : drive (p_seats 1..8), need, unavailable, self (ancien choix).
--   * Present + covoiturage active : p_choice est obligatoire (invalid_choice sinon), valide comme set_carpool_choice
--     (invalid_seats, event_past). Il est enregistre pour le PARENT appelant (une ligne par parent et par evenement,
--     partagee entre ses enfants).
--   * Absent : p_choice est ignore. Si le parent n'a plus aucun enfant convoque non « absent » sur cet evenement,
--     son choix de covoiturage est supprime (il sort des totaux, comme le prevoit carpool_summary).
--   * Option desactivee, ou appelant qui n'est pas parent actif de l'enfant (athlete autonome) : p_choice ignore,
--     seule la reponse est enregistree.
--   * Journal d'audit : action et cible seulement, jamais le choix ni les noms.
-- Erreurs : not_authenticated, not_authorized, not_convoked, invalid_choice, invalid_seats, event_past.

create or replace function yps.rsvp_with_carpool(
  p_event uuid, p_player uuid, p_response yps.rsvp_response,
  p_choice text default null, p_seats integer default null)
returns void
language plpgsql
security definer
set search_path to 'yps', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_choice text := nullif(btrim(p_choice), '');
  v_on boolean; v_dt timestamptz; v_seats smallint;
  v_parent boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not yps.can_read_player(p_player) then raise exception 'not_authorized'; end if;
  if not exists (select 1 from yps.event_convocations ec where ec.event_id = p_event and ec.player_id = p_player) then
    raise exception 'not_convoked';
  end if;

  update yps.event_convocations
     set response = p_response, responded_at = now()
   where event_id = p_event and player_id = p_player;

  select e.carpool, e.datetime into v_on, v_dt from yps.events e where e.id = p_event;
  v_parent := exists (select 1 from yps.player_parents pp
                      where pp.player_id = p_player and pp.parent_user_id = v_uid and pp.status = 'active');

  if v_on and v_parent then
    if p_response = 'absent' then
      -- Plus aucun enfant de ce parent present ou sans reponse sur l'evenement : le choix n'a plus lieu d'etre.
      if not exists (
        select 1 from yps.event_convocations ec
        join yps.player_parents pp on pp.player_id = ec.player_id
        where ec.event_id = p_event and pp.parent_user_id = v_uid and pp.status = 'active'
          and ec.response is distinct from 'absent'
      ) then
        delete from yps.event_carpool where event_id = p_event and parent_user_id = v_uid;
      end if;
    else
      if v_choice is null or v_choice not in ('drive','need','self','unavailable') then
        raise exception 'invalid_choice';
      end if;
      if v_dt is not null and v_dt < now() then raise exception 'event_past'; end if;
      if v_choice = 'drive' then
        if p_seats is null or p_seats < 1 or p_seats > 8 then raise exception 'invalid_seats'; end if;
        v_seats := p_seats;
      else
        v_seats := null;
      end if;
      insert into yps.event_carpool (event_id, parent_user_id, choice, seats, updated_at)
      values (p_event, v_uid, v_choice, v_seats, now())
      on conflict (event_id, parent_user_id)
      do update set choice = excluded.choice, seats = excluded.seats, updated_at = now();
    end if;
  end if;

  insert into yps.audit_log (actor_user_id, action, target, meta)
  values (v_uid, 'rsvp_with_carpool', 'event:' || p_event::text, '{}'::jsonb);
end $function$;

revoke all on function yps.rsvp_with_carpool(uuid, uuid, yps.rsvp_response, text, integer) from public, anon;
grant execute on function yps.rsvp_with_carpool(uuid, uuid, yps.rsvp_response, text, integer) to authenticated;
