-- Upgrade existing Star5Tracker workspaces with shared project/task progress.
alter table public.workspaces add column if not exists project_status_policy text not null default 'all' check(project_status_policy in ('all','admins'));
alter table public.projects add column if not exists status text not null default 'pending' check(status in ('pending','in_progress','completed'));
alter table public.projects add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists status text not null default 'pending' check(status in ('pending','in_progress','completed'));
alter table public.tasks add column if not exists completed_at timestamptz;
create table if not exists public.notifications(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, user_id uuid not null references public.members, title text not null, message text not null, project_id uuid references public.projects, task_id uuid references public.tasks, read_at timestamptz, created_at timestamptz not null default now());
alter table public.notifications enable row level security;
drop policy if exists own_members on public.members;
create policy own_members on public.members for select to authenticated using(workspace_id=my_workspace());
drop policy if exists own_entries on public.entries;
create policy own_entries on public.entries for select to authenticated using(workspace_id=my_workspace() and (is_admin() or user_id=auth.uid() or (project_id is not null and can_project(project_id))));
drop policy if exists own_notifications on public.notifications;
create policy own_notifications on public.notifications for select to authenticated using(workspace_id=my_workspace() and user_id=auth.uid());
revoke all on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;

create or replace function public.app_snapshot() returns jsonb language plpgsql security invoker set search_path=public as $$
declare w uuid:=my_workspace(); result jsonb;
begin
 if w is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
 select jsonb_build_object(
 'workspace',(select to_jsonb(x) from workspaces x where id=w),'me',(select to_jsonb(x) from members x where id=auth.uid()),
 'members',coalesce((select jsonb_agg(x) from members x),'[]'::jsonb),'clients',coalesce((select jsonb_agg(x order by name) from clients x),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(x order by name) from projects x),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(x order by name) from tasks x),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg(x order by name) from tags x),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)||case when is_admin() then jsonb_build_object('rate',f.rate,'currency',f.currency) else '{}'::jsonb end order by e.start_at desc) from entries e left join entry_finance f on f.entry_id=e.id),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(x order by week desc) from approvals x),'[]'::jsonb),'rates',coalesce((select jsonb_agg(x) from rates x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(x) from (select * from audit order by created_at desc limit 100) x),'[]'::jsonb),'invitations','[]'::jsonb,
 'notifications',coalesce((select jsonb_agg(x order by created_at desc) from (select * from notifications order by created_at desc limit 50) x),'[]'::jsonb),'server_now',clock_timestamp()) into result;
 return result;
end $$;

-- Preserve the original RPC for all established actions; intercept only the expanded project workflow.
alter function public.app_command(text,jsonb,uuid) rename to app_command_v1;
create function public.app_command(p_action text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); w uuid; me members; eid uuid:=nullif(p_data->>'id','')::uuid; pid uuid:=nullif(p_data->>'project_id','')::uuid; ids uuid[]; old_ids uuid[]; r jsonb;
begin
 if p_action in ('start','save_entry') and nullif(p_data->>'task_id','') is not null then
   select * into me from members where id=u and active;
   if me.id is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
   if me.role<>'admin' and not exists(select 1 from tasks where id=(p_data->>'task_id')::uuid and workspace_id=me.workspace_id and u=any(assignee_ids)) then raise exception 'Tarea no disponible o no asignada.'; end if;
   return app_command_v1(p_action,p_data,p_request);
 end if;
 if p_action not in ('project','task','task_status','notification_read') then return app_command_v1(p_action,p_data,p_request); end if;
 if u is null then raise exception 'Debes iniciar sesión.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select result into r from requests where id=p_request and user_id=u; if found then return r; end if;
 select * into me from members where id=u and active; if me.id is null then raise exception 'Tu cuenta no tiene acceso a este equipo.'; end if;
 w:=me.workspace_id; perform pg_advisory_xact_lock(hashtextextended(w::text,1));
 if p_action='notification_read' then
   if coalesce((p_data->>'all')::boolean,false) then update notifications set read_at=coalesce(read_at,now()) where workspace_id=w and user_id=u;
   else update notifications set read_at=coalesce(read_at,now()) where id=eid and workspace_id=w and user_id=u; end if;
 elsif p_action='task_status' then
   if p_data->>'status' not in ('pending','in_progress','completed') then raise exception 'Estado no válido.'; end if;
   update tasks set status=p_data->>'status',completed_at=case when p_data->>'status'='completed' then now() else null end where id=eid and workspace_id=w and (me.role='admin' or u=any(assignee_ids));
   if not found then raise exception 'No tienes asignada esta tarea.'; end if;
 else
   if me.role<>'admin' and p_action='project' and p_data?'status' and eid is not null and (select project_status_policy from workspaces where id=w)='all' and exists(select 1 from projects where id=eid and u=any(member_ids)) then
     if p_data->>'status' not in ('pending','in_progress','completed') then raise exception 'Estado no válido.'; end if;
     update projects set status=p_data->>'status',completed_at=case when p_data->>'status'='completed' then now() else null end where id=eid and workspace_id=w;
   elsif me.role<>'admin' then raise exception 'Esta acción requiere permisos de administrador.';
   elsif p_action='project' then
     if nullif(p_data->>'client_id','') is not null and not exists(select 1 from clients where id=(p_data->>'client_id')::uuid and workspace_id=w) then raise exception 'Cliente no válido.'; end if;
     ids:=array(select jsonb_array_elements_text(coalesce(p_data->'member_ids','[]'))::uuid);
     if exists(select 1 from unnest(ids) x where not exists(select 1 from members where id=x and workspace_id=w)) then raise exception 'Miembro no válido.'; end if;
     select member_ids into old_ids from projects where id=eid and workspace_id=w;
     if eid is null then insert into projects(workspace_id,name,client_id,color,estimate,member_ids,status,completed_at) values(w,trim(p_data->>'name'),nullif(p_data->>'client_id','')::uuid,coalesce(p_data->>'color','#8b5cf6'),coalesce((p_data->>'estimate')::numeric,0),ids,coalesce(p_data->>'status','pending'),case when p_data->>'status'='completed' then now() end) returning id into eid;
     else update projects set name=coalesce(p_data->>'name',name),client_id=case when p_data?'client_id' then nullif(p_data->>'client_id','')::uuid else client_id end,color=coalesce(p_data->>'color',color),estimate=coalesce((p_data->>'estimate')::numeric,estimate),member_ids=case when p_data?'member_ids' then ids else member_ids end,status=coalesce(p_data->>'status',status),completed_at=case when p_data?'status' then case when p_data->>'status'='completed' then coalesce(completed_at,now()) else null end else completed_at end,archived=coalesce((p_data->>'archived')::boolean,archived) where id=eid and workspace_id=w; end if;
     insert into notifications(workspace_id,user_id,title,message,project_id) select w,x,'Nuevo proyecto asignado',coalesce(p_data->>'name',(select name from projects where id=eid)),eid from unnest(ids) x where x<>u and not (x=any(coalesce(old_ids,'{}')));
   else
     if pid is not null and not exists(select 1 from projects where id=pid and workspace_id=w) then raise exception 'Proyecto no válido.'; end if;
     ids:=array(select jsonb_array_elements_text(coalesce(p_data->'assignee_ids','[]'))::uuid);
     if exists(select 1 from unnest(ids) x where not exists(select 1 from projects p where p.id=pid and x=any(p.member_ids))) then raise exception 'El responsable debe pertenecer al proyecto.'; end if;
     select assignee_ids into old_ids from tasks where id=eid and workspace_id=w;
     if eid is null then insert into tasks(workspace_id,project_id,name,estimate,assignee_ids,status,completed_at) values(w,pid,trim(p_data->>'name'),coalesce((p_data->>'estimate')::numeric,0),ids,coalesce(p_data->>'status','pending'),case when p_data->>'status'='completed' then now() end) returning id into eid;
     else update tasks set name=coalesce(p_data->>'name',name),estimate=coalesce((p_data->>'estimate')::numeric,estimate),assignee_ids=case when p_data?'assignee_ids' then ids else assignee_ids end,status=coalesce(p_data->>'status',status),completed_at=case when p_data?'status' then case when p_data->>'status'='completed' then coalesce(completed_at,now()) else null end else completed_at end,archived=coalesce((p_data->>'archived')::boolean,archived) where id=eid and workspace_id=w; end if;
     insert into notifications(workspace_id,user_id,title,message,project_id,task_id) select w,x,'Nueva tarea asignada',coalesce(p_data->>'name',(select name from tasks where id=eid)),coalesce(pid,(select project_id from tasks where id=eid)),eid from unnest(ids) x where x<>u and not (x=any(coalesce(old_ids,'{}')));
   end if;
 end if;
 insert into audit(workspace_id,actor_id,action,detail) values(w,u,p_action,coalesce(eid::text,p_data->>'name','Actualización'));
 r=jsonb_build_object('ok',true); insert into requests values(p_request,u,r); return r;
end $$;
revoke execute on function public.app_command_v1(text,jsonb,uuid) from public,anon,authenticated;
revoke execute on function public.app_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.app_snapshot(),public.app_command(text,jsonb,uuid) to authenticated;
