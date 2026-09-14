import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { seedDemo } from '../src/lib/demo';
import { reportTable, buildPDF } from '../src/lib/export';
import { duration } from '../src/lib/time';
describe('report exports', () => {
  it('exports the same duration and rate-derived amount as the input', () => {
    const s = seedDemo();
    const e = s.entries[0];
    e.billable = true;
    e.rate = 60;
    e.description = 'Diseño, revisión y café';
    const t = reportTable(s, [{ entry: e, seconds: 5400 }]);
    expect(t.rows[0][5]).toBe('01:30:00');
    expect(t.rows[0].at(-1)).toBe('90.00');
    expect(t.rows[0][1]).toBe('Diseño, revisión y café');
  });
  it('never includes money columns in a member export', () => {
    const s = seedDemo();
    s.me = { ...s.me, role: 'member' };
    const table = reportTable(
      s,
      s.entries.map((entry) => ({ entry, seconds: duration(entry) })),
    );
    expect(table.headers).not.toContain('Importe');
    expect(table.headers).not.toContain('Tarifa/h');
    expect(table.rows[0]).toHaveLength(7);
  });
  it('renders a multipage PDF with long descriptions for visual inspection', () => {
    const s = seedDemo();
    const rows = Array.from({ length: 60 }, (_, i) => ({
      entry: {
        ...s.entries[i % s.entries.length],
        description:
          i % 3 === 0
            ? 'Revisión de la identidad visual, ajustes de composición y preparación de entregables para el equipo de diseño.'
            : s.entries[i % s.entries.length].description,
      },
      seconds: 3600,
    }));
    const doc = buildPDF(s, rows, '1–11 septiembre 2026');
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(10000);
    mkdirSync('tmp', { recursive: true });
    writeFileSync('tmp/qa-report.pdf', Buffer.from(bytes));
  });
});
