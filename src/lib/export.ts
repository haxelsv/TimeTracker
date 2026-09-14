import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { csvCell, clock, money, dayKey } from './time';
import type { Snapshot, Entry } from './types';
export interface ReportRow {
  entry: Entry;
  seconds: number;
}
export function reportTable(s: Snapshot, rows: ReportRow[]) {
  const admin = s.me.role === 'admin';
  return {
    headers: [
      'Fecha',
      'Descripción',
      'Persona',
      'Cliente',
      'Proyecto',
      'Duración',
      'Facturable',
      ...(admin ? ['Moneda', 'Tarifa/h', 'Importe'] : []),
    ],
    rows: rows.map(({ entry: e, seconds }) => {
      const p = s.projects.find((p) => p.id === e.project_id);
      return [
        dayKey(e.start_at, s.workspace.timezone),
        e.description || 'Sin descripción',
        s.members.find((m) => m.id === e.user_id)?.name ?? '',
        s.clients.find((c) => c.id === p?.client_id)?.name ?? '',
        p?.name ?? 'Sin proyecto',
        clock(seconds),
        e.billable ? 'Sí' : 'No',
        ...(admin
          ? [
              e.currency ?? s.workspace.currency,
              (e.rate ?? 0).toFixed(2),
              (e.billable ? (seconds / 3600) * (e.rate ?? 0) : 0).toFixed(2),
            ]
          : []),
      ];
    }),
  };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(s: Snapshot, rows: ReportRow[], period: string) {
  const t = reportTable(s, rows);
  download(
    new Blob(['\uFEFF' + [t.headers, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
    `star5tracker-${period}.csv`,
  );
}
export function buildPDF(s: Snapshot, rows: ReportRow[], period: string) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const t = reportTable(s, rows);
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, 297, 37, 'F');
  doc.setTextColor(255);
  doc.setFontSize(22);
  doc.text(s.workspace.name + ' | Informe de tiempo', 14, 17);
  doc.setFontSize(10);
  doc.text(period + '  ·  ' + s.workspace.timezone, 14, 27);
  doc.setTextColor(45);
  doc.setFontSize(12);
  doc.text('Tiempo registrado: ' + clock(rows.reduce((sum, r) => sum + r.seconds, 0)), 14, 49);
  if (s.me.role === 'admin') {
    const totals: Record<string, number> = {};
    rows.forEach(({ entry: e, seconds }) => {
      if (e.billable) {
        const c = e.currency ?? s.workspace.currency;
        totals[c] = (totals[c] ?? 0) + (seconds / 3600) * (e.rate ?? 0);
      }
    });
    doc.text(
      'Facturable: ' +
        (Object.entries(totals)
          .map(([c, n]) => money(n, c))
          .join(' / ') || money(0, s.workspace.currency)),
      125,
      49,
    );
  }
  autoTable(doc, {
    startY: 57,
    head: [t.headers],
    body: t.rows,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 24, 27] },
    alternateRowStyles: { fillColor: [248, 247, 250] },
    margin: { left: 14, right: 14, bottom: 17 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(
        `Star5Tracker · ${s.me.role === 'admin' ? 'Informe del equipo' : 'Informe personal'} · Página ${doc.getNumberOfPages()}`,
        14,
        202,
      );
    },
  });
  return doc;
}
export function exportPDF(s: Snapshot, rows: ReportRow[], period: string) {
  buildPDF(s, rows, period).save(`star5tracker-${period}.pdf`);
}
