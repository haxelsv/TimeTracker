-- Keep invitation history visible to workspace administrators, including accepted invitations.
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
 'invitations',case when is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'email',x.email,'role',x.role,'expires_at',x.expires_at,'accepted',x.accepted,'status',x.status,'sent_at',x.sent_at,'last_sent_at',x.last_sent_at,'send_count',x.send_count,'created_at',x.created_at,'accepted_at',x.accepted_at,'cancelled_at',x.cancelled_at) order by x.created_at desc) from invitations x where x.workspace_id=w),'[]'::jsonb) else '[]'::jsonb end,
 'notifications',coalesce((select jsonb_agg(x order by created_at desc) from (select * from notifications order by created_at desc limit 50) x),'[]'::jsonb),
 'server_now',clock_timestamp()) into result;
 return result;
end $$;
