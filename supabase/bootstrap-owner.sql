-- Run once, after 001_timetracker.sql, in the Supabase SQL Editor.
-- Replace the email below with the verified email of the owner.
-- No passwords are created or stored here. The owner creates their own account
-- using the returned invitation link after the frontend is deployed.
do $$
declare owner_email text := 'REEMPLAZAR-CORREO-DEL-PROPIETARIO'; w uuid;
begin
  if owner_email not like '%@%' then raise exception 'Configura el correo real del propietario'; end if;
  if exists(select 1 from public.workspaces) then raise exception 'Ya existe un equipo: no repetir inicialización'; end if;
  insert into public.workspaces(name,currency,timezone)
    values('Star5Tracker','USD','America/Panama') returning id into w;
  insert into public.rates(workspace_id,amount) values(w,0);
  insert into public.invitations(workspace_id,email,role)
    values(w,lower(owner_email),'admin');
end $$;
-- Append this token to the deployed frontend URL: /invite?token=TOKEN.
-- The token expires in 7 days and requires a session with the matching verified email.
select email,token,expires_at from public.invitations where role='admin' and not accepted;
