import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import {
  Timer,
  FolderClosed,
  Users,
  BarChart3,
  ClipboardCheck,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  Square,
  Search,
  CalendarDays,
  List,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  Tag as TagIcon,
  DollarSign,
  Ellipsis,
  Trash2,
  Copy,
  Pencil,
  Archive,
  RotateCcw,
  Download,
  LogOut,
  Menu,
  X,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Mail,
  ShieldCheck,
  ArrowLeft,
  Building2,
  ExternalLink,
  LoaderCircle,
  Bell,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { command, snapshot, supabase, uploadClientLogo, removeClientLogo, sendInvitation, manageInvitation } from './lib/api';
import type { Snapshot, Entry, Payload, Project, Client, Task } from './lib/types';
import {
  clock,
  hours,
  money,
  dayKey,
  weekKey,
  shiftDay,
  sliceEntry,
  duration,
  inputDate,
  freeSlot,
  decimalHoursToSeconds,
} from './lib/time';
import type { ReportRow } from './lib/export';
const exportCSV = (...args: Parameters<(typeof import('./lib/export'))['exportCSV']>) =>
  void import('./lib/export').then((m) => m.exportCSV(...args));
const exportPDF = (...args: Parameters<(typeof import('./lib/export'))['exportPDF']>) =>
  void import('./lib/export').then((m) => m.exportPDF(...args));
import { resetDemo } from './lib/demo';
import { Modal, Field, Empty, Avatar, Badge } from './components/ui';

const nav = [
  ['time', 'Tiempo', Timer],
  ['projects', 'Proyectos', FolderClosed],
  ['clients', 'Clientes', Building2],
  ['reports', 'Informes', BarChart3],
  ['approvals', 'Aprobaciones', ClipboardCheck],
  ['team', 'Equipo', Users],
] as const;
const colors = ['#18181b', '#df9a55', '#68a794', '#8298b6', '#d17a94', '#b0a05c'];
const dateLabel = (day: string, pattern = 'd MMM') => format(parseISO(day), pattern, { locale: es });
function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'No se pudo guardar el cambio.';
}

export default function App() {
  const location = useLocation(),
    navigate = useNavigate();
  const demo = location.pathname.startsWith('/demo');
  const section = location.pathname.split('/').filter(Boolean).at(-1) || 'time';
  const base = demo ? '/demo' : '';
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [authenticated, setAuthenticated] = useState(false),
    [recovery, setRecovery] = useState(location.pathname === '/reset-password');
  const [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [online, setOnline] = useState(navigator.onLine),
    [menu, setMenu] = useState(false),
    [notificationMenu, setNotificationMenu] = useState(false),
    [mobile, setMobile] = useState(window.matchMedia('(max-width:700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width:700px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [dialog, setDialog] = useState<{ kind: string; value?: Payload } | null>(null),
    [formError, setFormError] = useState('');
  const reload = useCallback(async () => {
    try {
      const started = Date.now();
      const s = await snapshot(demo);
      setOffset(Date.parse(s.server_now) - (started + Date.now()) / 2);
      setData(s);
      setLoadError('');
    } catch (e) {
      setLoadError(errorText(e));
      if (/acceso|JWT|permission|session/i.test(errorText(e))) setData(null);
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    setData(null);
    setLoading(true);
    if (demo) {
      setAuthenticated(true);
      void reload();
      return;
    }
    if (!supabase) {
      setLoading(false);
      setAuthenticated(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(!!data.session);
      if (!data.session) setLoading(false);
      else void reload();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthenticated(!!session);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (session) setTimeout(() => void reload(), 0);
      else {
        setData(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [demo, reload]);
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (navigator.onLine) void reload();
    }, 10000);
    const sync = () => {
      if (navigator.onLine) void reload();
    };
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, [authenticated, reload]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const open = (kind: string, value?: Payload) => {
    setDialog({ kind, value });
    setFormError('');
  };
  const act = async (action: string, payload: Payload, success = 'Cambios guardados') => {
    if (busy) return;
    setBusy(true);
    setFormError('');
    try {
      const result = action === 'invite' && !demo ? await sendInvitation(false, payload) : await command(demo, action, payload);
      await reload();
      setToast(success);
      return result;
    } catch (e) {
      setFormError(errorText(e));
      setToast(errorText(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const run = async (action: string, payload: Payload, success?: string) => {
    try { await act(action, payload, success); } catch { /* parent displays the error */ }
  };
  const close = () => {
    if (!busy) setDialog(null);
  };
  if (location.pathname === '/') return <Navigate to={supabase ? '/time' : '/demo/time'} replace />;
  if (location.pathname === '/invite' || recovery || (!demo && !authenticated))
    return (
      <Auth
        recovery={recovery}
        onRecovered={() => {
          setRecovery(false);
          navigate('/time');
        }}
      />
    );
  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <p>Cargando tu espacio de trabajo…</p>
      </div>
    );
  if (!data)
    return (
      <div className="loading-screen">
        <ShieldCheck size={36} />
        <h2>{loadError || 'Acceso del equipo'}</h2>
        <p>Pide una invitación al administrador para acceder.</p>
        <button className="button" onClick={() => void reload()}>
          Volver a intentar
        </button>
        <button className="text-button" onClick={() => void supabase?.auth.signOut()}>
          Cerrar sesión
        </button>
        <NavLink to="/demo/time">Explorar la demostración</NavLink>
      </div>
    );
  const admin = data.me.role === 'admin';
  const pending = data.approvals.filter((a) => a.status === 'submitted').length;
  const unread = data.notifications.filter((n) => !n.read_at).length;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <aside inert={mobile && !menu} className={'sidebar ' + (menu ? 'open' : '')}>
        <div className="brand">
          <Timer size={29} strokeWidth={2.5} />
          <span>
            Star5<span className="brand-light">Tracker</span>
            <i />
          </span>
          <button
            className="mobile-only icon-button"
            onClick={() => setMenu(false)}
            aria-label="Cerrar navegación"
          >
            <X />
          </button>
        </div>
        <button
          className="workspace-switch"
          onClick={() => {
            navigate(base + '/settings');
            setMenu(false);
          }}
        >
          <span className="workspace-icon">{data.workspace.name[0]}</span>
          <span>
            <strong>{data.workspace.name}</strong>
            <small>Espacio de trabajo</small>
          </span>
          <ChevronDown size={16} />
        </button>
        <div className="nav-caption">TU ESPACIO</div>
        <nav aria-label="Navegación principal">
          {nav
            .filter(([key]) => admin || !['team', 'clients'].includes(key))
            .map(([key, label, Icon]) => (
              <NavLink key={key} to={base + '/' + key} onClick={() => setMenu(false)}>
                <Icon size={20} />
                <span>{label}</span>
                {key === 'approvals' && pending > 0 && <span className="nav-count">{pending}</span>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-dot" />
            <strong>Cada minuto cuenta.</strong>
            <p>Dale espacio a lo que importa.</p>
          </div>
          <NavLink
            className={'settings-link ' + (section === 'settings' ? 'selected' : '')}
            to={base + '/settings'}
          >
            <Settings size={19} /> Ajustes
          </NavLink>
          <div className="profile">
            <Avatar name={data.me.name} />
            <div>
              <strong>{data.me.name}</strong>
              <small>{admin ? 'Administrador' : 'Miembro'}</small>
            </div>
            <button
              className="icon-button"
              aria-label={demo ? 'Salir de demostración' : 'Cerrar sesión'}
              onClick={() => {
                if (demo) navigate('/login');
                else void supabase?.auth.signOut();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setMenu(true)}
              aria-label="Abrir navegación"
            >
              <Menu />
            </button>
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === section)?.[1] ?? 'Ajustes'}</strong>
          </div>
          <div className="topbar-right">
            {demo ? (
              <span className="demo-pill">
                <span />
                Demostración
              </span>
            ) : (
              <span className="sync-status">
                <CheckCheck size={15} />
                Sincronizado
              </span>
            )}
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
                aria-expanded={notificationMenu}
                onClick={() => setNotificationMenu(!notificationMenu)}
              >
                <Bell size={18} />
                {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
              </button>
              {notificationMenu && (
                <div className="notification-panel">
                  <header>
                    <strong>Notificaciones</strong>
                    {unread > 0 && (
                      <button className="text-button" onClick={() => run('notification_read', { all: true }, 'Notificaciones leídas')}>
                        Marcar leídas
                      </button>
                    )}
                  </header>
                  {data.notifications.length ? data.notifications.slice(0, 8).map((n) => (
                    <button
                      className={'notification-item ' + (!n.read_at ? 'unread' : '')}
                      key={n.id}
                      onClick={() => {
                        if (!n.read_at) run('notification_read', { id: n.id });
                        setNotificationMenu(false);
                        if (n.project_id) navigate(base + '/projects');
                      }}
                    >
                      <span />
                      <div><strong>{n.title}</strong><p>{n.message}</p><small>{dateLabel(n.created_at.slice(0, 10), 'd MMM')}</small></div>
                    </button>
                  )) : <p className="notification-empty">No tienes notificaciones.</p>}
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <Avatar name={data.me.name} small />
          </div>
        </header>
        {!online && (
          <div className="connection-banner">
            <WifiOff size={17} />
            Sin conexión. Los registros abiertos continúan; los cambios se guardarán cuando los vuelvas a enviar.
          </div>
        )}
        {loadError && (
          <div className="connection-banner">
            <AlertCircle size={17} />
            {loadError}
            <button onClick={() => void reload()}>Reintentar</button>
          </div>
        )}
        <main id="main">
          {section === 'time' ? (
            <TimePage s={data} now={now} open={open} run={run} />
          ) : section === 'projects' ? (
            <ProjectsPage s={data} now={now} open={open} run={run} />
          ) : section === 'clients' ? (
            <ClientsPage s={data} open={open} run={run} />
          ) : section === 'reports' ? (
            <ReportsPage s={data} now={now} />
          ) : section === 'approvals' ? (
            <ApprovalsPage s={data} now={now} open={open} run={run} />
          ) : section === 'team' ? (
            <TeamPage s={data} open={open} run={run} reload={reload} demo={demo} />
          ) : (
            <SettingsPage s={data} busy={busy} demo={demo} open={open} act={act} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            {demo
              ? 'Datos de ejemplo · Guardados solo en este navegador'
              : data.workspace.name + ' · Espacio privado del equipo'}
          </span>
          <span>
            {data.workspace.timezone.replace('_', ' ')} <span className="tiny-dot" />{' '}
            {data.workspace.currency}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button className="icon-button" onClick={() => setToast('')} aria-label="Cerrar notificación">
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <Editor
          dialog={dialog}
          s={data}
          busy={busy}
          error={formError}
          close={close}
          act={act}
          demo={demo}
          reload={reload}
        />
      )}
    </div>
  );
}

type Shared = {
  s: Snapshot;
  now: number;
  open: (kind: string, value?: Payload) => void;
  run: (action: string, payload: Payload, success?: string) => Promise<void>;
};
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function ClientMark({ client, size = 'small' }: { client?: Client | null; size?: 'tiny' | 'small' | 'medium' | 'large' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [client?.logo_url]);
  if (!client) return null;
  const initials = client.name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span className={`client-mark client-mark-${size}`} aria-hidden="true">
      {client.logo_url && !failed ? <img src={client.logo_url} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}
function ProjectLabel({
  s,
  id,
  showClient = true,
}: {
  s: Snapshot;
  id: string | null;
  showClient?: boolean;
}) {
  const p = s.projects.find((p) => p.id === id),
    c = s.clients.find((c) => c.id === p?.client_id);
  return (
    <span className="project-label">
      <span className="project-name">
        <span className="project-dot" style={{ background: p?.color ?? '#b7b3bf' }} />
        {p?.name ?? 'Sin proyecto'}
      </span>
      {c && <span className="client-label"><ClientMark client={c} size="tiny" />{showClient && <span>{c.name}</span>}</span>}
    </span>
  );
}
type SheetRow = { key: string; projectId: string; taskId: string | null; description: string };
const sheetKey = (projectId: string, taskId: string | null) => `${projectId}::${taskId ?? ''}`;
function SheetCell({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value ? String(Number(value.toFixed(2))) : '');
  useEffect(() => setDraft(value ? String(Number(value.toFixed(2))) : ''), [value]);
  const commit = () => {
    const parsed = draft.trim() === '' ? 0 : Number(draft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) { setDraft(value ? String(Number(value.toFixed(2))) : ''); return; }
    onCommit(parsed);
  };
  return <input className="sheet-cell-input" aria-label="Horas del día" inputMode="decimal" min="0" max="24" step="0.25" value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); } }} />;
}
function TimesheetGrid({ s, week, days, entries, approval, run, now }: { s: Snapshot; week: string; days: string[]; entries: Entry[]; approval?: Snapshot['approvals'][number]; run: Shared['run']; now: number }) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const locked = !!approval && approval.status !== 'returned';
  const projectOptions = s.projects.filter((p) => !p.archived && p.status !== 'completed' && p.member_ids.includes(s.me.id));
  const weekEntries = entries.filter((e) => e.user_id === s.me.id && sliceEntry(e, week, shiftDay(week, 6), s.workspace.timezone, now) > 0);
  useEffect(() => {
    const grouped = new Map<string, SheetRow>();
    weekEntries.forEach((e) => {
      if (!e.project_id) return;
      const key = sheetKey(e.project_id, e.task_id);
      if (!grouped.has(key)) grouped.set(key, { key, projectId: e.project_id, taskId: e.task_id, description: e.description || '' });
    });
    setRows((previous) => {
      const additions = previous.filter((r) => !grouped.has(r.key) && !weekEntries.some((e) => e.project_id === r.projectId && e.task_id === r.taskId));
      return [...grouped.values(), ...additions];
    });
  }, [week, s.me.id, entries.length]);
  const rowEntries = (row: SheetRow, day: string) => weekEntries.filter((e) => e.project_id === row.projectId && (e.task_id ?? null) === row.taskId && sliceEntry(e, day, day, s.workspace.timezone, now) > 0);
  const cellHours = (row: SheetRow, day: string) => rowEntries(row, day).reduce((n, e) => n + sliceEntry(e, day, day, s.workspace.timezone, now) / 3600, 0);
  const total = (row: SheetRow) => days.reduce((n, day) => n + cellHours(row, day), 0);
  const addRow = () => {
    if (!projectId) return;
    const projectTasks = s.tasks.filter((t) => t.project_id === projectId && !t.archived);
    const selectedTask = projectTasks.length ? taskId || null : null;
    if (projectTasks.length && !selectedTask) return;
    const key = sheetKey(projectId, selectedTask);
    if (rows.some((r) => r.key === key)) return;
    setRows((current) => [...current, { key, projectId, taskId: selectedTask, description: '' }]);
    setProjectId(''); setTaskId('');
  };
  const saveCell = async (row: SheetRow, day: string, value: number) => {
    if (locked) return;
    const existing = rowEntries(row, day);
    if (existing.length) {
      for (const old of existing.slice(value > 0 ? 1 : 0)) await run('delete_entry', { id: old.id }, '');
      if (value <= 0) return;
    }
    const current = existing[0];
    const slot = freeSlot(day, decimalHoursToSeconds(value), s.entries.filter((e) => e.user_id === s.me.id), s.workspace.timezone, current?.id);
    if (!slot) return;
    await run('save_entry', { id: current?.id, user_id: s.me.id, project_id: row.projectId, task_id: row.taskId, description: row.description, tag_ids: [], billable: true, start_at: slot.start, end_at: slot.end }, 'Horas guardadas');
  };
  const saveDescription = async (row: SheetRow, description: string) => {
    setRows((current) => current.map((r) => r.key === row.key ? { ...r, description } : r));
    for (const e of weekEntries.filter((entry) => entry.project_id === row.projectId && (entry.task_id ?? null) === row.taskId)) await run('save_entry', { id: e.id, description }, 'Descripción guardada');
  };
  const removeRow = async (row: SheetRow) => {
    if (locked) return;
    for (const e of weekEntries.filter((entry) => entry.project_id === row.projectId && (entry.task_id ?? null) === row.taskId)) await run('delete_entry', { id: e.id }, 'Fila eliminada');
    setRows((current) => current.filter((r) => r.key !== row.key));
  };
  const totalDays = days.map((day) => rows.reduce((n, row) => n + cellHours(row, day), 0));
  return <div className="timesheet-wrap">
    <div className="timesheet-addbar">
      <select aria-label="Proyecto para la planilla" value={projectId} disabled={locked} onChange={(e) => { setProjectId(e.target.value); setTaskId(''); }}><option value="">Agregar proyecto…</option>{projectOptions.filter((p) => { const tasks = s.tasks.filter((t) => t.project_id === p.id && !t.archived); return tasks.length ? tasks.some((t) => !rows.some((r) => r.projectId === p.id && r.taskId === t.id)) : !rows.some((r) => r.projectId === p.id && !r.taskId); }).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {projectId && s.tasks.some((t) => t.project_id === projectId && !t.archived) && <select aria-label="Tarea para la planilla" value={taskId} disabled={locked} onChange={(e) => setTaskId(e.target.value)}><option value="">Seleccionar tarea…</option>{s.tasks.filter((t) => t.project_id === projectId && !t.archived && !rows.some((r) => r.taskId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      <button className="button primary" disabled={locked || !projectId || (s.tasks.some((t) => t.project_id === projectId && !t.archived) && !taskId)} onClick={addRow}><Plus size={16} />Agregar proyecto</button>
      {locked && <span className="muted">Semana bloqueada</span>}
    </div>
    <div className="timesheet-scroll"><table className="timesheet-table"><thead><tr><th>Proyecto / tarea</th>{days.map((day) => <th key={day}>{dateLabel(day, 'EEE d')}</th>)}<th>Total</th><th /></tr></thead><tbody>
      {rows.map((row) => { const project = s.projects.find((p) => p.id === row.projectId); const client = s.clients.find((c) => c.id === project?.client_id); const task = s.tasks.find((t) => t.id === row.taskId); return <tr key={row.key}><td><div className="sheet-project"><ProjectLabel s={s} id={row.projectId} /><strong>{task?.name || 'Proyecto'}</strong><input className="sheet-description" placeholder="Descripción opcional" disabled={locked} value={row.description} onChange={(e) => setRows((current) => current.map((r) => r.key === row.key ? { ...r, description: e.target.value } : r))} onBlur={(e) => void saveDescription(row, e.target.value)} /></div></td>{days.map((day) => <td key={day}><SheetCell value={cellHours(row, day)} disabled={locked} onCommit={(value) => void saveCell(row, day, value)} /></td>)}<td className="sheet-total">{total(row).toFixed(2)} h</td><td><button className="icon-button" aria-label="Eliminar fila" disabled={locked} onClick={() => void removeRow(row)}><Trash2 size={16} /></button></td></tr>; })}
      <tr className="timesheet-total"><th>Total</th>{totalDays.map((value, i) => <td key={days[i]}>{value.toFixed(2)} h</td>)}<th>{totalDays.reduce((a, b) => a + b, 0).toFixed(2)} h</th><td /></tr>
    </tbody></table></div>
    {!rows.length && <Empty title="Una semana por completar" description="Agrega un proyecto y registra sus horas por día, todo desde una sola fila." />}
  </div>;
}
function TimePage({ s, now, open, run }: Shared) {
  const today = dayKey(new Date(now), s.workspace.timezone),
    [anchor, setAnchor] = useState(today),
    [view, setView] = useState('week'),
    [search, setSearch] = useState('');
  const week = weekKey(anchor),
    end = shiftDay(week, 6),
    own = s.entries.filter((e) => e.user_id === s.me.id);
  const weekly = own.reduce((n, e) => n + sliceEntry(e, week, end, s.workspace.timezone, now), 0);
  const billed = own
    .filter((e) => e.billable)
    .reduce((n, e) => n + sliceEntry(e, week, end, s.workspace.timezone, now), 0);
  const list = own.filter(
    (e) =>
      e.end_at &&
      sliceEntry(e, week, end, s.workspace.timezone, now) > 0 &&
      [e.description, s.projects.find((p) => p.id === e.project_id)?.name]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(week, i));
  const approval = s.approvals.find((a) => a.user_id === s.me.id && a.week === week);
  return (
    <>
      <Heading
        eyebrow={dateLabel(today, "EEEE, d 'de' MMMM")}
        title="Tu tiempo, en perspectiva."
        description="Concéntrate en tu trabajo. Nosotros llevamos la cuenta."
      >
        <button className="button" onClick={() => open('entry')}>
          <Plus size={17} />
          Añadir tiempo
        </button>
      </Heading>
      <section className="stats-grid">
        <div className="stat">
          <span>
            Tiempo esta semana <Clock3 size={17} />
          </span>
          <strong>{hours(weekly)}</strong>
          <small>
            <span className="stat-dot" />
            Tu trabajo, minuto a minuto
          </small>
        </div>
        <div className="stat">
          <span>
            Tiempo facturable <DollarSign size={17} />
          </span>
          <strong>{hours(billed)}</strong>
          <small>{weekly ? Math.round((billed / weekly) * 100) : 0}% del tiempo registrado</small>
        </div>
        <div className="stat">
          <span>
            Proyectos esta semana <FolderClosed size={17} />
          </span>
          <strong>
            {new Set(
              own
                .filter((e) => e.project_id && sliceEntry(e, week, end, s.workspace.timezone, now) > 0)
                .map((e) => e.project_id),
            ).size
              .toString()
              .padStart(2, '0')}
          </strong>
          <small>Ideas que siguen avanzando</small>
        </div>
      </section>
      <section className="time-workspace">
        <div className="section-toolbar">
          <div className="view-tabs">
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              <List size={17} />
              Lista
            </button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
              <CalendarDays size={17} />
              Semana
            </button>
            <button className={view === 'sheet' ? 'active' : ''} onClick={() => setView('sheet')}>
              <ClipboardCheck size={17} />
              Planilla
            </button>
          </div>
          <div className="period-controls">
            <button
              className="icon-button"
              aria-label="Semana anterior"
              onClick={() => setAnchor(shiftDay(anchor, -7))}
            >
              <ChevronLeft size={17} />
            </button>
            <button className="date-range" onClick={() => setAnchor(today)} title="Volver a esta semana">
              <CalendarDays size={16} />
              {dateLabel(week)} – {dateLabel(end, 'd MMM yyyy')}
              <ChevronDown size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Semana siguiente"
              onClick={() => setAnchor(shiftDay(anchor, 7))}
            >
              <ChevronRight size={17} />
            </button>
            <button className="button subtle" onClick={() => setAnchor(today)}>
              Hoy
            </button>
          </div>
        </div>
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar registros"
              placeholder="Buscar una actividad o proyecto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span>
            {list.length} registros{' '}
            <span className="list-total">
              {clock(
                list.reduce((n, e) => n + sliceEntry(e, week, end, s.workspace.timezone, now), 0),
                false,
              )}
            </span>
          </span>
        </div>
        {view === 'sheet' ? (
          <TimesheetGrid s={s} week={week} days={days} entries={s.entries} approval={approval} run={run} now={now} />
        ) : view === 'week' ? (
          <div className="week-grid">
            {days.map((day) => (
              <div className={'week-column ' + (day === today ? 'today' : '')} key={day}>
                <header>
                  <span>{dateLabel(day, 'EEE')}</span>
                  <strong>{dateLabel(day, 'd')}</strong>
                  <small>
                    {clock(
                      list.reduce((n, e) => n + sliceEntry(e, day, day, s.workspace.timezone), 0),
                      false,
                    )}
                  </small>
                </header>
                {list
                  .filter((e) => sliceEntry(e, day, day, s.workspace.timezone) > 0)
                  .map((e) => (
                    <button
                      className="week-entry"
                      style={{ borderLeftColor: s.projects.find((p) => p.id === e.project_id)?.color }}
                      key={e.id}
                      onClick={() => open('entry', e as unknown as Payload)}
                    >
                      <ProjectLabel s={s} id={e.project_id} />
                      {e.description && <strong className="week-description">{e.description}</strong>}
                      <small>{clock(sliceEntry(e, day, day, s.workspace.timezone), false)}</small>
                    </button>
                  ))}
                <button
                  className="week-add"
                  aria-label={'Añadir tiempo el ' + day}
                  onClick={() => open('entry', { day })}
                >
                  <Plus size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : list.length ? (
          <div className="entry-groups">
            {[...days].reverse().map((day) => {
              const entries = list.filter((e) => sliceEntry(e, day, day, s.workspace.timezone) > 0);
              if (!entries.length) return null;
              return (
                <div className="entry-group" key={day}>
                  <div className="day-heading">
                    <span>
                      {day === today ? 'Hoy' : dateLabel(day, 'EEEE')}{' '}
                      <small>{dateLabel(day, 'd MMM')}</small>
                    </span>
                    <span>
                      {clock(entries.reduce((n, e) => n + sliceEntry(e, day, day, s.workspace.timezone), 0))}
                    </span>
                  </div>
                  {entries.map((e) => (
                    <EntryRow key={e.id} e={e} day={day} s={s} open={open} />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Una semana por escribir"
            description="Añade el tiempo que ya trabajaste y mantenlo organizado."
            action={
              <button className="button" onClick={() => open('entry')}>
                <Plus size={16} />
                Añadir tiempo
              </button>
            }
          />
        )}
        <div className="timesheet-footer">
          <span>
            <ShieldCheck size={17} />
            {approval ? <Badge status={approval.status} /> : <>Tus horas están listas cuando tú lo estés.</>}
          </span>
          <button
            className="text-button"
            disabled={!!approval && approval.status !== 'returned'}
            onClick={() => run('approval', { week, status: 'submitted' }, 'Semana enviada para revisión')}
          >
            Enviar semana a revisión <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </>
  );
}

function EntryRow({ e, day, s, open }: {
  e: Entry;
  day: string;
  s: Snapshot;
  open: Shared['open'];
}) {
  const [menu, setMenu] = useState(false),
    project = s.projects.find((p) => p.id === e.project_id);
  return (
    <div className="entry-row">
      <span className="entry-color" style={{ background: project?.color ?? '#b7b3bf' }} />
      <div className="entry-description">
        <div className="entry-sub project-first">
          <ProjectLabel s={s} id={e.project_id} />
        </div>
        <button className="entry-title secondary-description" onClick={() => open('entry', e as unknown as Payload)}>
          {e.description || 'Sin descripción'}
        </button>
      </div>
      <div className="entry-tags">
        {e.tag_ids.slice(0, 1).map((id) => (
          <span key={id}>{s.tags.find((t) => t.id === id)?.name}</span>
        ))}
      </div>
      <DollarSign size={16} className={e.billable ? 'billable-icon' : 'non-billable-icon'} />
      <strong className="entry-duration">{clock(sliceEntry(e, day, day, s.workspace.timezone))}</strong>
      <div className="row-menu-wrap">
        <button
          className="icon-button"
          aria-label={'Opciones de ' + (e.description || 'registro')}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Ellipsis size={20} />
        </button>
        {menu && (
          <>
            <button className="menu-dismiss" aria-label="Cerrar opciones" onClick={() => setMenu(false)} />
            <div className="row-menu">
              <button
                onClick={() => {
                  open('entry', e as unknown as Payload);
                  setMenu(false);
                }}
              >
                <Pencil size={15} />
                Editar
              </button>
              <button
                onClick={() => {
                  open('entry', { ...e, id: undefined });
                  setMenu(false);
                }}
              >
                <Copy size={15} />
                Duplicar
              </button>
              <button
                className="danger"
                onClick={() => {
                  open('delete_entry', { id: e.id, name: e.description });
                  setMenu(false);
                }}
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectsPage({ s, now, open, run }: Shared) {
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState<'active' | 'completed' | 'archived'>('active'),
    [memberFilter, setMemberFilter] = useState<string[]>([]),
    [memberMenu, setMemberMenu] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const projects = s.projects.filter((p) => {
    const matches = category === 'archived' ? p.archived : !p.archived && (category === 'completed' ? p.status === 'completed' : p.status !== 'completed');
    const matchesMember = !memberFilter.length || memberFilter.some((id) => p.member_ids.includes(id));
    return matches && matchesMember && p.name.toLowerCase().includes(search.toLowerCase());
  });
  const categoryCount = (target: 'active' | 'completed' | 'archived') =>
    s.projects.filter((p) => {
      const matches = target === 'archived' ? p.archived : !p.archived && (target === 'completed' ? p.status === 'completed' : p.status !== 'completed');
      return matches && (!memberFilter.length || memberFilter.some((id) => p.member_ids.includes(id)));
    }).length;
  const p = s.projects.find((p) => p.id === selected);
  if (p)
    {
    const projectClient = s.clients.find((c) => c.id === p.client_id);
    const projectTasks = s.tasks.filter((t) => t.project_id === p.id);
    const completedTasks = projectTasks.filter((t) => t.status === 'completed').length;
    const completion = projectTasks.length ? Math.round((completedTasks / projectTasks.length) * 100) : (p.status === 'completed' ? 100 : 0);
    return (
      <>
        <button className="text-button back-link" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} />
          Todos los proyectos
        </button>
        <Heading
          title={p.name}
          description={projectClient?.name ?? 'Proyecto interno'}
        >
          {s.me.role === 'admin' && (
            <>
              <button className="button" onClick={() => open('project', p as unknown as Payload)}>
                <Pencil size={16} />
                Editar proyecto
              </button>
              <button className="button primary" onClick={() => open('task', { project_id: p.id })}>
                <Plus size={16} />
                Nueva tarea
              </button>
            </>
          )}
        </Heading>
        {projectClient && <div className="project-detail-client"><ClientMark client={projectClient} size="small" /><span>{projectClient.name}</span></div>}
        <div className="project-summary-grid">
          <div><span>Estado</span>{(s.me.role === 'admin' || (s.workspace.project_status_policy === 'all' && p.member_ids.includes(s.me.id))) ? <select className="inline-status-select" aria-label="Cambiar estado del proyecto" value={p.status ?? 'pending'} onChange={(e) => run('project', { id: p.id, status: e.target.value }, 'Estado del proyecto actualizado')}><option value="pending">Pendiente</option><option value="in_progress">En curso</option><option value="completed">Finalizado</option></select> : <Badge status={p.status ?? 'pending'} />}</div>
          <div><span>Progreso de tareas</span><strong>{completion}%</strong></div>
          <div><span>Responsables</span><strong>{p.member_ids.length}</strong></div>
          <div><span>Pendientes</span><strong>{projectTasks.length - completedTasks}</strong></div>
        </div>
        <div className="panel">
          <h2>Tareas del proyecto</h2>
          {s.tasks
            .filter((t) => t.project_id === p.id)
            .map((t) => (
              <div className={'table-row task-row ' + (t.status === 'completed' ? 'is-complete' : '')} key={t.id}>
                <div>
                  <div className="task-title-line"><strong>{t.name}</strong><Badge status={t.status ?? 'pending'} /></div>
                  <small>
                    {t.archived
                      ? 'Archivada'
                      : `${hours(s.entries.filter((e) => e.task_id === t.id).reduce((n, e) => n + duration(e, now), 0))} de ${t.estimate} h estimadas`}
                  </small>
                  <div className="task-assignees">
                    {(t.assignee_ids ?? []).map((id) => s.members.find((m) => m.id === id)).filter(Boolean).map((m) => <span key={m!.id}><Avatar name={m!.name} small />{m!.name}</span>)}
                    {!t.assignee_ids?.length && <span className="muted">Sin responsable</span>}
                  </div>
                </div>
                <div className="row-actions">
                  {(s.me.role === 'admin' || t.assignee_ids?.includes(s.me.id)) && (
                    <button className="button subtle" onClick={() => run('task_status', { id: t.id, status: t.status === 'completed' ? 'in_progress' : 'completed' }, t.status === 'completed' ? 'Tarea reabierta' : 'Tarea finalizada')}>
                      {t.status === 'completed' ? <RotateCcw size={15} /> : <Check size={15} />}
                      {t.status === 'completed' ? 'Reabrir' : 'Finalizar'}
                    </button>
                  )}
                  {s.me.role === 'admin' && (<>
                    <button
                      className="icon-button"
                      aria-label={'Editar ' + t.name}
                      onClick={() => open('task', t as unknown as Payload)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t.archived ? 'Restaurar tarea' : 'Archivar tarea'}
                      onClick={() => run('task', { id: t.id, archived: !t.archived })}
                    >
                      {t.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                    </button>
                  </>)}
                </div>
              </div>
            ))}
          {!s.tasks.some((t) => t.project_id === p.id) && (
            <Empty
              title="Divide el trabajo en pasos"
              description="Añade tareas para comparar el tiempo real con tus estimaciones."
            />
          )}
        </div>
      </>
    );
    }
  return (
    <>
      <Heading
        eyebrow="DEL PLAN A LA REALIDAD"
        title="Proyectos que avanzan."
        description="Cada proyecto, sus horas y una visión más clara."
      >
        {s.me.role === 'admin' && (
          <button className="button primary" onClick={() => open('project')}>
            <Plus size={17} />
            Nuevo proyecto
          </button>
        )}
      </Heading>
      <div className="section-toolbar project-toolbar">
        <div className="view-tabs">
          <button className={category === 'active' ? 'active' : ''} onClick={() => setCategory('active')}>
            Activos <span>{categoryCount('active')}</span>
          </button>
          <button className={category === 'completed' ? 'active' : ''} onClick={() => setCategory('completed')}>
            Finalizados <span>{categoryCount('completed')}</span>
          </button>
          <button className={category === 'archived' ? 'active' : ''} onClick={() => setCategory('archived')}>
            Archivados <span>{categoryCount('archived')}</span>
          </button>
        </div>
        <div className="project-filters">
          <div className="member-filter-wrap">
            <button className={'button subtle member-filter-button ' + (memberFilter.length ? 'selected' : '')} onClick={() => setMemberMenu(!memberMenu)} aria-expanded={memberMenu}>
              <Users size={16} />
              {memberFilter.length ? `${memberFilter.length} miembro${memberFilter.length === 1 ? '' : 's'}` : 'Filtrar miembros'}
              <ChevronDown size={14} />
            </button>
            {memberMenu && <>
              <button className="menu-dismiss" aria-label="Cerrar filtro de miembros" onClick={() => setMemberMenu(false)} />
              <div className="member-filter-menu">
                <strong>Mostrar proyectos de</strong>
                {s.members.filter((m) => m.active).map((m) => <label key={m.id}><input type="checkbox" checked={memberFilter.includes(m.id)} onChange={(e) => setMemberFilter(e.target.checked ? [...memberFilter, m.id] : memberFilter.filter((id) => id !== m.id))} />{m.name}</label>)}
                {memberFilter.length > 0 && <button className="text-button" onClick={() => setMemberFilter([])}>Limpiar filtro</button>}
              </div>
            </>}
          </div>
          <div className="search-field">
            <Search size={17} />
            <input placeholder="Buscar proyecto" aria-label="Buscar proyecto" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="project-grid">
        {projects.map((p) => {
          const seconds = s.entries
              .filter((e) => e.project_id === p.id)
              .reduce((n, e) => n + duration(e, now), 0),
            timePercent = p.estimate ? (seconds / 3600 / p.estimate) * 100 : 0,
            tasks = s.tasks.filter((t) => t.project_id === p.id && !t.archived),
            completed = tasks.filter((t) => t.status === 'completed').length,
            percent = tasks.length ? (completed / tasks.length) * 100 : (p.status === 'completed' ? 100 : 0);
          return (
            <article className="project-card" key={p.id}>
              <div className="project-card-top">
                <span className="project-folder" style={{ color: p.color, background: p.color + '14' }}>
                  <FolderClosed size={24} />
                </span>
                <Badge status={p.archived ? 'archived' : (p.status ?? 'pending')} />
              </div>
              <button className="project-card-title" onClick={() => setSelected(p.id)}>
                {p.name}
                <ArrowUpRight size={17} />
              </button>
              {(() => { const client = s.clients.find((c) => c.id === p.client_id); return client ? <div className="project-client"><ClientMark client={client} size="tiny" /><span>{client.name}</span></div> : <p>Proyecto interno</p>; })()}
              <div className="project-progress-label">
                <strong>{tasks.length ? `${completed} de ${tasks.length} tareas` : 'Sin tareas'}</strong>
                <span>{Math.round(percent)}% completado</span>
              </div>
              <div className="progress-track">
                <span style={{ width: Math.min(100, percent) + '%', background: p.color }} />
              </div>
              <small className={timePercent > 100 ? 'danger' : ''}>
                {hours(seconds)} registradas{p.estimate ? ` · ${Math.round(timePercent)}% de ${p.estimate} h` : ''}
              </small>
              <div className="project-card-bottom">
                <div className="avatar-stack">
                  {s.members
                    .filter((m) => p.member_ids.includes(m.id))
                    .slice(0, 3)
                    .map((m) => (
                      <Avatar name={m.name} small key={m.id} />
                    ))}
                </div>
                {s.me.role === 'admin' && (
                  <div>
                    <button
                      className="icon-button"
                      aria-label={'Editar ' + p.name}
                      onClick={() => open('project', p as unknown as Payload)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={p.archived ? 'Restaurar ' + p.name : 'Archivar ' + p.name}
                      onClick={() => run('project', { id: p.id, archived: !p.archived })}
                    >
                      {p.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!projects.length && (
        <Empty
          title="Espacio para tu próximo proyecto"
          description="Organiza el trabajo del equipo y comienza a registrar sus horas."
        />
      )}
    </>
  );
}

function ClientsPage({ s, open, run }: Omit<Shared, 'now'>) {
  const [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false);
  if (s.me.role !== 'admin')
    return <Empty title="Acceso reservado" description="Solo los administradores gestionan los clientes." />;
  const clients = s.clients.filter(
    (c) => c.archived === archived && c.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="BUENAS RELACIONES, BUEN TRABAJO"
        title="Tus clientes."
        description="El trabajo empieza con una buena conexión."
      >
        <button className="button primary" onClick={() => open('client')}>
          <Plus size={17} />
          Nuevo cliente
        </button>
      </Heading>
      <div className="panel">
        <div className="section-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar cliente"
              placeholder="Buscar cliente"
            />
          </div>
          <label className="check-label">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Ver archivados
          </label>
        </div>
        {clients.map((c) => (
          <div className="table-row" key={c.id}>
            <div className="person-cell">
              <ClientMark client={c} size="medium" />
              <div>
                <strong>{c.name}</strong>
                <small>{c.email || 'Sin correo de contacto'}</small>
              </div>
            </div>
            <span className="muted">
              {s.projects.filter((p) => p.client_id === c.id && !p.archived).length} proyectos activos
            </span>
            <div className="row-actions">
              <button
                className="icon-button"
                aria-label={'Editar ' + c.name}
                onClick={() => open('client', c as unknown as Payload)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={(c.archived ? 'Restaurar ' : 'Archivar ') + c.name}
                onClick={() => run('client', { id: c.id, archived: !c.archived })}
              >
                {c.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
              </button>
            </div>
          </div>
        ))}
        {!clients.length && (
          <Empty
            title="Conoce a tu próximo cliente"
            description="Añade clientes para organizar proyectos e informes."
          />
        )}
      </div>
    </>
  );
}

function ReportsPage({ s, now }: Pick<Shared, 's' | 'now'>) {
  const today = dayKey(new Date(now), s.workspace.timezone);
  const [from, setFrom] = useState(weekKey(today)),
    [to, setTo] = useState(shiftDay(weekKey(today), 6)),
    [project, setProject] = useState(''),
    [client, setClient] = useState(''),
    [person, setPerson] = useState(''),
    [tag, setTag] = useState(''),
    [billable, setBillable] = useState(''),
    [view, setView] = useState('summary');
  const admin = s.me.role === 'admin';
  const rows: ReportRow[] = s.entries
    .filter(
      (e) =>
        e.end_at &&
        (!project || e.project_id === project) &&
        (!client || s.projects.find((p) => p.id === e.project_id)?.client_id === client) &&
        (!person || e.user_id === person) &&
        (!tag || e.tag_ids.includes(tag)) &&
        (!billable || e.billable === (billable === 'yes')),
    )
    .map((entry) => ({ entry, seconds: sliceEntry(entry, from, to, s.workspace.timezone, now) }))
    .filter((r) => r.seconds > 0);
  const seconds = rows.reduce((n, r) => n + r.seconds, 0),
    billed = rows.filter((r) => r.entry.billable).reduce((n, r) => n + r.seconds, 0);
  const sums: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.entry.billable) {
      const c = r.entry.currency ?? s.workspace.currency;
      sums[c] = (sums[c] ?? 0) + (r.seconds / 3600) * (r.entry.rate ?? 0);
    }
  });
  const grouped = [
    ...s.projects.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    { id: null, name: 'Sin proyecto', color: '#b7b3bf' },
  ]
    .map((p) => ({
      ...p,
      seconds: rows.filter((r) => r.entry.project_id === p.id).reduce((n, r) => n + r.seconds, 0),
    }))
    .filter((p) => p.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 366; d = shiftDay(d, 1)) days.push(d);
  const bars = days.map((d) => ({
    day: d,
    seconds: rows.reduce((n, r) => n + sliceEntry(r.entry, d, d, s.workspace.timezone, now), 0),
  }));
  const max = Math.max(...bars.map((b) => b.seconds), 1);
  return (
    <>
      <Heading
        eyebrow="EL VALOR DE TU TIEMPO"
        title="Menos dudas. Más claridad."
        description="Entiende dónde va el tiempo y convierte las horas en decisiones."
      >
        <button
          className="button"
          disabled={!rows.length}
          onClick={() => exportCSV(s, rows, from + '_' + to)}
        >
          <Download size={16} />
          CSV
        </button>
        <button
          className="button primary"
          disabled={!rows.length}
          onClick={() => exportPDF(s, rows, from + '_' + to)}
        >
          <Download size={16} />
          Exportar PDF
        </button>
      </Heading>
      <div className="report-filters panel">
        <Field label="Desde">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              if (e.target.value) setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              if (e.target.value) setTo(e.target.value);
            }}
          />
        </Field>
        <Field label="Cliente">
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Todos los clientes</option>
            {s.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proyecto">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {admin && (
          <Field label="Persona">
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Todo el equipo</option>
              {s.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Etiqueta">
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Todas</option>
            {s.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Facturación">
          <select value={billable} onChange={(e) => setBillable(e.target.value)}>
            <option value="">Todo el tiempo</option>
            <option value="yes">Facturable</option>
            <option value="no">No facturable</option>
          </select>
        </Field>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <span>
            Tiempo total <Clock3 size={17} />
          </span>
          <strong>{hours(seconds)}</strong>
          <small>{rows.length} registros en este período</small>
        </div>
        <div className="stat">
          <span>
            Horas facturables <DollarSign size={17} />
          </span>
          <strong>{hours(billed)}</strong>
          <small>{seconds ? Math.round((billed / seconds) * 100) : 0}% del total</small>
        </div>
        <div className="stat">
          <span>
            {admin ? 'Importe facturable' : 'Proyectos'} <BarChart3 size={17} />
          </span>
          <strong className="money-total">
            {admin
              ? Object.entries(sums)
                  .map(([c, n]) => money(n, c))
                  .join(' / ') || money(0, s.workspace.currency)
              : grouped.length}
          </strong>
          <small>{admin ? 'Según las tarifas de cada registro' : 'Con actividad registrada'}</small>
        </div>
      </div>
      <div className="view-tabs report-tabs">
        {[
          ['summary', 'Resumen'],
          ['detail', 'Detalle'],
          ['weekly', 'Distribución diaria'],
        ].map(([v, l]) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
      </div>
      {view === 'detail' ? (
        <div className="panel report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Actividad</th>
                <th>Persona</th>
                <th>Proyecto</th>
                <th>Tiempo</th>
                {admin && <th>Importe</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry: e, seconds }) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.description || 'Sin descripción'}</strong>
                    <small>{dateLabel(dayKey(e.start_at, s.workspace.timezone), 'd MMM yyyy')}</small>
                  </td>
                  <td>{s.members.find((m) => m.id === e.user_id)?.name}</td>
                  <td>
                    <ProjectLabel s={s} id={e.project_id} showClient={false} />
                  </td>
                  <td>{clock(seconds)}</td>
                  {admin && (
                    <td>
                      {money(
                        e.billable ? (seconds / 3600) * (e.rate ?? 0) : 0,
                        e.currency ?? s.workspace.currency,
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty
              title="No hay registros en este período"
              description="Prueba con otras fechas o filtros."
            />
          )}
        </div>
      ) : (
        <div className={'report-panels ' + (view === 'weekly' ? 'one' : '')}>
          <section className="panel chart-panel">
            <div className="panel-title">
              <h2>Así se distribuye tu tiempo</h2>
              <span className="muted">Horas por día</span>
            </div>
            {bars.length <= 31 ? (
              <div
                className="bar-chart"
                role="img"
                aria-label={
                  'Tiempo por día: ' + bars.map((b) => dateLabel(b.day) + ': ' + hours(b.seconds)).join(', ')
                }
              >
                {bars.map((b) => (
                  <div className="bar-column" key={b.day} title={dateLabel(b.day) + ': ' + hours(b.seconds)}>
                    <span className="bar-value">{b.seconds ? clock(b.seconds, false) : ''}</span>
                    <div className="bar-rail">
                      <div style={{ height: (b.seconds / max) * 100 + '%' }} />
                    </div>
                    <small>{dateLabel(b.day, bars.length > 7 ? 'd' : 'EEE')}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="chart-message">
                Selecciona un período de hasta 31 días para ver el gráfico diario. El resumen y las
                exportaciones incluyen todo el período.
              </p>
            )}
          </section>
          {view === 'summary' && (
            <section className="panel breakdown">
              <h2>Por proyecto</h2>
              {grouped.map((p) => (
                <div className="breakdown-row" key={p.id ?? 'none'}>
                  <div>
                    <span className="project-dot" style={{ background: p.color }} />
                    <strong>{p.name}</strong>
                    <span>{clock(p.seconds, false)}</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ background: p.color, width: (p.seconds / seconds) * 100 + '%' }} />
                  </div>
                  <small>{Math.round((p.seconds / seconds) * 100)}% del total</small>
                </div>
              ))}
              {!grouped.length && <p className="muted">Los proyectos aparecerán cuando registres tiempo.</p>}
            </section>
          )}
        </div>
      )}
      <p className="report-note">
        <CheckCircle2 size={14} />
        Las exportaciones respetan los filtros. Los registros abiertos se incluyen al cerrarlos.
      </p>
    </>
  );
}

function ApprovalsPage({ s, now, open, run }: Shared) {
  const [status, setStatus] = useState('all'),
    [week, setWeek] = useState(weekKey(dayKey(new Date(now), s.workspace.timezone)));
  const approvals = s.approvals.filter((a) => status === 'all' || a.status === status);
  return (
    <>
      <Heading
        eyebrow="TRABAJO REVISADO, EQUIPO ALINEADO"
        title="Todo en orden."
        description="Revisa las horas, resuelve dudas y cierra la semana con confianza."
      />
      <div className="approval-submit panel">
        <div>
          <h3>Enviar mis horas</h3>
          <p>Las horas enviadas quedarán bloqueadas hasta la revisión.</p>
        </div>
        <input
          aria-label="Semana a enviar"
          type="date"
          value={week}
          onChange={(e) => {
            if (e.target.value) setWeek(weekKey(e.target.value));
          }}
        />
        <button
          className="button primary"
          onClick={() => run('approval', { week, status: 'submitted' }, 'Semana enviada')}
        >
          Enviar semana <ArrowRight size={16} />
        </button>
      </div>
      <div className="view-tabs report-tabs">
        {[
          ['all', 'Todas'],
          ['submitted', 'En revisión'],
          ['approved', 'Aprobadas'],
          ['returned', 'Devueltas'],
        ].map(([v, l]) => (
          <button key={v} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>
            {l}
            {v === 'submitted' && <span>{s.approvals.filter((a) => a.status === v).length}</span>}
          </button>
        ))}
      </div>
      <div className="panel">
        {approvals.map((a) => {
          const entries = s.entries.filter(
            (e) =>
              e.user_id === a.user_id &&
              sliceEntry(e, a.week, shiftDay(a.week, 6), s.workspace.timezone, now) > 0,
          );
          const total = entries.reduce(
            (n, e) => n + sliceEntry(e, a.week, shiftDay(a.week, 6), s.workspace.timezone, now),
            0,
          );
          return (
            <div className="approval-row" key={a.id}>
              <div className="person-cell">
                <Avatar name={s.members.find((m) => m.id === a.user_id)?.name ?? 'Miembro'} />
                <div>
                  <strong>{s.members.find((m) => m.id === a.user_id)?.name ?? 'Miembro'}</strong>
                  <small>
                    {dateLabel(a.week)} – {dateLabel(shiftDay(a.week, 6), 'd MMM yyyy')}
                  </small>
                  {a.comment && <p className="approval-comment">{a.comment}</p>}
                </div>
              </div>
              <strong>{clock(total, false)}</strong>
              <Badge status={a.status} />
              <div className="row-actions">
                <button className="button subtle" onClick={() => open('review', { ...a })}>
                  Ver horas
                </button>
                {s.me.role === 'admin' && a.status === 'submitted' && (
                  <>
                    <button
                      className="button primary"
                      onClick={() =>
                        run(
                          'approval',
                          { user_id: a.user_id, week: a.week, status: 'approved' },
                          'Semana aprobada',
                        )
                      }
                    >
                      <Check size={16} />
                      Aprobar
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Devolver semana"
                      onClick={() => open('return', a as unknown as Payload)}
                    >
                      <RotateCcw size={17} />
                    </button>
                  </>
                )}
                {s.me.role === 'admin' && a.status === 'approved' && (
                  <button className="text-button" onClick={() => open('return', a as unknown as Payload)}>
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!approvals.length && (
          <Empty title="Todo al día" description="Las semanas enviadas aparecerán aquí para su revisión." />
        )}
      </div>
      {s.me.role === 'admin' && (
        <details className="audit-details">
          <summary>Historial de actividad</summary>
          {s.audit.slice(0, 25).map((a) => (
            <div key={a.id}>
              <span>{formatInTimeZone(a.created_at, s.workspace.timezone, 'dd/MM HH:mm')}</span>
              <strong>{s.members.find((m) => m.id === a.actor_id)?.name ?? 'Administrador'}</strong>
              <span>{a.action}</span>
              <span>{a.detail}</span>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

function TeamPage({ s, open, run, reload, demo }: Omit<Shared, 'now'> & { reload: () => Promise<void>; demo: boolean }) {
  const [invitationError, setInvitationError] = useState('');
  if (s.me.role !== 'admin')
    return <Empty title="Acceso reservado" description="Solo los administradores gestionan el equipo." />;
  const invitations = [...s.invitations].sort(
    (a, b) => Date.parse(b.created_at ?? b.expires_at) - Date.parse(a.created_at ?? a.expires_at),
  );
  const invitationAction = async (action: 'resend' | 'cancel', id: string) => {
    try {
      setInvitationError('');
      await manageInvitation(demo, action, id);
      await reload();
    } catch (error) {
      setInvitationError(errorText(error));
    }
  };
  return (
    <>
      <Heading
        eyebrow="MEJOR, JUNTOS"
        title="Las personas detrás del trabajo."
        description="Un equipo conectado, con el acceso que cada persona necesita."
      >
        <button className="button primary" onClick={() => open('invite')}>
          <Plus size={17} />
          Invitar persona
        </button>
      </Heading>
      <div className="panel">
        <div className="panel-title">
          <h2>Miembros del equipo</h2>
          <span className="badge">{s.members.filter((m) => m.active).length} activos</span>
        </div>
        {s.members.map((m) => (
          <div className="table-row" key={m.id}>
            <div className="person-cell">
              <Avatar name={m.name} />
              <div>
                <strong>
                  {m.name} {m.id === s.me.id && <span className="you">Tú</span>}
                </strong>
                <small>{m.email}</small>
              </div>
            </div>
            {s.entries.some((e) => e.user_id === m.id && !e.end_at) && (
              <button
                className="button subtle"
                onClick={() =>
                  run(
                    'stop',
                    { id: s.entries.find((e) => e.user_id === m.id && !e.end_at)!.id },
                    'Registro cerrado',
                  )
                }
              >
                <Square size={13} />
                Detener tiempo
              </button>
            )}
            <span className="role-label">
              {m.role === 'admin' ? <ShieldCheck size={16} /> : <Users size={16} />}{' '}
              {m.role === 'admin' ? 'Administrador' : 'Miembro'}
            </span>
            <Badge status={m.active ? 'active' : 'Acceso revocado'} />
            <div className="row-actions">
              {m.id !== s.me.id && (
                <>
                  <button
                    className="button subtle"
                    onClick={() => run('member', { id: m.id, role: m.role === 'admin' ? 'member' : 'admin' })}
                  >
                    {m.role === 'admin' ? 'Hacer miembro' : 'Hacer admin'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => open('member_access', { id: m.id, name: m.name, active: !m.active })}
                  >
                    {m.active ? 'Revocar acceso' : 'Restaurar'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Invitaciones</h2>
            <p>Solo los administradores pueden invitar personas al equipo.</p>
          </div>
          <span className="badge">{invitations.filter((invite) => invite.status === 'pending' && Date.parse(invite.expires_at) > Date.now()).length} pendientes</span>
        </div>
        {demo && (
          <div className="invitation-demo-note" role="status">
            Estás en la demostración: se crean enlaces locales, pero no se envían correos.
          </div>
        )}
        {invitationError && <div className="form-error" role="alert"><AlertCircle size={16} />{invitationError}</div>}
        {invitations.length ? invitations.map((invite) => {
          const expired = !invite.accepted && (invite.status === 'expired' || Date.parse(invite.expires_at) <= Date.now());
          const status = invite.accepted ? 'accepted' : expired ? 'expired' : invite.status || 'pending';
          return <div className="table-row invitation-row" key={invite.id}>
            <div className="person-cell">
              <span className="avatar"><Mail size={16} /></span>
              <div><strong>{invite.email}</strong><small>{invite.role === 'admin' ? 'Administrador' : 'Miembro'} · {status === 'accepted' ? 'aceptó la invitación' : `vence ${dateLabel(invite.expires_at.slice(0, 10))}`}{invite.send_count ? ` · ${invite.send_count} envío${invite.send_count === 1 ? '' : 's'}` : ''}</small></div>
            </div>
            <Badge status={status} />
            <div className="row-actions">
              {['pending', 'expired'].includes(status) && <>
                <button className="button subtle" onClick={() => void invitationAction('resend', invite.id)}><RotateCcw size={14} />Reenviar</button>
                <button className="text-button" onClick={() => void invitationAction('cancel', invite.id)}>Cancelar</button>
              </>}
            </div>
          </div>;
        }) : <Empty title="Sin invitaciones todavía" description="Las invitaciones enviadas y aceptadas aparecerán aquí." />}
      </div>
      <div className="info-card">
        <ShieldCheck size={23} />
        <div>
          <h3>El acceso es personal</h3>
          <p>
            Los miembros registran sus horas y trabajan en los proyectos asignados. Los administradores
            gestionan el equipo, aprueban horas y consultan los importes.
          </p>
        </div>
      </div>
    </>
  );
}

function SettingsPage({
  s,
  busy,
  demo,
  open,
  act,
}: {
  s: Snapshot;
  busy: boolean;
  demo: boolean;
  open: Shared['open'];
  act: (a: string, p: Payload, message?: string) => Promise<Payload | undefined>;
}) {
  const [name, setName] = useState(s.workspace.name),
    [currency, setCurrency] = useState(s.workspace.currency),
    [zone, setZone] = useState(s.workspace.timezone),
    [projectStatusPolicy, setProjectStatusPolicy] = useState(s.workspace.project_status_policy ?? 'all');
  return (
    <>
      <Heading
        eyebrow="A TU MANERA"
        title="Un espacio que encaja contigo."
        description="Los detalles que hacen que tu equipo trabaje mejor."
      />
      {s.me.role === 'admin' ? (
        <>
          <form
            className="panel settings-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void act('settings', { name, currency, timezone: zone, project_status_policy: projectStatusPolicy }).catch(() => {});
            }}
          >
            <h2>Espacio de trabajo</h2>
            <div className="form-grid">
              <Field label="Nombre del espacio">
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Moneda">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {['USD', 'EUR', 'MXN', 'COP', 'CRC', 'PAB'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Zona horaria"
                hint={
                  s.entries.length
                    ? 'Se conserva para mantener las semanas de aprobación.'
                    : 'Se aplicará a los registros y las semanas.'
                }
              >
                <select
                  disabled={s.entries.length > 0}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                >
                  {[
                    'America/Panama',
                    'America/Mexico_City',
                    'America/Bogota',
                    'America/Costa_Rica',
                    'America/New_York',
                    'Europe/Madrid',
                    'UTC',
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
              <Field label="Inicio de semana">
                <input value="Lunes" disabled />
              </Field>
              <Field label="Quién puede cambiar estados" hint="Define quién puede mover proyectos entre Pendiente, En curso y Finalizado.">
                <select value={projectStatusPolicy} onChange={(e) => setProjectStatusPolicy(e.target.value as 'all' | 'admins')}>
                  <option value="all">Todos los miembros</option>
                  <option value="admins">Solo administradores</option>
                </select>
              </Field>
            </div>
            <div className="form-footer">
              <span>Los importes históricos conservan su moneda.</span>
              <button className="button primary" disabled={busy}>
                Guardar ajustes
              </button>
            </div>
          </form>
          <section className="panel settings-panel">
            <div className="panel-title">
              <div>
                <h2>Tarifas por hora</h2>
                <p>Los cambios se aplican a registros nuevos.</p>
              </div>
              <button className="button" onClick={() => open('rate')}>
                <Plus size={16} />
                Configurar tarifa
              </button>
            </div>
            {s.rates.map((r) => (
              <div className="table-row" key={r.id}>
                <div>
                  <strong>
                    {r.project_id
                      ? s.projects.find((p) => p.id === r.project_id)?.name
                      : 'Todos los proyectos'}
                  </strong>
                  <small>
                    {r.user_id ? s.members.find((m) => m.id === r.user_id)?.name : 'Todo el equipo'}
                  </small>
                </div>
                <strong>{money(r.amount, s.workspace.currency)} / h</strong>
                <button
                  className="icon-button"
                  aria-label="Editar tarifa"
                  onClick={() => open('rate', r as unknown as Payload)}
                >
                  <Pencil size={16} />
                </button>
              </div>
            ))}
            {!s.rates.length && (
              <p className="muted">Añade una tarifa general para empezar a calcular importes.</p>
            )}
            <p className="report-note">
              Prioridad: persona en proyecto → proyecto → persona → tarifa general.
            </p>
          </section>
          <section className="panel settings-panel">
            <div className="panel-title">
              <h2>Etiquetas</h2>
              <button className="button" onClick={() => open('tag')}>
                <Plus size={16} />
                Nueva etiqueta
              </button>
            </div>
            <div className="tags-list">
              {s.tags.map((t) => (
                <span key={t.id}>
                  <TagIcon size={14} />
                  {t.name}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="panel">
          <h2>{s.workspace.name}</h2>
          <p>
            {s.workspace.timezone} · {s.workspace.currency} · Semana de lunes a domingo
          </p>
        </div>
      )}
      {demo && (
        <div className="info-card">
          <RotateCcw size={23} />
          <div>
            <h3>Un espacio para explorar</h3>
            <p>Los datos de esta demostración viven solo en tu navegador y están separados de tu equipo.</p>
            <button className="text-button" onClick={() => open('reset_demo')}>
              Restablecer datos de ejemplo
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Editor({
  dialog,
  s,
  busy,
  error,
  close,
  act,
  demo,
  reload,
}: {
  dialog: { kind: string; value?: Payload };
  s: Snapshot;
  busy: boolean;
  error: string;
  close: () => void;
  act: (a: string, p: Payload, message?: string) => Promise<Payload | undefined>;
  demo: boolean;
  reload: () => Promise<void>;
}) {
  const k = dialog.kind,
    v = dialog.value ?? {},
    [values, setValues] = useState<Payload>(() => {
      const now = Date.now();
      return {
        name: '',
        email: '',
        color: colors[0],
        estimate: 0,
        member_ids: [s.me.id],
        assignee_ids: [],
        status: 'pending',
        role: 'member',
        amount: 0,
        user_id: '',
        project_id: '',
        task_id: '',
        tag_ids: [],
        billable: true,
        description: '',
        work_date: v.day || (v.start_at ? dayKey(String(v.start_at), s.workspace.timezone) : dayKey(new Date(now), s.workspace.timezone)),
        duration_hours: v.start_at && v.end_at ? (Date.parse(String(v.end_at)) - Date.parse(String(v.start_at))) / 3600000 : 1,
        start_at: inputDate(new Date(now - 3600000).toISOString(), s.workspace.timezone),
        end_at: inputDate(new Date(now).toISOString(), s.workspace.timezone),
        ...v,
        ...(v.start_at
          ? {
              start_at: inputDate(String(v.start_at), s.workspace.timezone),
              end_at: inputDate(String(v.end_at || new Date().toISOString()), s.workspace.timezone),
            }
          : {}),
        ...(v.day ? { start_at: v.day + 'T09:00', end_at: v.day + 'T10:00' } : {}),
      };
    }),
    [link, setLink] = useState(''),
    [logoFile, setLogoFile] = useState<File | null>(null),
    [logoPreview, setLogoPreview] = useState(String(v.logo_url ?? '')),
    [removeLogo, setRemoveLogo] = useState(false),
    [logoError, setLogoError] = useState('');
  const set = (key: string, value: unknown) => setValues((p) => ({ ...p, [key]: value }));
  const titles: Record<string, string> = {
    entry: v.id ? 'Editar registro' : 'Añadir tiempo',
    project: v.id ? 'Editar proyecto' : 'Nuevo proyecto',
    client: v.id ? 'Editar cliente' : 'Nuevo cliente',
    task: v.id ? 'Editar tarea' : 'Nueva tarea',
    tag: 'Nueva etiqueta',
    rate: 'Configurar tarifa',
    invite: 'Invitar al equipo',
    return: v.status === 'approved' ? 'Reabrir semana' : 'Solicitar cambios',
    delete_entry: 'Eliminar registro',
    member_access: values.active ? 'Restaurar acceso' : 'Revocar acceso',
    review: 'Detalle de la semana',
    reset_demo: 'Restablecer demostración',
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (k === 'reset_demo') {
        resetDemo();
        await reload();
        close();
        return;
      }
      let action = k,
        payload = { ...values };
      if (k === 'entry') {
        action = 'save_entry';
        const workDate = String(values.work_date), totalHours = Number(values.duration_hours);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(totalHours) || totalHours <= 0 || totalHours > 24)
          throw Error('Indica un día válido y una duración entre 0 y 24 horas.');
        const targetUser = String(values.user_id || (v.user_id as string) || s.me.id);
        const slot = freeSlot(workDate, totalHours * 3600, s.entries.filter((entry) => entry.user_id === targetUser), s.workspace.timezone, String(values.id || ''));
        if (!slot) throw Error('No hay espacio libre suficiente ese día para esa duración.');
        payload.start_at = slot.start;
        payload.end_at = slot.end;
        payload.project_id = values.project_id || null;
        payload.task_id = values.task_id || null;
      }
      if (k === 'return') {
        action = 'approval';
        payload.status = 'returned';
      }
      if (k === 'member_access') action = 'member';
      const result = await act(action, payload, k === 'invite' ? 'Invitación creada' : 'Cambios guardados');
      if (k === 'client' && (logoFile || removeLogo)) {
        const clientId = String(result?.id || values.id || '');
        if (!clientId) throw Error('No se pudo identificar el cliente para guardar su logo.');
        const logoUrl = removeLogo ? null : await uploadClientLogo(demo, logoFile as File, s.workspace.id, clientId);
        await act('client', { id: clientId, logo_url: logoUrl }, 'Logo del cliente actualizado');
        if (v.logo_url && v.logo_url !== logoUrl) await removeClientLogo(demo, String(v.logo_url));
      }
      if (k === 'invite' && result?.token) {
        setLink(`${window.location.origin}/invite?token=${result.token}`);
        return;
      }
      close();
    } catch {
      /* Error displayed by parent */
    }
  };
  if (k === 'review') {
    const rows = s.entries.filter(
      (e) =>
        e.user_id === v.user_id &&
        sliceEntry(e, String(v.week), shiftDay(String(v.week), 6), s.workspace.timezone) > 0,
    );
    return (
      <Modal title={titles[k]} onClose={close} wide>
        <div className="review-content">
          {rows.map((e) => (
            <div className="table-row" key={e.id}>
              <div>
                <strong>{e.description || 'Sin descripción'}</strong>
                <small>
                  {dateLabel(dayKey(e.start_at, s.workspace.timezone), 'EEEE d MMM')} ·{' '}
                  <ProjectLabel s={s} id={e.project_id} />
                </small>
              </div>
              <strong>
                {clock(sliceEntry(e, String(v.week), shiftDay(String(v.week), 6), s.workspace.timezone))}
              </strong>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="button" onClick={close}>
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={titles[k] ?? 'Editar'} onClose={close}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {link ? (
            <div className="invite-result">
              <CheckCircle2 size={36} />
              <h3>Invitación lista</h3>
              <p>
                {demo
                  ? 'En la demostración el enlace es ilustrativo. No crea una cuenta real.'
                  : 'Enviamos una invitación por correo a ' +
                    values.email +
                    '. También puedes compartir este enlace como respaldo. Caduca en 7 días y solo funciona con ese correo.'}
              </p>
              <input aria-label="Enlace de invitación" value={link} readOnly />
              <button
                type="button"
                className="button"
                onClick={() => void navigator.clipboard.writeText(link)}
              >
                <Copy size={16} />
                Copiar enlace
              </button>
            </div>
          ) : (
            <>
              {['project', 'client', 'task', 'tag'].includes(k) && (
                <Field label="Nombre">
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={String(values.name)}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>
              )}
              {k === 'client' && (
                <Field label="Logo del cliente">
                  <div className="client-logo-editor">
                    <ClientMark client={{ id: String(values.id || 'preview'), name: String(values.name || 'Cliente'), email: String(values.email || ''), archived: false, logo_url: logoPreview || null }} size="large" />
                    <div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                            e.target.value = '';
                            setLogoError('El logo debe ser PNG, JPG o WebP.');
                            return;
                          }
                          if (file.size > 2 * 1024 * 1024) {
                            e.target.value = '';
                            setLogoError('El logo no puede superar 2 MB.');
                            return;
                          }
                          setLogoError('');
                          setLogoFile(file);
                          setRemoveLogo(false);
                          setLogoPreview(URL.createObjectURL(file));
                        }}
                      />
                      <small className="field-hint">PNG, JPG o WebP · máximo 2 MB · se muestra en formato cuadrado.</small>
                      {(logoPreview || logoFile) && <button type="button" className="text-button" onClick={() => { setLogoFile(null); setLogoPreview(''); setRemoveLogo(true); }}>Quitar logo</button>}
                      {logoError && <small className="field-error">{logoError}</small>}
                    </div>
                  </div>
                </Field>
              )}
              {k === 'entry' && (
                <Field label="Proyecto">
                  <select
                    autoFocus
                    required
                    value={String(values.project_id ?? '')}
                    onChange={(e) => {
                      set('project_id', e.target.value);
                      set('task_id', '');
                    }}
                  >
                    <option value="">Seleccionar proyecto</option>
                    {s.projects
                      .filter((p) => !p.archived || p.id === values.project_id)
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              )}
              {k === 'rate' && (
                <Field label="Proyecto">
                  <select
                    value={String(values.project_id ?? '')}
                    onChange={(e) => {
                      set('project_id', e.target.value);
                      set('task_id', '');
                    }}
                  >
                    <option value="">Todos los proyectos</option>
                    {s.projects
                      .filter((p) => !p.archived || p.id === values.project_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {k === 'entry' && (
                <>
                  <Field label="Tarea">
                    <select
                      value={String(values.task_id ?? '')}
                      onChange={(e) => set('task_id', e.target.value)}
                    >
                      <option value="">Sin tarea</option>
                      {s.tasks
                        .filter(
                          (t) =>
                            t.project_id === values.project_id &&
                            (!t.archived || t.id === values.task_id) &&
                            (s.me.role === 'admin' || t.assignee_ids?.includes(s.me.id)),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="form-grid">
                    <Field label="Día trabajado">
                      <input type="date" required value={String(values.work_date)} onChange={(e) => set('work_date', e.target.value)} />
                    </Field>
                    <Field label="Horas invertidas">
                      <input type="number" required min="0.25" max="24" step="0.25" value={Number(values.duration_hours)} onChange={(e) => set('duration_hours', Number(e.target.value))} />
                    </Field>
                  </div>
                  <p className="field-hint">Las horas se guardan por día. La app evita solapamientos automáticamente.</p>
                  <Field label="Descripción">
                    <input placeholder="¿En qué trabajaste? (opcional)" value={String(values.description)} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
                  </Field>
                  <div className="tag-options">
                    {s.tags.map((t) => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          checked={(values.tag_ids as string[]).includes(t.id)}
                          onChange={(e) =>
                            set(
                              'tag_ids',
                              e.target.checked
                                ? [...(values.tag_ids as string[]), t.id]
                                : (values.tag_ids as string[]).filter((id) => id !== t.id),
                            )
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={!!values.billable}
                      onChange={(e) => set('billable', e.target.checked)}
                    />
                    Tiempo facturable
                  </label>
                </>
              )}
              {k === 'project' && (
                <>
                  <Field label="Cliente">
                    <select
                      value={String(values.client_id ?? '')}
                      onChange={(e) => set('client_id', e.target.value || null)}
                    >
                      <option value="">Proyecto interno</option>
                      {s.clients
                        .filter((c) => !c.archived || c.id === values.client_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Color">
                    <div className="color-options">
                      {colors.map((c) => (
                        <button
                          type="button"
                          key={c}
                          aria-label={'Color ' + c}
                          aria-pressed={values.color === c}
                          style={{ background: c }}
                          onClick={() => set('color', c)}
                        >
                          {values.color === c && <Check size={18} />}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Miembros asignados">
                    <div className="member-options">
                      {s.members
                        .filter((m) => m.active)
                        .map((m) => (
                          <label key={m.id}>
                            <input
                              type="checkbox"
                              checked={(values.member_ids as string[]).includes(m.id)}
                              onChange={(e) =>
                                set(
                                  'member_ids',
                                  e.target.checked
                                    ? [...(values.member_ids as string[]), m.id]
                                    : (values.member_ids as string[]).filter((id) => id !== m.id),
                                )
                              }
                            />
                            {m.name}
                          </label>
                        ))}
                    </div>
                  </Field>
                </>
              )}
              {k === 'task' && (
                <Field label="Responsables de la tarea">
                  <div className="member-options">
                    {s.members
                      .filter((m) => m.active && (s.projects.find((p) => p.id === values.project_id)?.member_ids.includes(m.id) ?? true))
                      .map((m) => (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={(values.assignee_ids as string[]).includes(m.id)}
                            onChange={(e) => set('assignee_ids', e.target.checked ? [...(values.assignee_ids as string[]), m.id] : (values.assignee_ids as string[]).filter((id) => id !== m.id))}
                          />
                          {m.name}
                        </label>
                      ))}
                  </div>
                </Field>
              )}
              {['project', 'task'].includes(k) && (
                <Field label="Estado">
                  <select value={String(values.status ?? 'pending')} onChange={(e) => set('status', e.target.value)}>
                    <option value="pending">Pendiente</option>
                    <option value="in_progress">En curso</option>
                    <option value="completed">Finalizado</option>
                  </select>
                </Field>
              )}
              {['project', 'task'].includes(k) && (
                <Field label="Estimación de horas">
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={Number(values.estimate)}
                    onChange={(e) => set('estimate', Number(e.target.value))}
                  />
                </Field>
              )}
              {['client', 'invite'].includes(k) && (
                <Field label="Correo electrónico">
                  <input
                    type="email"
                    required={k === 'invite'}
                    value={String(values.email)}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </Field>
              )}
              {k === 'invite' && (
                <>
                  <Field label="Rol">
                    <select value={String(values.role)} onChange={(e) => set('role', e.target.value)}>
                      <option value="member">Miembro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </Field>
                  <p className="field-hint">
                    Se enviará un correo de invitación. El enlace manual quedará disponible como respaldo.
                  </p>
                </>
              )}
              {k === 'rate' && (
                <>
                  <Field label="Persona">
                    <select
                      value={String(values.user_id ?? '')}
                      onChange={(e) => set('user_id', e.target.value || null)}
                    >
                      <option value="">Todo el equipo</option>
                      {s.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={'Tarifa por hora (' + s.workspace.currency + ')'}>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                      value={Number(values.amount)}
                      onChange={(e) => set('amount', Number(e.target.value))}
                    />
                  </Field>
                  <p className="field-hint">
                    Solo se aplicará a registros nuevos. Las horas anteriores conservan su tarifa.
                  </p>
                </>
              )}
              {k === 'return' && (
                <Field label="Motivo">
                  <textarea
                    required
                    autoFocus
                    rows={4}
                    placeholder="Explica qué necesita revisarse…"
                    value={String(values.comment ?? '')}
                    onChange={(e) => set('comment', e.target.value)}
                  />
                </Field>
              )}
              {k === 'delete_entry' && (
                <p>
                  ¿Eliminar «{String(v.name || 'Sin descripción')}»? Esta acción elimina el registro y su
                  importe.
                </p>
              )}
              {k === 'member_access' && (
                <p>
                  {values.active ? 'Restaurar' : 'Revocar'} el acceso de {String(values.name)}. Su historial
                  se conservará.
                </p>
              )}
              {k === 'reset_demo' && (
                <p>
                  Se eliminarán los cambios de esta demostración y se restaurarán los ejemplos. Los datos
                  reales del equipo no se modificarán.
                </p>
              )}
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button" disabled={busy} onClick={close}>
            {link ? 'Cerrar' : 'Cancelar'}
          </button>
          {!link && (
            <button
              className={'button ' + (k === 'delete_entry' ? 'destructive' : 'primary')}
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={16} />
                  Guardando…
                </>
              ) : k === 'invite' ? (
                'Enviar invitación'
              ) : k === 'delete_entry' ? (
                'Eliminar registro'
              ) : (
                'Guardar'
              )}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function Auth({ recovery, onRecovered }: { recovery: boolean; onRecovered: () => void }) {
  const token = new URLSearchParams(window.location.search).get('token') ?? '',
    [mode, setMode] = useState(token ? 'signup' : 'login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (token) {
      sessionStorage.setItem('timetracker.invitation', token);
      supabase?.auth.getSession().then(({ data }) => {
        if (data.session) {
          setEmail(data.session.user.email ?? '');
          setMode('accept');
        }
      });
    }
  }, [token]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!supabase)
        throw Error(
          'El acceso del equipo está pendiente de conectar Supabase. Puedes explorar la demostración.',
        );
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
        return;
      }
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (error) throw error;
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: window.location.origin + '/invite?token=' + encodeURIComponent(token),
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage(
            'Revisa tu correo para confirmar la cuenta. Después vuelve a este enlace e inicia sesión.',
          );
          setMode('login');
          return;
        }
      } else if (mode !== 'accept') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const invite = token || sessionStorage.getItem('timetracker.invitation');
      if (invite) {
        await command(false, 'accept_invitation', { token: invite, name });
        sessionStorage.removeItem('timetracker.invitation');
      }
      navigate('/time');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div className="brand">
          <Timer size={29} />
          <span>
            Star5<span className="brand-light">Tracker</span>
            <i />
          </span>
        </div>
        <div>
          <span className="eyebrow">MENOS RUIDO. MÁS ENFOQUE.</span>
          <h1>
            Tu mejor trabajo
            <br />
            empieza con
            <br />
            <em>un momento.</em>
          </h1>
          <p>
            Un espacio para cuidar tu tiempo,
            <br />
            tus proyectos y a tu equipo.
          </p>
        </div>
        <span className="auth-footer">Cada minuto cuenta.</span>
      </div>
      <div className="auth-form-side">
        <form className="auth-form" onSubmit={submit}>
          <span className="auth-logo">
            <Timer size={29} />
          </span>
          <h2>
            {recovery
              ? 'Tu nueva contraseña'
              : mode === 'forgot'
                ? 'Recupera tu acceso'
                : mode === 'signup' || mode === 'accept'
                  ? 'Tu equipo te espera.'
                  : 'Qué bueno verte.'}
          </h2>
          <p>
            {recovery
              ? 'Elige una contraseña segura de al menos 8 caracteres.'
              : mode === 'signup'
                ? 'Crea tu cuenta con el correo de la invitación.'
                : 'Un nuevo día. Buen trabajo por delante.'}
          </p>
          {mode === 'signup' && (
            <Field label="Tu nombre">
              <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          {!recovery && (
            <Field label="Correo electrónico">
              <input
                readOnly={mode === 'accept'}
                required
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@equipo.com"
              />
            </Field>
          )}
          {((mode !== 'forgot' && mode !== 'accept') || recovery) && (
            <Field label="Contraseña">
              <input
                required
                minLength={8}
                autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="form-success" role="status">
              {message}
            </div>
          )}
          <button className="button primary auth-submit" disabled={busy}>
            {busy
              ? 'Un momento…'
              : recovery
                ? 'Guardar contraseña'
                : mode === 'forgot'
                  ? 'Enviar enlace'
                  : mode === 'signup'
                    ? 'Crear cuenta'
                    : mode === 'accept'
                      ? 'Aceptar invitación'
                      : 'Iniciar sesión'}
            <ArrowRight size={17} />
          </button>
          {!recovery && mode !== 'accept' && (
            <button
              type="button"
              className="text-button auth-forgot"
              onClick={() => {
                setMode(mode === 'forgot' ? 'login' : token && mode === 'login' ? 'signup' : 'forgot');
                setError('');
              }}
            >
              {mode === 'forgot'
                ? 'Volver a iniciar sesión'
                : token && mode === 'login'
                  ? 'Crear mi cuenta'
                  : '¿Olvidaste tu contraseña?'}
            </button>
          )}
          {token && mode === 'signup' && (
            <button
              type="button"
              className="text-button auth-forgot"
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Ya tengo cuenta · Iniciar sesión
            </button>
          )}
          <div className="auth-demo">
            <span>¿Quieres conocer Star5Tracker?</span>
            <NavLink to="/demo/time">
              Explorar demostración <ArrowUpRight size={15} />
            </NavLink>
          </div>
        </form>
      </div>
    </div>
  );
}
