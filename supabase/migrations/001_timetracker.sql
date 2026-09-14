-- Star5Tracker. All mutations are transactional RPCs; financial values live separately.
create extension if not exists pgcrypto;
create table public.workspaces(id uuid primary key default gen_random_uuid(), name text not null default 'Star5Tracker', currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'), timezone text not null default 'America/Panama', project_status_policy text not null default 'all' check(project_status_policy in ('all','admins')));
create table public.members(id uuid primary key references auth.users(id), workspace_id uuid not null references public.workspaces, name text not null, email text not null, role text not null check(role in ('admin','member')), active boolean not null default true);
create table public.clients(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, name text not null check(length(trim(name))>0), email text not null default '', archived boolean not null default false, logo_url text);
create table public.projects(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, client_id uuid references public.clients, name text not null check(length(trim(name))>0), color text not null default '#8b5cf6' check(color ~ '^#[a-fA-F0-9]{6}$'), estimate numeric not null default 0 check(estimate>=0), archived boolean not null default false, member_ids uuid[] not null default '{}', status text not null default 'pending' check(status in ('pending','in_progress','completed')), completed_at timestamptz);
create table public.tasks(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, project_id uuid not null references public.projects, name text not null check(length(trim(name))>0), estimate numeric not null default 0 check(estimate>=0), archived boolean not null default false, assignee_ids uuid[] not null default '{}', status text not null default 'pending' check(status in ('pending','in_progress','completed')), completed_at timestamptz);
create table public.tags(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, name text not null check(length(trim(name))>0), unique(workspace_id,name));
create table public.entries(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, user_id uuid not null references public.members, description text not null default '', project_id uuid references public.projects, task_id uuid references public.tasks, tag_ids uuid[] not null default '{}', billable boolean not null default false, start_at timestamptz not null, end_at timestamptz, check(end_at is null or end_at>start_at));
create unique index one_running_timer on public.entries(user_id) where end_at is null;
create index entries_period on public.entries(workspace_id,user_id,start_at);
create table public.entry_finance(entry_id uuid primary key references public.entries on delete cascade, workspace_id uuid not null references public.workspaces, rate numeric not null check(rate>=0), currency text not null);
create table public.rates(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, user_id uuid references public.members, project_id uuid references public.projects, amount numeric not null check(amount>=0), unique nulls not distinct(workspace_id,user_id,project_id));
create table public.approvals(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, user_id uuid not null references public.members, week date not null check(extract(isodow from week)=1), status text not null check(status in ('submitted','approved','returned')), comment text not null default '', updated_at timestamptz not null default now(), unique(user_id,week));
create table public.audit(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, actor_id uuid not null, action text not null, detail text not null, created_at timestamptz not null default now());
create table public.invitations(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, email text not null, role text not null check(role in ('admin','member')), token uuid not null default gen_random_uuid(), expires_at timestamptz not null default now()+interval '7 days', accepted boolean not null default false);
create table public.notifications(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, user_id uuid not null references public.members, title text not null, message text not null, project_id uuid references public.projects, task_id uuid references public.tasks, read_at timestamptz, created_at timestamptz not null default now());
create table public.requests(id uuid not null, user_id uuid not null, result jsonb not null, primary key(id,user_id));

create function public.my_workspace() returns uuid language sql stable security definer set search_path=public as $$ select workspace_id from members where id=auth.uid() and active $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select role='admin' from members where id=auth.uid() and active),false) $$;
create function public.can_project(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from projects where id=p_id and workspace_id=my_workspace() and (is_admin() or auth.uid()=any(member_ids))) $$;

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.tags enable row level security;
alter table public.entries enable row level security;
alter table public.entry_finance enable row level security;
alter table public.rates enable row level security;
alter table public.approvals enable row level security;
alter table public.audit enable row level security;
alter table public.invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.requests enable row level security;
create policy own_workspace on workspaces for select to authenticated using(id=my_workspace());
create policy own_members on members for select to authenticated using(workspace_id=my_workspace());
create policy own_clients on clients for select to authenticated using(workspace_id=my_workspace() and (is_admin() or exists(select 1 from projects p where p.client_id=clients.id and can_project(p.id))));
create policy own_projects on projects for select to authenticated using(can_project(id));
create policy own_tasks on tasks for select to authenticated using(workspace_id=my_workspace() and can_project(project_id));
create policy own_tags on tags for select to authenticated using(workspace_id=my_workspace());
create policy own_entries on entries for select to authenticated using(workspace_id=my_workspace() and (is_admin() or user_id=auth.uid() or (project_id is not null and can_project(project_id))));
create policy admin_finance on entry_finance for select to authenticated using(workspace_id=my_workspace() and is_admin());
create policy admin_rates on rates for select to authenticated using(workspace_id=my_workspace() and is_admin());
create policy own_approvals on approvals for select to authenticated using(workspace_id=my_workspace() and (is_admin() or user_id=auth.uid()));
create policy admin_audit on audit for select to authenticated using(workspace_id=my_workspace() and is_admin());
create policy own_notifications on notifications for select to authenticated using(workspace_id=my_workspace() and user_id=auth.uid());
-- Invitations and idempotency records are never directly readable.
revoke all on all tables in schema public from anon, authenticated;
grant select on workspaces,members,clients,projects,tasks,tags,entries,entry_finance,rates,approvals,audit,notifications to authenticated;

create function public.assert_unlocked(p_user uuid,p_start timestamptz,p_end timestamptz,p_zone text) returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from approvals where user_id=p_user and status in ('submitted','approved') and p_start < ((week+7)::timestamp at time zone p_zone) and coalesce(p_end,now()) > (week::timestamp at time zone p_zone)) then raise exception 'La semana está enviada o aprobada. Solicita su reapertura.'; end if;
end $$;

create function public.app_snapshot() returns jsonb language plpgsql security invoker set search_path=public as $$
declare w uuid:=my_workspace(); result jsonb;
begin
 if w is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
 select jsonb_build_object(
 'workspace',(select to_jsonb(x) from workspaces x where id=w),
 'me',(select to_jsonb(x) from members x where id=auth.uid()),
 'members',coalesce((select jsonb_agg(x) from members x),'[]'::jsonb),
 'clients',coalesce((select jsonb_agg(x order by name) from clients x),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(x order by name) from projects x),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(x order by name) from tasks x),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg(x order by name) from tags x),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)||case when is_admin() then jsonb_build_object('rate',f.rate,'currency',f.currency) else '{}'::jsonb end order by e.start_at desc) from entries e left join entry_finance f on f.entry_id=e.id),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(x order by week desc) from approvals x),'[]'::jsonb),
 'rates',coalesce((select jsonb_agg(x) from rates x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(x) from (select * from audit order by created_at desc limit 100) x),'[]'::jsonb),
 'invitations','[]'::jsonb,
 'notifications',coalesce((select jsonb_agg(x order by created_at desc) from (select * from notifications order by created_at desc limit 50) x),'[]'::jsonb),
 'server_now',clock_timestamp()) into result;
 return result;
end $$;

create function public.app_command(p_action text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); w uuid; me members; settings workspaces; old_entry entries; e entries; pid uuid; tid uuid; target uuid; eid uuid; st timestamptz; en timestamptz; wk date; a approvals; r jsonb; amount numeric; invite invitations; ids uuid[]; old_ids uuid[]; previous_rate numeric;
begin
 if u is null then raise exception 'Debes iniciar sesión.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select result into r from requests where id=p_request and user_id=u;
 if found then return r; end if;
 select * into me from members where id=u and active;
 if p_action='accept_invitation' then
   select * into invite from invitations where token=(p_data->>'token')::uuid and not accepted and expires_at>now() for update;
   if not found or lower(invite.email)<>lower(coalesce(auth.jwt()->>'email','')) then raise exception 'La invitación no es válida para esta cuenta o ha caducado.'; end if;
   if exists(select 1 from members where id=u) then raise exception 'La cuenta ya pertenece a un equipo. Contacta al administrador.'; end if;
   insert into members(id,workspace_id,name,email,role) values(u,invite.workspace_id,coalesce(nullif(trim(p_data->>'name'),''),split_part(invite.email,'@',1)),invite.email,invite.role);
   update invitations set accepted=true where id=invite.id;
   r=jsonb_build_object('ok',true); insert into requests values(p_request,u,r); return r;
 end if;
 if me.id is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
 w:=me.workspace_id;
 -- Serialize team writes so approvals cannot race time mutations or rate changes.
 perform pg_advisory_xact_lock(hashtextextended(w::text,1));
 -- Recheck after obtaining the team lock: access may have been revoked while waiting.
 select * into me from members where id=u and active and workspace_id=w;
 if me.id is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
 select * into settings from workspaces where id=w;
 eid:=nullif(p_data->>'id','')::uuid; pid:=nullif(p_data->>'project_id','')::uuid; tid:=nullif(p_data->>'task_id','')::uuid;
 if p_action in ('start','save_entry','stop','delete_entry') then
   if eid is not null then
     select * into old_entry from entries where id=eid and workspace_id=w;
     if not found or (old_entry.user_id<>u and me.role<>'admin') then raise exception 'No tienes permiso para modificar este registro.'; end if;
     perform assert_unlocked(old_entry.user_id,old_entry.start_at,old_entry.end_at,settings.timezone);
   end if;
   if p_action='delete_entry' then
     if old_entry.id is null then raise exception 'Registro no encontrado.'; end if;
     delete from entries where id=eid;
   elsif p_action='stop' then
     if old_entry.id is null then raise exception 'Registro no encontrado.'; end if;
     if old_entry.end_at is null then update entries set end_at=greatest(clock_timestamp(),start_at+interval '1 millisecond') where id=eid; end if;
   else
     target:=coalesce(old_entry.user_id,u);
     if p_action='start' then
       if exists(select 1 from entries where user_id=u and end_at is null) then raise exception 'Ya tienes un cronómetro en marcha.'; end if;
       st:=clock_timestamp(); en:=null; eid:=null;
     else
       st:=(p_data->>'start_at')::timestamptz; en:=(p_data->>'end_at')::timestamptz;
       if st is null or en is null or en<=st then raise exception 'La hora de fin debe ser posterior al inicio.'; end if;
       if en>clock_timestamp()+interval '1 minute' then raise exception 'No puedes registrar tiempo futuro.'; end if;
       if en is not null and exists(select 1 from entries x where x.user_id=target and x.id is distinct from eid and st < coalesce(x.end_at,'infinity'::timestamptz) and en > x.start_at) then raise exception 'Ya tienes tiempo registrado en parte de ese día.'; end if;
     end if;
     perform assert_unlocked(target,st,coalesce(en,st+interval '1 second'),settings.timezone);
     if pid is not null and not exists(select 1 from projects where id=pid and workspace_id=w and (not archived or pid=old_entry.project_id) and (me.role='admin' or target=any(member_ids))) then raise exception 'Proyecto no disponible.'; end if;
     if tid is not null and not exists(select 1 from tasks where id=tid and workspace_id=w and project_id=pid and (not archived or tid=old_entry.task_id) and (me.role='admin' or target=any(assignee_ids))) then raise exception 'Tarea no disponible o no asignada.'; end if;
     ids:=array(select jsonb_array_elements_text(coalesce(p_data->'tag_ids','[]'))::uuid);
     if exists(select 1 from unnest(ids) t where not exists(select 1 from tags where id=t and workspace_id=w)) then raise exception 'Etiqueta no válida.'; end if;
     if eid is null then
       insert into entries(workspace_id,user_id,description,project_id,task_id,tag_ids,billable,start_at,end_at) values(w,target,coalesce(p_data->>'description',''),pid,tid,ids,coalesce((p_data->>'billable')::boolean,false),st,en) returning * into e;
       select rr.amount into amount from rates rr where workspace_id=w and (rr.user_id is null or rr.user_id=target) and (rr.project_id is null or rr.project_id=pid) order by (case when rr.project_id is not null then 2 else 0 end+case when rr.user_id is not null then 1 else 0 end) desc limit 1;
       insert into entry_finance values(e.id,w,coalesce(amount,0),settings.currency);
     else
       update entries set description=coalesce(p_data->>'description',''),project_id=pid,task_id=tid,tag_ids=ids,billable=coalesce((p_data->>'billable')::boolean,false),start_at=st,end_at=en where id=eid;
     end if;
   end if;
 elsif p_action='notification_read' then
   if coalesce((p_data->>'all')::boolean,false) then update notifications set read_at=coalesce(read_at,now()) where workspace_id=w and user_id=u;
   else update notifications set read_at=coalesce(read_at,now()) where id=eid and workspace_id=w and user_id=u; end if;
 elsif p_action='task_status' then
   if p_data->>'status' not in ('pending','in_progress','completed') then raise exception 'Estado no válido.'; end if;
   update tasks set status=p_data->>'status',completed_at=case when p_data->>'status'='completed' then now() else null end where id=eid and workspace_id=w and (me.role='admin' or u=any(assignee_ids));
   if not found then raise exception 'No tienes asignada esta tarea.'; end if;
 elsif p_action='approval' then
   target:=coalesce(nullif(p_data->>'user_id','')::uuid,u); wk:=(p_data->>'week')::date;
   if wk is null or extract(isodow from wk)<>1 or not exists(select 1 from members where id=target and workspace_id=w) then raise exception 'Semana o persona no válida.'; end if;
   select * into a from approvals where user_id=target and week=wk;
   if p_data->>'status'='submitted' then
     if target<>u then raise exception 'Solo puedes enviar tus propias horas.'; end if;
     if a.status in ('submitted','approved') then raise exception 'La semana ya está enviada o aprobada.'; end if;
     if exists(select 1 from entries where user_id=u and end_at is null and start_at<((wk+7)::timestamp at time zone settings.timezone)) then raise exception 'Detén el cronómetro antes de enviar la semana.'; end if;
     if not exists(select 1 from entries where user_id=u and start_at<((wk+7)::timestamp at time zone settings.timezone) and end_at>(wk::timestamp at time zone settings.timezone)) then raise exception 'La semana no tiene horas registradas.'; end if;
   else
     if me.role<>'admin' then raise exception 'Solo un administrador puede revisar horas.'; end if;
     if p_data->>'status'='approved' and a.status is distinct from 'submitted' then raise exception 'Primero hay que enviar la semana.'; end if;
     if p_data->>'status'='returned' and (a.id is null or length(trim(coalesce(p_data->>'comment','')))=0) then raise exception 'Indica un motivo para devolver o reabrir.'; end if;
   end if;
   insert into approvals(workspace_id,user_id,week,status,comment) values(w,target,wk,p_data->>'status',coalesce(p_data->>'comment','')) on conflict(user_id,week) do update set status=excluded.status,comment=excluded.comment,updated_at=now();
 else
   if me.role<>'admin' and not (p_action='project' and p_data?'status' and eid is not null and settings.project_status_policy='all' and exists(select 1 from projects where id=eid and u=any(member_ids))) then raise exception 'Esta acción requiere permisos de administrador.'; end if;
   if p_action='client' then
     if eid is null then insert into clients(workspace_id,name,email,logo_url) values(w,trim(p_data->>'name'),coalesce(p_data->>'email',''),nullif(p_data->>'logo_url','')) returning id into eid;
     else update clients set name=coalesce(p_data->>'name',name),email=coalesce(p_data->>'email',email),archived=coalesce((p_data->>'archived')::boolean,archived),logo_url=case when p_data?'logo_url' then nullif(p_data->>'logo_url','') else logo_url end where id=eid and workspace_id=w; end if;
   elsif p_action='project' then
     if nullif(p_data->>'client_id','') is not null and not exists(select 1 from clients where id=(p_data->>'client_id')::uuid and workspace_id=w) then raise exception 'Cliente no válido.'; end if;
     ids:=array(select jsonb_array_elements_text(coalesce(p_data->'member_ids','[]'))::uuid);
     if exists(select 1 from unnest(ids) t where not exists(select 1 from members where id=t and workspace_id=w)) then raise exception 'Miembro no válido.'; end if;
     select member_ids into old_ids from projects where id=eid and workspace_id=w;
     if eid is null then insert into projects(workspace_id,name,client_id,color,estimate,member_ids,status,completed_at) values(w,trim(p_data->>'name'),nullif(p_data->>'client_id','')::uuid,coalesce(p_data->>'color','#8b5cf6'),coalesce((p_data->>'estimate')::numeric,0),ids,coalesce(p_data->>'status','pending'),case when p_data->>'status'='completed' then now() end) returning id into eid;
     else update projects set name=coalesce(p_data->>'name',name),client_id=case when p_data?'client_id' then nullif(p_data->>'client_id','')::uuid else client_id end,color=coalesce(p_data->>'color',color),estimate=coalesce((p_data->>'estimate')::numeric,estimate),member_ids=case when p_data?'member_ids' then ids else member_ids end,status=coalesce(p_data->>'status',status),completed_at=case when p_data?'status' then case when p_data->>'status'='completed' then coalesce(completed_at,now()) else null end else completed_at end,archived=coalesce((p_data->>'archived')::boolean,archived) where id=eid and workspace_id=w; end if;
     insert into notifications(workspace_id,user_id,title,message,project_id) select w,x,'Nuevo proyecto asignado',coalesce(p_data->>'name',(select name from projects where id=eid)),eid from unnest(ids) x where x<>u and not (x=any(coalesce(old_ids,'{}')));
   elsif p_action='task' then
     if pid is not null and not exists(select 1 from projects where id=pid and workspace_id=w) then raise exception 'Proyecto no válido.'; end if;
     ids:=array(select jsonb_array_elements_text(coalesce(p_data->'assignee_ids','[]'))::uuid);
     if exists(select 1 from unnest(ids) x where not exists(select 1 from projects p where p.id=pid and x=any(p.member_ids))) then raise exception 'El responsable debe pertenecer al proyecto.'; end if;
     select assignee_ids into old_ids from tasks where id=eid and workspace_id=w;
     if eid is null then insert into tasks(workspace_id,project_id,name,estimate,assignee_ids,status,completed_at) values(w,pid,trim(p_data->>'name'),coalesce((p_data->>'estimate')::numeric,0),ids,coalesce(p_data->>'status','pending'),case when p_data->>'status'='completed' then now() end) returning id into eid;
     else update tasks set name=coalesce(p_data->>'name',name),estimate=coalesce((p_data->>'estimate')::numeric,estimate),assignee_ids=case when p_data?'assignee_ids' then ids else assignee_ids end,status=coalesce(p_data->>'status',status),completed_at=case when p_data?'status' then case when p_data->>'status'='completed' then coalesce(completed_at,now()) else null end else completed_at end,archived=coalesce((p_data->>'archived')::boolean,archived) where id=eid and workspace_id=w; end if;
     insert into notifications(workspace_id,user_id,title,message,project_id,task_id) select w,x,'Nueva tarea asignada',coalesce(p_data->>'name',(select name from tasks where id=eid)),coalesce(pid,(select project_id from tasks where id=eid)),eid from unnest(ids) x where x<>u and not (x=any(coalesce(old_ids,'{}')));
   elsif p_action='tag' then insert into tags(workspace_id,name) values(w,trim(p_data->>'name'));
   elsif p_action='member' then
     if eid=u and ((p_data->>'active')::boolean=false or p_data->>'role'='member') then raise exception 'No puedes revocar tus propios permisos.'; end if;
     if (p_data->>'active')::boolean=false and exists(select 1 from entries where user_id=eid and end_at is null) then raise exception 'Detén el cronómetro de esta persona antes de revocar su acceso.'; end if;
     update members set role=coalesce(p_data->>'role',role),active=coalesce((p_data->>'active')::boolean,active),name=coalesce(p_data->>'name',name) where id=eid and workspace_id=w;
   elsif p_action='settings' then
     if not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') then raise exception 'Zona horaria no válida.'; end if;
     if p_data->>'timezone'<>settings.timezone and exists(select 1 from entries where workspace_id=w) then raise exception 'La zona horaria solo puede cambiar antes del primer registro para conservar los períodos de aprobación.'; end if;
     if length(trim(p_data->>'name'))=0 then raise exception 'Escribe el nombre del equipo.'; end if;
     if coalesce(p_data->>'project_status_policy','all') not in ('all','admins') then raise exception 'Preferencia de permisos no válida.'; end if;
     update workspaces set name=trim(p_data->>'name'),currency=p_data->>'currency',timezone=p_data->>'timezone',project_status_policy=coalesce(p_data->>'project_status_policy',project_status_policy) where id=w;
   elsif p_action='rate' then
     target:=nullif(p_data->>'user_id','')::uuid;
     if target is not null and not exists(select 1 from members where id=target and workspace_id=w) then raise exception 'Miembro no válido.'; end if;
     if pid is not null and not exists(select 1 from projects where id=pid and workspace_id=w) then raise exception 'Proyecto no válido.'; end if;
     insert into rates(workspace_id,user_id,project_id,amount) values(w,target,pid,(p_data->>'amount')::numeric) on conflict(workspace_id,user_id,project_id) do update set amount=excluded.amount;
   elsif p_action='invite' then
     if coalesce(p_data->>'email','') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Correo no válido.'; end if;
     insert into invitations(workspace_id,email,role) values(w,lower(trim(p_data->>'email')),coalesce(p_data->>'role','member')) returning * into invite;
     r:=jsonb_build_object('token',invite.token);
   else raise exception 'Acción desconocida.';
   end if;
 end if;
 insert into audit(workspace_id,actor_id,action,detail) values(w,u,p_action,case when p_action='approval' then target::text||' · '||wk::text||' · '||(p_data->>'status')||' · '||coalesce(p_data->>'comment','') else coalesce(eid::text,p_data->>'name',p_data->>'description',p_data->>'email','Actualización') end);
 r:=coalesce(r,jsonb_build_object('ok',true,'id',eid));
 insert into requests values(p_request,u,r); return r;
end $$;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.my_workspace(),public.is_admin(),public.can_project(uuid),public.app_snapshot(),public.app_command(text,jsonb,uuid) to authenticated;
