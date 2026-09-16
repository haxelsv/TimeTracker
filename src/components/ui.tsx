import { useEffect, useRef, type ReactNode } from 'react';
import { X, Inbox } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={27} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={'avatar ' + (small ? 'small' : '')}>
      {name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')}
    </span>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={'badge ' + status}>
      {(
        {
          submitted: 'En revisión',
          approved: 'Aprobada',
          returned: 'Cambios solicitados',
          draft: 'Borrador',
          active: 'Activo',
          archived: 'Archivado',
          pending: 'Pendiente',
          accepted: 'Aceptada',
          in_progress: 'En curso',
          completed: 'Finalizado',
          expired: 'Expirada',
          cancelled: 'Cancelada',
        } as Record<string, string>
      )[status] ?? status}
    </span>
  );
}
