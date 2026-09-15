-- Email invitation tracking. Run after 001_timetracker.sql, 002_project_assignments.sql and 003_client_logos.sql.
alter table public.invitations
  add column if not exists status text not null default 'pending' check(status in ('pending','accepted','expired','cancelled')),
  add column if not exists invited_by uuid references public.members(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists send_count integer not null default 0 check(send_count >= 0);

update public.invitations set status = case when accepted then 'accepted' else 'pending' end where status is null or (accepted and status = 'pending');

create index if not exists invitations_workspace_status on public.invitations(workspace_id,status,created_at desc);

create or replace function public.sync_invitation_status() returns trigger language plpgsql as $$
begin
  if new.accepted then
    new.status := 'accepted';
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end $$;
drop trigger if exists sync_invitation_status on public.invitations;
create trigger sync_invitation_status before insert or update on public.invitations
for each row execute function public.sync_invitation_status();

create policy admin_invitations on public.invitations for select to authenticated
  using (workspace_id = my_workspace() and is_admin());
grant select on public.invitations to authenticated;

create or replace function public.app_snapshot() returns jsonb language plpgsql security invoker set search_path=public as $$
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
 'invitations',case when is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'email',x.email,'role',x.role,'expires_at',x.expires_at,'accepted',x.accepted,'status',x.status,'sent_at',x.sent_at,'last_sent_at',x.last_sent_at,'send_count',x.send_count,'created_at',x.created_at) order by x.created_at desc) from invitations x where x.workspace_id=w and x.status in ('pending','expired','cancelled')),'[]'::jsonb) else '[]'::jsonb end,
 'notifications',coalesce((select jsonb_agg(x order by created_at desc) from (select * from notifications order by created_at desc limit 50) x),'[]'::jsonb),
 'server_now',clock_timestamp()) into result;
 return result;
end $$;
