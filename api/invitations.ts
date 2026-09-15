import { createClient } from '@supabase/supabase-js';

type Request = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const jsonError = (res: Response, status: number, error: string) => res.status(status).json({ error });

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Error('Faltan las variables de Supabase en Vercel.');
  return { url, key };
}

function header(req: Request, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function authenticate(req: Request) {
  const authorization = header(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw Error('Debes iniciar sesión.');
  const { url, key } = config();
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw Error('La sesión no es válida.');
  const { data: member, error: memberError } = await admin
    .from('members')
    .select('id,workspace_id,role,active')
    .eq('id', data.user.id)
    .maybeSingle();
  if (memberError || !member?.active || member.role !== 'admin') throw Error('Solo un administrador puede enviar invitaciones.');
  return { admin, member, user: data.user };
}

async function sendEmail(to: string, role: string, token: string, workspaceName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!apiKey || !from) throw Error('Faltan RESEND_API_KEY e INVITATION_FROM_EMAIL en Vercel.');
  const base = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || 'https://time-tracker-eight-livid.vercel.app';
  const inviteUrl = `${base.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;
  const roleLabel = role === 'admin' ? 'administrador' : 'miembro';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Invitación a ${workspaceName}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#272331;max-width:560px"><h2>Te invitaron a ${workspaceName}</h2><p>Has sido invitado como ${roleLabel} para colaborar en el equipo.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#5b3f76;color:white;text-decoration:none;padding:12px 18px;border-radius:8px">Aceptar invitación</a></p><p>Este enlace vence en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.</p><p style="font-size:12px;color:#766d7e">Si el botón no funciona, copia este enlace:<br>${inviteUrl}</p></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw Error(`Resend rechazó el correo: ${detail.slice(0, 240)}`);
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const { admin, member } = await authenticate(req);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const role = body.role === 'admin' ? 'admin' : 'member';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError(res, 400, 'Correo no válido.');
      const { data: existing } = await admin.from('members').select('id').eq('workspace_id', member.workspace_id).ilike('email', email).maybeSingle();
      if (existing) return jsonError(res, 409, 'Esta persona ya pertenece al equipo.');
      const { data: pending } = await admin.from('invitations').select('id').eq('workspace_id', member.workspace_id).ilike('email', email).eq('status', 'pending').maybeSingle();
      if (pending) return jsonError(res, 409, 'Ya existe una invitación pendiente para este correo.');
      const { data: workspace } = await admin.from('workspaces').select('name').eq('id', member.workspace_id).single();
      const { data: invitation, error } = await admin.from('invitations').insert({ workspace_id: member.workspace_id, email, role, invited_by: member.id }).select('id,token,expires_at').single();
      if (error || !invitation) throw Error(error?.message || 'No se pudo crear la invitación.');
      try {
        await sendEmail(email, role, invitation.token, workspace?.name || 'tu equipo');
      } catch (error) {
        await admin.from('invitations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', invitation.id);
        throw error;
      }
      const sentAt = new Date().toISOString();
      await admin.from('invitations').update({ status: 'pending', sent_at: sentAt, last_sent_at: sentAt, send_count: 1 }).eq('id', invitation.id);
      await admin.from('audit').insert({ workspace_id: member.workspace_id, actor_id: member.id, action: 'invite', detail: email });
      return res.status(200).json({ ok: true, id: invitation.id, token: invitation.token, expires_at: invitation.expires_at });
    }
    if (req.method === 'PATCH') {
      const id = String(body.id || '');
      const { data: invitation, error } = await admin.from('invitations').select('id,email,role,token,expires_at,status,send_count').eq('id', id).eq('workspace_id', member.workspace_id).maybeSingle();
      if (error || !invitation) return jsonError(res, 404, 'Invitación no encontrada.');
      if (body.action === 'cancel') {
        await admin.from('invitations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
        return res.status(200).json({ ok: true });
      }
      if (body.action !== 'resend' || !['pending', 'expired'].includes(invitation.status)) return jsonError(res, 400, 'La invitación no se puede reenviar.');
      const { data: workspace } = await admin.from('workspaces').select('name').eq('id', member.workspace_id).single();
      const token = crypto.randomUUID();
      await sendEmail(invitation.email, invitation.role, token, workspace?.name || 'tu equipo');
      const sentAt = new Date().toISOString();
      await admin.from('invitations').update({ token, status: 'pending', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), last_sent_at: sentAt, send_count: Number(invitation.send_count || 0) + 1 }).eq('id', id);
      return res.status(200).json({ ok: true });
    }
    return jsonError(res, 405, 'Método no permitido.');
  } catch (error) {
    return jsonError(res, 500, error instanceof Error ? error.message : 'No se pudo procesar la invitación.');
  }
}
