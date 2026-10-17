import React from 'react';
import { DatePicker, Field, SegmentedControl, TextInput } from './AdminUI';

// When an announcement goes out: now, or at a scheduled time (the backend
// publishes it then, Facebook included). Shared by the announcement editor
// and the scholarship open / close dialog.

export type PublishTiming = 'Now' | 'Schedule';
export const PUBLISH_TIMINGS: readonly PublishTiming[] = ['Now', 'Schedule'];

export interface ScheduleState {
  timing: PublishTiming;
  date: string;   // YYYY-MM-DD, the admin's local time
  time: string;   // HH:mm
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Tomorrow at 8:00 AM, or the saved time of a scheduled post.
export function initialSchedule(scheduledFor?: string | null): ScheduleState {
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    if (!Number.isNaN(d.getTime())) return { timing: 'Schedule', date: localDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { timing: 'Now', date: localDate(tomorrow), time: '08:00' };
}

// The scheduled moment as an ISO string, or an error to show.
export function scheduleToIso(s: ScheduleState): { iso?: string; error?: string } {
  if (!s.date || !/^\d{2}:\d{2}$/.test(s.time)) return { error: 'Choose the date and time to publish.' };
  const d = new Date(`${s.date}T${s.time}:00`);
  if (Number.isNaN(d.getTime())) return { error: 'Choose the date and time to publish.' };
  if (d.getTime() <= Date.now()) return { error: 'Choose a time in the future, or publish now.' };
  return { iso: d.toISOString() };
}

export function formatScheduled(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ScheduleFields({ value, onChange, disabled, error, nowLabel = 'Now' }: {
  value: ScheduleState;
  onChange: (next: ScheduleState) => void;
  disabled?: boolean;
  error?: string;
  nowLabel?: string;
}) {
  const today = localDate(new Date());
  return (
    <div className="space-y-3">
      <Field label="Publish">
        <SegmentedControl<PublishTiming>
          options={PUBLISH_TIMINGS}
          value={value.timing}
          onChange={v => v && onChange({ ...value, timing: v })}
          label="When to publish"
          renderLabel={o => (o === 'Now' ? nowLabel : 'Schedule')}
        />
      </Field>
      {value.timing === 'Schedule' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" error={error}>
            <DatePicker value={value.date} onChange={date => onChange({ ...value, date })} min={today} disabled={disabled} />
          </Field>
          <Field label="Time" helper="Your computer's time zone.">
            <TextInput type="time" value={value.time} onChange={e => onChange({ ...value, time: e.target.value })} disabled={disabled} />
          </Field>
        </div>
      )}
    </div>
  );
}
