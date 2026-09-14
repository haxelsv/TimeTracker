import type { Snapshot, Payload, Entry, Rate } from './types';
import { dayKey, weekKey, shiftDay, localISO, splitDays, overlaps } from './time';
const KEY = 'timetracker.demo.v1';
const uid = () => crypto.randomUUID();
export function seedDemo(): Snapshot {
  const today = dayKey(new Date()),
    week = weekKey(today);
  const people = [
    {
      id: 'demo-admin',
      name: 'Alex Rivera',
      email: 'alex@example.com',
      role: 'admin' as const,
      active: true,
    },
    {
      id: 'demo-sofia',
      name: 'Sofía Martínez',
      email: 'sofia@example.com',
      role: 'member' as const,
      active: true,
    },
    {
      id: 'demo-diego',
      name: 'Diego López',
      email: 'diego@example.com',
      role: 'member' as const,
      active: true,
    },
  ];
  const s: Snapshot = {
    workspace: { id: 'demo', name: 'Estudio creativo', currency: 'USD', timezone: 'America/Panama', project_status_policy: 'all' },
    me: people[0],
    members: people,
    clients: [
      { id: 'c1', name: 'Forma Studio', email: 'hola@example.com', archived: false, logo_url: null },
      { id: 'c2', name: 'Nómada', email: 'equipo@example.com', archived: false, logo_url: null },
      { id: 'c3', name: 'Lumina', email: 'hola@example.com', archived: false, logo_url: null },
    ],
    projects: [
      {
        id: 'p1',
        name: 'Rediseño de marca',
        client_id: 'c1',
        color: '#18181b',
        estimate: 40,
        archived: false,
        member_ids: people.map((p) => p.id),
        status: 'in_progress',
        completed_at: null,
      },
      {
        id: 'p2',
        name: 'Sitio web',
        client_id: 'c2',
        color: '#df9a55',
        estimate: 60,
        archived: false,
        member_ids: people.map((p) => p.id),
        status: 'in_progress',
        completed_at: null,
      },
      {
        id: 'p3',
        name: 'Campaña de lanzamiento',
        client_id: 'c3',
        color: '#68a794',
        estimate: 32,
        archived: false,
        member_ids: people.map((p) => p.id),
        status: 'pending',
        completed_at: null,
      },
      {
        id: 'p4',
        name: 'Gestión del estudio',
        client_id: null,
        color: '#8298b6',
        estimate: 20,
        archived: false,
        member_ids: people.map((p) => p.id),
        status: 'pending',
        completed_at: null,
      },
    ],
    tasks: [
      { id: 't1', project_id: 'p1', name: 'Identidad visual', estimate: 20, archived: false, assignee_ids: ['demo-sofia', 'demo-diego'], status: 'in_progress', completed_at: null },
      { id: 't2', project_id: 'p2', name: 'Diseño de interfaces', estimate: 30, archived: false, assignee_ids: ['demo-sofia'], status: 'pending', completed_at: null },
    ],
    tags: [
      { id: 'tag1', name: 'Diseño' },
      { id: 'tag2', name: 'Reunión' },
      { id: 'tag3', name: 'Investigación' },
    ],
    entries: [],
    approvals: [],
    rates: [{ id: 'r1', user_id: null, project_id: null, amount: 45 }],
    audit: [],
    invitations: [],
    notifications: [
      { id: 'n1', user_id: 'demo-admin', title: 'Proyecto actualizado', message: 'Puedes seguir el avance de Rediseño de marca.', project_id: 'p1', task_id: null, read_at: null, created_at: new Date().toISOString() },
    ],
    server_now: new Date().toISOString(),
  };
  const descriptions = [
    'Exploración de conceptos visuales',
    'Diseño de la página de inicio',
    'Reunión de seguimiento',
    'Preparación de entregables',
    'Investigación y referencias',
    'Ajustes de identidad visual',
    'Planificación de la semana',
  ];
  for (let d = -7; d <= 4; d++) {
    const day = shiftDay(week, d);
    if (day > today) continue;
    for (let j = 0; j < 3; j++) {
      const start = localISO(`${day}T${String(8 + j * 3).padStart(2, '0')}:00`, s.workspace.timezone);
      const end = new Date(Date.parse(start) + (60 + (((d + 8 + j) * 23) % 85)) * 60000).toISOString();
      if (Date.parse(end) > Date.now()) continue;
      s.entries.push({
        id: uid(),
        user_id: 'demo-admin',
        description: descriptions[((d + 7) * 3 + j) % descriptions.length],
        project_id: s.projects[(j + d + 8) % 4].id,
        task_id: null,
        tag_ids: [j === 2 ? 'tag2' : 'tag1'],
        billable: j !== 2,
        start_at: start,
        end_at: end,
        rate: 45,
        currency: 'USD',
      });
    }
  }
  for (const member of people.slice(1)) {
    const start = localISO(`${shiftDay(week, -3)}T09:00`, s.workspace.timezone);
    s.entries.push({
      id: uid(),
      user_id: member.id,
      description: 'Diseño y revisión del proyecto',
      project_id: 'p1',
      task_id: 't1',
      tag_ids: ['tag1'],
      billable: true,
      start_at: start,
      end_at: new Date(Date.parse(start) + 6 * 3600000).toISOString(),
      rate: 45,
      currency: 'USD',
    });
    s.approvals.push({
      id: uid(),
      user_id: member.id,
      week: shiftDay(week, -7),
      status: 'submitted',
      comment: '',
      updated_at: new Date().toISOString(),
    });
  }
  return s;
}
export function readDemo(): Snapshot {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw) as Snapshot;
      s.workspace.project_status_policy ??= 'all';
      s.projects = s.projects.map((p) => ({ ...p, status: p.status ?? 'in_progress', completed_at: p.completed_at ?? null }));
      s.clients = s.clients.map((c) => ({ ...c, logo_url: c.logo_url ?? null }));
      s.tasks = s.tasks.map((t) => ({ ...t, assignee_ids: t.assignee_ids ?? [], status: t.status ?? 'pending', completed_at: t.completed_at ?? null }));
      s.notifications ??= [];
      return s;
    } catch {
      /* reset corrupt demo only */
    }
  }
  const s = seedDemo();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
export function resolveRate(rates: Rate[], user: string, project: string | null) {
  return (
    [...rates]
      .filter((r) => (!r.user_id || r.user_id === user) && (!r.project_id || r.project_id === project))
      .sort(
        (a, b) =>
          Number(!!b.project_id) * 2 +
          Number(!!b.user_id) -
          (Number(!!a.project_id) * 2 + Number(!!a.user_id)),
      )[0]?.amount ?? 0
  );
}
function assertUnlocked(s: Snapshot, e: Entry) {
  if (
    splitDays(e, s.workspace.timezone).some((d) =>
      s.approvals.some(
        (a) => a.user_id === e.user_id && a.week === weekKey(d.day) && a.status !== 'returned',
      ),
    )
  )
    throw Error('La semana está enviada o aprobada. Solicita su reapertura.');
}
export async function demoCommand(action: string, data: Payload) {
  const work = async () => {
    const s = readDemo();
    const id = data.id as string;
    let result: Payload = { ok: true };
    const now = new Date().toISOString();
    if (['start', 'save_entry', 'stop', 'delete_entry'].includes(action)) {
      const old = s.entries.find((e) => e.id === id);
      if (old) assertUnlocked(s, old);
      if (action === 'delete_entry') s.entries = s.entries.filter((e) => e.id !== id);
      else if (action === 'stop') {
        if (!old) throw Error('Registro no encontrado.');
        old.end_at = now;
      } else {
        if (action === 'start' && s.entries.some((e) => e.user_id === s.me.id && !e.end_at))
          throw Error('Ya tienes un cronómetro en marcha.');
        const e: Entry = {
          id: old?.id ?? uid(),
          user_id: old?.user_id ?? s.me.id,
          description: String(data.description ?? ''),
          project_id: (data.project_id as string) || null,
          task_id: (data.task_id as string) || null,
          tag_ids: (data.tag_ids as string[]) ?? [],
          billable: !!data.billable,
          start_at: action === 'start' ? now : String(data.start_at),
          end_at: action === 'start' ? null : String(data.end_at),
          rate: old?.rate ?? resolveRate(s.rates, s.me.id, (data.project_id as string) || null),
          currency: old?.currency ?? s.workspace.currency,
        };
        if (e.end_at && Date.parse(e.end_at) <= Date.parse(e.start_at))
          throw Error('La hora de fin debe ser posterior al inicio.');
        if (e.end_at && Date.parse(e.end_at) > Date.now() + 60000)
          throw Error('No puedes registrar tiempo futuro.');
        if (e.end_at && s.entries.some((other) => overlaps(e, other)))
          throw Error('Ya tienes tiempo registrado en parte de ese día.');
        assertUnlocked(s, {
          ...e,
          end_at: e.end_at ?? new Date(Date.parse(e.start_at) + 1000).toISOString(),
        });
        s.entries = [e, ...s.entries.filter((x) => x.id !== e.id)];
      }
    } else if (action === 'approval') {
      const user = String(data.user_id || s.me.id),
        week = String(data.week);
      const old = s.approvals.find((a) => a.user_id === user && a.week === week);
      if (data.status === 'submitted') {
        if (s.entries.some((e) => e.user_id === user && !e.end_at))
          throw Error('Detén el cronómetro antes de enviar la semana.');
        if (
          !s.entries.some(
            (e) =>
              e.user_id === user && splitDays(e, s.workspace.timezone).some((d) => weekKey(d.day) === week),
          )
        )
          throw Error('La semana no tiene horas registradas.');
        if (old && old.status !== 'returned') throw Error('La semana ya está enviada.');
      }
      if (data.status === 'returned' && !String(data.comment ?? '').trim())
        throw Error('Indica el motivo de la devolución.');
      s.approvals = [
        {
          id: old?.id ?? uid(),
          user_id: user,
          week,
          status: data.status as 'submitted',
          comment: String(data.comment ?? ''),
          updated_at: now,
        },
        ...s.approvals.filter((a) => a.id !== old?.id),
      ];
    } else if (action === 'notification_read') {
      s.notifications = s.notifications.map((n) =>
        (data.all || n.id === id) && n.user_id === s.me.id ? { ...n, read_at: now } : n,
      );
    } else if (action === 'task_status') {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) throw Error('Tarea no encontrada.');
      if (s.me.role !== 'admin' && !task.assignee_ids.includes(s.me.id)) throw Error('No tienes asignada esta tarea.');
      task.status = data.status as 'pending' | 'in_progress' | 'completed';
      task.completed_at = task.status === 'completed' ? now : null;
    } else if (action === 'settings') {
      if (data.timezone !== s.workspace.timezone && s.entries.length)
        throw Error('La zona horaria solo puede cambiar antes del primer registro.');
      s.workspace = { ...s.workspace, ...data } as Snapshot['workspace'];
    } else if (action === 'project_status' || (action === 'project' && data.id && data.status && Object.keys(data).every((key) => ['id', 'status'].includes(key)))) {
      const project = s.projects.find((p) => p.id === id);
      if (!project) throw Error('Proyecto no encontrado.');
      if (s.me.role !== 'admin' && (s.workspace.project_status_policy !== 'all' || !project.member_ids.includes(s.me.id)))
        throw Error('Solo los administradores pueden cambiar el estado del proyecto.');
      if (!['pending', 'in_progress', 'completed'].includes(String(data.status))) throw Error('Estado no válido.');
      project.status = data.status as 'pending' | 'in_progress' | 'completed';
      project.completed_at = project.status === 'completed' ? now : null;
    } else if (action === 'rate') {
      const match = (r: Rate) =>
        r.user_id === (data.user_id || null) && r.project_id === (data.project_id || null);
      s.rates = [
        {
          id: uid(),
          user_id: (data.user_id as string) || null,
          project_id: (data.project_id as string) || null,
          amount: Number(data.amount),
        },
        ...s.rates.filter((r) => !match(r)),
      ];
    } else if (action === 'invite') {
      const token = uid();
      s.invitations.push({
        id: token,
        email: String(data.email),
        role: data.role as 'member',
        expires_at: new Date(Date.now() + 604800000).toISOString(),
        accepted: false,
      });
      result = { token };
    } else if (action === 'member') {
      if (id === s.me.id && (data.active === false || data.role === 'member'))
        throw Error('No puedes revocar tus propios permisos.');
      s.members = s.members.map((m) => (m.id === id ? { ...m, ...data } : m));
    } else {
      const map = { client: 'clients', project: 'projects', task: 'tasks', tag: 'tags' } as const;
      const key = map[action as keyof typeof map];
      if (!key) throw Error('Acción no disponible.');
      const arr = s[key] as unknown as Payload[];
      const old = arr.find((x) => x.id === id);
      let created: Payload;
      if (old) Object.assign(old, data);
      else {
        created = {
          id: uid(),
          archived: false,
          email: '',
          estimate: 0,
          color: '#18181b',
          client_id: null,
          member_ids: [],
          assignee_ids: [],
          status: 'pending',
          completed_at: null,
          ...data,
        };
        arr.push(created);
      }
      if (action === 'client') result = { ok: true, id: old?.id ?? created!.id };
      if ((action === 'project' || action === 'task') && data.status) {
        const item = (old ?? arr[arr.length - 1]) as Payload;
        item.completed_at = data.status === 'completed' ? now : null;
      }
      if (action === 'project' || action === 'task') {
        const assigned = (action === 'project' ? data.member_ids : data.assignee_ids) as string[] | undefined;
        for (const user of assigned ?? []) {
          if (user === s.me.id) continue;
          s.notifications.unshift({
            id: uid(), user_id: user,
            title: action === 'project' ? 'Nuevo proyecto asignado' : 'Nueva tarea asignada',
            message: String(data.name ?? old?.name ?? 'Tienes una nueva asignación'),
            project_id: String(action === 'project' ? (old?.id ?? arr[arr.length - 1].id) : data.project_id),
            task_id: action === 'task' ? String(old?.id ?? arr[arr.length - 1].id) : null,
            read_at: null, created_at: now,
          });
        }
      }
    }
    s.audit.unshift({
      id: uid(),
      actor_id: s.me.id,
      action,
      detail: String(data.description || data.name || data.comment || 'Actualización'),
      created_at: now,
    });
    localStorage.setItem(KEY, JSON.stringify(s));
    return result;
  };
  return navigator.locks ? navigator.locks.request(KEY, work) : work();
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  return readDemo();
}
