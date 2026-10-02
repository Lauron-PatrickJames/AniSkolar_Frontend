import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { formatDateTime } from './adminData';
import { HISTORY_META, Quote, Tooltip } from './AdminUI';
import { HistoryEvent, relativeTime } from './history';

// Activity events (see history.ts), newest first. Each row: icon, label,
// actor, relative time (exact timestamp in a tooltip), then the note.
// `showScholarship` adds the scholarship name for the combined feed.
export default function HistoryList({ events, showScholarship, empty, label }: {
  events: HistoryEvent[];
  showScholarship?: boolean;
  empty: string;
  label: string;
}) {
  if (events.length === 0) return <p className="py-2 text-sm text-ink-muted">{empty}</p>;
  const now = Date.now();
  return (
    <ol aria-label={label} className="divide-y divide-line">
      {events.map(event => {
        const meta = HISTORY_META[event.status] ?? HISTORY_META['Under Evaluation'];
        const system = event.actor.kind === 'system';
        const Icon = event.decisionPath ? ArrowLeftRight : meta.icon;
        return (
          <li key={event.key} className="flex gap-3 py-3">
            <span
              aria-hidden
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                system ? 'bg-neutral-bg text-ink-subtle' : CHIP[meta.tone]
              }`}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={`min-w-0 text-sm ${system ? 'text-ink-muted' : 'font-medium text-ink'}`}>{event.label}</p>
                <Tooltip content={formatDateTime(event.at)} asChild>
                  <time dateTime={event.at} tabIndex={0} className="shrink-0 rounded-badge text-xs text-ink-subtle tabular-nums">
                    {relativeTime(event.at, now)}
                  </time>
                </Tooltip>
              </div>
              <p className="mt-0.5 text-xs text-ink-subtle">
                <span className={system ? 'italic' : ''}>{event.actor.label}</span>
                {showScholarship && <span> · {event.scholarshipName}</span>}
              </p>
              {event.detail && <p className="mt-1 text-xs text-ink-subtle">{event.detail}</p>}
              {event.note && <Quote className="mt-2">{event.note}</Quote>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Icon chip colours per tone, matching the status badges.
const CHIP: Record<string, string> = {
  neutral: 'bg-neutral-bg text-ink-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg'
};
