import { createClient } from '@supabase/supabase-js';
import { demoCommand, readDemo } from './demo';
import type { Snapshot, Payload } from './types';
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function uploadClientLogo(demo: boolean, file: File, workspaceId: string, clientId: string) {
  if (demo) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('No se pudo leer el logo.'));
      reader.readAsDataURL(file);
    });
  }
  if (!supabase) throw Error('El acceso del equipo aún no está configurado.');
  const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${workspaceId}/${clientId}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('client-logos').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw Error(error.message);
  return supabase.storage.from('client-logos').getPublicUrl(path).data.publicUrl;
}
export async function removeClientLogo(demo: boolean, logoUrl: string | null | undefined) {
  if (demo || !logoUrl || !supabase) return;
  const marker = '/storage/v1/object/public/client-logos/';
  const index = logoUrl.indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(logoUrl.slice(index + marker.length));
  if (path) await supabase.storage.from('client-logos').remove([path]);
}
export async function snapshot(demo: boolean): Promise<Snapshot> {
  if (demo) return { ...readDemo(), server_now: new Date().toISOString() };
  if (!supabase) throw Error('El acceso del equipo aún no está configurado.');
  const { data, error } = await supabase.rpc('app_snapshot');
  if (error) throw Error(error.message);
  return data;
}
export async function command(demo: boolean, action: string, payload: Payload): Promise<Payload> {
  if (!navigator.onLine)
    throw Error('Sin conexión. El cambio no se ha guardado; vuelve a intentarlo al reconectar.');
  if (demo) return demoCommand(action, payload);
  if (!supabase) throw Error('El acceso del equipo aún no está configurado.');
  const fingerprint = JSON.stringify([action, payload]);
  const cached = sessionStorage.getItem('timetracker.pending');
  let pending = cached ? JSON.parse(cached) : null;
  if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, id: crypto.randomUUID() };
  sessionStorage.setItem('timetracker.pending', JSON.stringify(pending));
  const { data, error } = await supabase.rpc('app_command', {
    p_action: action,
    p_data: payload,
    p_request: pending.id,
  });
  if (error) throw Error(error.message);
  sessionStorage.removeItem('timetracker.pending');
  return data;
}
