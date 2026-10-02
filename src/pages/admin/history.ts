import { officeDisplayName } from '../../data/scholarships';
import { AdminApplication, HistoryEntry, HistoryStatus, historyLabel } from './adminData';

// Turns stored application history into the events the admin reads:
// who did what (student, "POLCA Office · Maria Santos", or System),
// newest first, with repeated entries collapsed.

export type ActorKind = 'student' | 'admin' | 'system';

export interface HistoryActor {
  kind: ActorKind;
  label: string;
  // Admin actors: the office code, when known.
  office?: string;
}

export interface HistoryEvent {
  key: string;
  applicationId: string;
  scholarshipName: string;
  // The status the event ended on.
  status: HistoryStatus;
  label: string;
  // Set when one review session changed the decision, oldest first
  // (e.g. ['Rejected', 'Approved']).
  decisionPath?: HistoryStatus[];
  actor: HistoryActor;
  at: string;
  // The reviewer's note (shown as a quote).
  note?: string;
  // Explanation for automatic events (shown as muted text).
  detail?: string;
}

// Two entries of the same type by the same person this close together are
// one event (e.g. "Needs revision" and then the same status re-saved with
// the note). See the backend note in PATCH /:id/status.
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
// Decisions by the same person this close together are one review
// session: "Decision changed: Rejected → Approved".
export const REVIEW_SESSION_MS = 10 * 60 * 1000;

const DECISIONS = new Set<HistoryStatus>(['Under Evaluation', 'Needs Revision', 'Approved', 'Rejected']);
const STUDENT_EVENTS = new Set<HistoryStatus>(['Submitted', 'Resubmitted']);

const time = (iso: string) => new Date(iso).getTime();

// Old entries only have the admin's email. "maria.santos@dlsud.edu.ph"
// reads as "Maria Santos"; the email itself is never shown.
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return 'Admin';
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function isSystem(entry: HistoryEntry): boolean {
  return entry.changedBy === 'system' || entry.status === 'Forwarded to LSO';
}

// Which office an admin entry came from. Recorded since changedByOffice
// was added; for older entries it's inferred only where it's certain:
// AdSO applications are only visible to the AdSO, and an office
// application is only visible to its office until it's sent to the AdSO.
function entryOffice(entry: HistoryEntry, app: AdminApplication): string | undefined {
  if (entry.changedByOffice) return entry.changedByOffice;
  const appOffice = app.office || 'LSO';
  if (appOffice === 'LSO') return 'LSO';
  if (!app.forwardedAt || time(entry.changedAt) <= time(app.forwardedAt)) return appOffice;
  return undefined;
}

function resolveActor(entry: HistoryEntry, app: AdminApplication, studentName: string): HistoryActor & { id: string } {
  if (isSystem(entry)) return { kind: 'system', label: 'System', id: 'system' };
  if (entry.changedBy === 'student' || (!entry.changedBy && STUDENT_EVENTS.has(entry.status))) {
    return { kind: 'student', label: studentName || 'Student', id: 'student' };
  }
  const name = entry.changedByName || (entry.changedBy ? nameFromEmail(entry.changedBy) : 'Admin');
  const office = entryOffice(entry, app);
  return { kind: 'admin', label: office ? `${officeDisplayName(office)} · ${name}` : name, office, id: entry.changedBy ?? name };
}

// Why an application was sent to the AdSO, worded from the office config.
// Older entries stored "Sent automatically when approved by the ALUMNI
// office"; that text is replaced, not shown.
function systemDetail(entry: HistoryEntry, app: AdminApplication): string | undefined {
  if (entry.status !== 'Forwarded to LSO') return entry.note || undefined;
  const office = entry.changedByOffice || (app.office && app.office !== 'LSO' ? app.office : undefined);
  return office ? `Sent automatically when the ${officeDisplayName(office)} approved it.` : 'Sent automatically.';
}

function decisionLabel(path: HistoryStatus[]): string {
  return `Decision changed: ${path.map(historyLabel).join(' → ')}`;
}

// One application's history, newest first.
export function buildApplicationHistory(app: AdminApplication, studentName: string): HistoryEvent[] {
  const entries: HistoryEntry[] = app.history && app.history.length > 0
    ? [...app.history]
    : [{ status: 'Submitted', changedBy: 'student', changedAt: app.createdAt }];
  entries.sort((a, b) => time(a.changedAt) - time(b.changedAt));

  type Working = HistoryEvent & { actorId: string; startedAt: number; order: number };
  const out: Working[] = [];

  entries.forEach((entry, i) => {
    const actor = resolveActor(entry, app, studentName);
    const at = time(entry.changedAt);

    if (actor.kind !== 'system') {
      // The previous event by a person, looking past automatic events.
      let j = out.length - 1;
      while (j >= 0 && out[j].actor.kind === 'system') j--;
      const prev = j >= 0 ? out[j] : undefined;

      if (prev && prev.actorId === actor.id) {
        const gap = at - time(prev.at);
        // Same status again within the duplicate window: one event, latest note.
        if (prev.status === entry.status && gap <= DUPLICATE_WINDOW_MS) {
          prev.at = entry.changedAt;
          prev.note = entry.note || prev.note;
          return;
        }
        // A different decision within the review session: the decision changed.
        if (
          prev.status !== entry.status
          && DECISIONS.has(prev.status) && DECISIONS.has(entry.status)
          && at - prev.startedAt <= REVIEW_SESSION_MS
        ) {
          prev.decisionPath = [...(prev.decisionPath ?? [prev.status]), entry.status];
          prev.status = entry.status;
          prev.label = decisionLabel(prev.decisionPath);
          prev.at = entry.changedAt;
          prev.note = entry.note || prev.note;
          return;
        }
      }
    }

    out.push({
      key: `${app._id}-${i}`,
      applicationId: app._id,
      scholarshipName: app.scholarshipName,
      status: entry.status,
      label: historyLabel(entry.status),
      actor: { kind: actor.kind, label: actor.label, office: actor.office },
      actorId: actor.id,
      startedAt: at,
      order: i,
      at: entry.changedAt,
      note: actor.kind === 'system' ? undefined : entry.note || undefined,
      detail: actor.kind === 'system' ? systemDetail(entry, app) : undefined
    });
  });

  // Newest first; entries recorded at the same moment (an office approval
  // and the automatic "Sent to AdSO") keep the later one on top.
  return out
    .sort((a, b) => time(b.at) - time(a.at) || b.order - a.order)
    .map(({ actorId: _actorId, startedAt: _startedAt, order: _order, ...event }) => event);
}

const FINAL_DECISIONS = new Set<HistoryStatus>(['Approved', 'Rejected', 'Needs Revision']);

// The most recent decision on an application (who, when, and the note).
export function latestDecision(app: AdminApplication, studentName = ''): HistoryEvent | undefined {
  return buildApplicationHistory(app, studentName).find(e => e.actor.kind === 'admin' && FINAL_DECISIONS.has(e.status));
}

// For an application routed through a partner office: that office's own
// latest decision, shown to the AdSO above its decision panel.
export function partnerOfficeDecision(app: AdminApplication, studentName = ''): HistoryEvent | undefined {
  if (!app.office || app.office === 'LSO') return undefined;
  return buildApplicationHistory(app, studentName)
    .find(e => e.actor.kind === 'admin' && e.actor.office === app.office && FINAL_DECISIONS.has(e.status));
}

// Every application's history in one newest-first feed.
export function buildCombinedHistory(applications: AdminApplication[], studentName: string): HistoryEvent[] {
  return applications
    .flatMap(app => buildApplicationHistory(app, studentName))
    .sort((a, b) => time(b.at) - time(a.at));
}

// "just now", "5 minutes ago", "yesterday", "3 days ago"; older than a
// week shows the date. The exact timestamp goes in a tooltip.
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = time(iso) - now;
  const abs = Math.abs(diff);
  if (Number.isNaN(abs)) return '—';
  if (abs < 60 * 1000) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / (60 * 1000)), 'minute');
  if (abs < 24 * 60 * 60 * 1000) return rtf.format(Math.round(diff / (60 * 60 * 1000)), 'hour');
  if (abs < 7 * 24 * 60 * 60 * 1000) return rtf.format(Math.round(diff / (24 * 60 * 60 * 1000)), 'day');
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
