import {
  exportFileName,
  normaliseRange,
  renderCsv,
  renderMarkdown,
  sessionsInRange,
  type ExportFormat,
  type Session,
} from '@trath/core';
import { useState } from 'react';

import type { Backend } from '../platform/backend';

export interface ExportPanelProps {
  backend: Backend;
  sessions: readonly Session[];
  /** The local day the range starts on by default, as `2026-11-18`. */
  today: string;
}

function countLabel(count: number): string {
  return count === 1 ? '1 session' : `${count} sessions`;
}

export function ExportPanel({ backend, sessions, today }: ExportPanelProps) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const range = normaliseRange(from ?? today, to ?? today);
  const count = range === null ? 0 : sessionsInRange(sessions, range).length;

  function save(format: ExportFormat) {
    if (range === null) {
      return;
    }
    const contents = format === 'md' ? renderMarkdown(sessions, range) : renderCsv(sessions, range);
    setBusy(true);
    setStatus(null);
    backend
      .saveExport(exportFileName(range, format), contents)
      .then((path) => {
        setStatus(path === null ? null : `Saved to ${path}`);
      })
      .catch((caught: unknown) => {
        setStatus(`Export failed. ${caught instanceof Error ? caught.message : String(caught)}`);
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <section className="export" aria-label="Export">
      <header className="section-head">
        <h2>Export</h2>
        <p className="total">{range === null ? 'Pick two dates' : countLabel(count)}</p>
      </header>
      <div className="range">
        <label className="field">
          <span>From</span>
          <input
            type="date"
            value={from ?? today}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="date"
            value={to ?? today}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy || range === null}
          onClick={() => {
            save('md');
          }}
        >
          Markdown
        </button>
        <button
          type="button"
          className="button"
          disabled={busy || range === null}
          onClick={() => {
            save('csv');
          }}
        >
          CSV
        </button>
      </div>
      {status !== null && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
