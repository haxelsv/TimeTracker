import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
let db: PGlite;
const admin = '10000000-0000-4000-8000-000000000001',
  member = '10000000-0000-4000-8000-000000000002',
  stranger = '10000000-0000-4000-8000-000000000003',
  workspace = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002';
async function as(user: string, fn: () => Promise<unknown>) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false); select set_config('request.jwt.claim.email','${user === admin ? 'admin' : user === member ? 'member' : 'stranger'}@example.com',false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
async function cmd(user: string, action: string, data: Record<string, unknown>, request = randomUUID()) {
  return as(user, async () => {
    const result = await db.query<{ result: Record<string, unknown> }>(
      'select app_command($1,$2::jsonb,$3::uuid) as result',
      [action, JSON.stringify(data), request],
    );
    return result.rows[0].result;
  });
}
async function snap(user: string) {
  return as(user, async () => {
    const r = await db.query<{ s: Record<string, any> }>('select app_snapshot() as s');
    return r.rows[0].s;
  }) as Promise<Record<string, any>>;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$; grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`,
  );
  for (const file of readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const migration = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
      'create extension if not exists pgcrypto;',
      '',
    );
    await db.exec(migration);
  }
  await db.exec(
    `insert into auth.users values('${admin}'),('${member}'),('${stranger}');insert into workspaces(id) values('${workspace}'),('${other}');insert into members values('${admin}','${workspace}','Admin','admin@example.com','admin',true),('${member}','${workspace}','Member','member@example.com','member',true),('${stranger}','${other}','Stranger','stranger@example.com','admin',true);`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe.sequential('Postgres permissions and transactional commands', () => {
  it('denies unauthenticated RPC calls', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query(`select app_snapshot()`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
  it('denies direct writes even for an admin', async () => {
    await expect(
      as(admin, () => db.query("insert into clients(workspace_id,name) values($1,'bad')", [workspace])),
    ).rejects.toThrow(/permission denied/);
  });
  it('blocks administrative commands from a member', async () => {
    await expect(cmd(member, 'client', { name: 'Forbidden' })).rejects.toThrow(/administrador/);
    await expect(cmd(member, 'rate', { amount: 999 })).rejects.toThrow(/administrador/);
  });
  it('creates an assigned project and rejects cross-team references', async () => {
    await cmd(admin, 'client', { name: 'Client' });
    let s = await snap(admin);
    await cmd(admin, 'project', { name: 'Project', client_id: s.clients[0].id, member_ids: [admin, member] });
    await expect(cmd(admin, 'project', { name: 'Invalid', member_ids: [stranger] })).rejects.toThrow(
      /Miembro no válido/,
    );
    s = await snap(member);
    expect(s.projects).toHaveLength(1);
    expect((await snap(stranger)).projects).toHaveLength(0);
  });
  it('hides rates, audit and unrelated time while sharing the project team', async () => {
    await cmd(admin, 'rate', { amount: 45 });
    await cmd(admin, 'save_entry', {
      description: 'Admin only',
      start_at: '2026-01-05T15:00Z',
      end_at: '2026-01-05T16:00Z',
      billable: true,
    });
    const s = await snap(member);
    expect(s.entries).toHaveLength(0);
    expect(s.rates).toHaveLength(0);
    expect(s.audit).toHaveLength(0);
    expect(s.members).toHaveLength(2);
    const hidden = await as(member, () => db.query('select * from entry_finance'));
    expect((hidden as any).rows).toHaveLength(0);
  });
  it('stores historical rates and never exposes them to a member', async () => {
    await cmd(member, 'save_entry', {
      description: 'Billable work',
      start_at: '2026-01-05T17:00Z',
      end_at: '2026-01-05T18:00Z',
      billable: true,
    });
    await cmd(admin, 'rate', { amount: 90 });
    const a = await snap(admin),
      m = await snap(member);
    expect(a.entries.find((e: any) => e.user_id === member).rate).toBe(45);
    expect(m.entries[0]).not.toHaveProperty('rate');
    expect(m.entries[0]).not.toHaveProperty('currency');
  });
  it('rejects editing an unrelated user entry and negative durations', async () => {
    const s = await snap(admin);
    const e = s.entries.find((e: any) => e.user_id === admin);
    await expect(cmd(member, 'delete_entry', { id: e.id })).rejects.toThrow(/permiso/);
    await expect(
      cmd(member, 'save_entry', { start_at: '2026-01-01T11:00Z', end_at: '2026-01-01T10:00Z' }),
    ).rejects.toThrow(/posterior/);
  });
  it('makes retries idempotent and only allows one running timer', async () => {
    const id = randomUUID();
    await cmd(member, 'start', { description: 'Running', billable: true }, id);
    await cmd(member, 'start', { description: 'Running', billable: true }, id);
    await expect(cmd(member, 'start', { description: 'Second' })).rejects.toThrow(/marcha/);
    let s = await snap(member);
    const running = s.entries.filter((e: any) => !e.end_at);
    expect(running).toHaveLength(1);
    const stopId = randomUUID();
    await cmd(member, 'stop', { id: running[0].id }, stopId);
    s = await snap(member);
    const end = s.entries.find((e: any) => e.id === running[0].id).end_at;
    await cmd(member, 'stop', { id: running[0].id }, stopId);
    expect((await snap(member)).entries.find((e: any) => e.id === running[0].id).end_at).toBe(end);
  });
  it('locks submitted weeks and requires a comment to reopen', async () => {
    await cmd(member, 'approval', { week: '2026-01-05', status: 'submitted' });
    const e = (await snap(member)).entries.find((e: any) => e.description === 'Billable work');
    await expect(cmd(member, 'delete_entry', { id: e.id })).rejects.toThrow(/aprobada/);
    await expect(
      cmd(member, 'save_entry', { start_at: '2026-01-06T10:00Z', end_at: '2026-01-06T11:00Z' }),
    ).rejects.toThrow(/aprobada/);
    await expect(
      cmd(member, 'approval', { user_id: member, week: '2026-01-05', status: 'approved' }),
    ).rejects.toThrow(/administrador/);
    await cmd(admin, 'approval', { user_id: member, week: '2026-01-05', status: 'approved' });
    await expect(
      cmd(admin, 'approval', { user_id: member, week: '2026-01-05', status: 'returned', comment: '' }),
    ).rejects.toThrow(/motivo/);
    await cmd(admin, 'approval', {
      user_id: member,
      week: '2026-01-05',
      status: 'returned',
      comment: 'Corregir descripción',
    });
    await cmd(member, 'save_entry', { ...e, description: 'Updated' });
    expect((await snap(admin)).audit.some((x: any) => x.detail.includes('Corregir descripción'))).toBe(true);
  });
  it('checks both sides of a cross-week entry', async () => {
    await cmd(member, 'approval', { week: '2026-01-05', status: 'submitted' });
    await expect(
      cmd(member, 'save_entry', { start_at: '2026-01-05T04:30Z', end_at: '2026-01-05T05:30Z' }),
    ).rejects.toThrow(/aprobada/);
  });
  it('validates invitation email ownership and accepts only once', async () => {
    const result = (await cmd(admin, 'invite', { email: 'new@example.com', role: 'member' })) as {
      token: string;
    };
    const newcomer = '10000000-0000-4000-8000-000000000004';
    await db.exec(`insert into auth.users values('${newcomer}')`);
    await expect(cmd(stranger, 'accept_invitation', { token: result.token })).rejects.toThrow(/invitación/);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${newcomer}',false);select set_config('request.jwt.claim.email','new@example.com',false)`,
    );
    try {
      await db.query('select app_command($1,$2::jsonb,$3::uuid)', [
        'accept_invitation',
        JSON.stringify({ token: result.token, name: 'New member' }),
        randomUUID(),
      ]);
      await expect(
        db.query('select app_command($1,$2::jsonb,$3::uuid)', [
          'accept_invitation',
          JSON.stringify({ token: result.token }),
          randomUUID(),
        ]),
      ).rejects.toThrow(/invitación/);
    } finally {
      await db.exec('reset role');
    }
    const adminSnapshot = await snap(admin);
    expect(adminSnapshot.members).toHaveLength(3);
    expect(adminSnapshot.invitations).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: 'new@example.com', accepted: true, status: 'accepted' })]),
    );
    expect((await snap(member)).invitations).toEqual([]);
  });
  it('notifies task assignees and lets them update completion', async () => {
    const project = (await snap(admin)).projects[0];
    await cmd(admin, 'task', {
      project_id: project.id,
      name: 'Assigned task',
      assignee_ids: [member],
      status: 'pending',
    });
    let s = await snap(member);
    const task = s.tasks.find((t: any) => t.name === 'Assigned task');
    expect(task.assignee_ids).toContain(member);
    expect(s.notifications.some((n: any) => n.task_id === task.id && !n.read_at)).toBe(true);
    await cmd(member, 'task_status', { id: task.id, status: 'completed' });
    s = await snap(member);
    expect(s.tasks.find((t: any) => t.id === task.id).status).toBe('completed');
    await cmd(member, 'notification_read', { all: true });
    expect((await snap(member)).notifications.every((n: any) => n.read_at)).toBe(true);
  });
  it('allows configurable project status changes without changing on read', async () => {
    const project = (await snap(admin)).projects[0];
    const before = (await snap(member)).projects.find((p: any) => p.id === project.id);
    await cmd(member, 'project', { id: project.id, status: 'completed' });
    let after = (await snap(member)).projects.find((p: any) => p.id === project.id);
    expect(after.status).toBe('completed');
    expect(after.completed_at).toBeTruthy();
    const readAgain = (await snap(member)).projects.find((p: any) => p.id === project.id);
    expect(readAgain.completed_at).toBe(after.completed_at);
    await cmd(admin, 'settings', {
      name: (await snap(admin)).workspace.name,
      currency: 'USD',
      timezone: 'America/Panama',
      project_status_policy: 'admins',
    });
    await expect(cmd(member, 'project', { id: project.id, status: 'in_progress' })).rejects.toThrow(/administrador/);
    await cmd(admin, 'project', { id: project.id, status: 'in_progress' });
    after = (await snap(member)).projects.find((p: any) => p.id === project.id);
    expect(after.status).toBe('in_progress');
    expect(after.completed_at).toBeNull();
    expect(before.status).not.toBe('completed');
  });
  it('revoked membership denies all reads and actions', async () => {
    await cmd(admin, 'member', { id: member, active: false });
    await expect(snap(member)).rejects.toThrow(/acceso/);
    await expect(cmd(member, 'start', { description: 'No access' })).rejects.toThrow(/acceso/);
    const rows = await as(member, () => db.query('select * from entries'));
    expect((rows as any).rows).toHaveLength(0);
  });
});
