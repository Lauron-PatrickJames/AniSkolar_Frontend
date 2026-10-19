import React from 'react';

// Skeleton loading states: grey shapes in the layout of what's coming,
// instead of a spinner. They pulse gently (not at all with reduced motion)
// and announce themselves to screen readers once, via role="status".

export function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block rounded-md bg-slate-200/80 motion-safe:animate-pulse ${className}`} />;
}

function Status({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

// The whole app while the session loads: a top bar and a page of cards.
export function AppSkeleton({ label = 'Loading AniSkolar', caption }: { label?: string; caption?: string }) {
  return (
    <Status label={label} className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Bone className="size-9 rounded-full" />
          <Bone className="h-4 w-28" />
          <div className="ml-auto hidden items-center gap-6 md:flex">
            <Bone className="h-3 w-16" /><Bone className="h-3 w-20" /><Bone className="h-3 w-16" />
          </div>
          <Bone className="ml-auto size-8 rounded-full md:ml-4" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {caption && <p className="text-xs font-semibold text-slate-500">{caption}</p>}
        <div className="space-y-2">
          <Bone className="h-7 w-64 max-w-full" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
              <Bone className="h-32 w-full rounded-xl" />
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        <RowsSkeleton rows={3} />
      </div>
    </Status>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Bone className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className={`h-3.5 ${i % 2 ? 'w-1/3' : 'w-2/5'}`} />
            <Bone className="h-3 w-1/4" />
          </div>
          <Bone className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Stat cards over a table (Duty Hours).
export function StatsTableSkeleton({ label, stats = 4, rows = 5 }: { label: string; stats?: number; rows?: number }) {
  return (
    <Status label={label} className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex gap-4 border-b border-slate-100 p-4"><Bone className="h-3 w-24" /><Bone className="h-3 w-16" /><Bone className="h-3 w-16" /><Bone className="ml-auto h-3 w-12" /></div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-0">
            <Bone className="h-3.5 w-28" /><Bone className="h-3.5 w-16" /><Bone className="h-3.5 w-16" /><Bone className="ml-auto h-3.5 w-10" />
          </div>
        ))}
      </div>
    </Status>
  );
}

// Stacked cards (Renewals).
export function CardsSkeleton({ label, cards = 2 }: { label: string; cards?: number }) {
  return (
    <Status label={label} className="space-y-4">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Bone className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-4 w-1/2" />
              <Bone className="h-3 w-1/3" />
            </div>
            <Bone className="h-6 w-24 rounded-full" />
          </div>
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-4/5" />
        </div>
      ))}
    </Status>
  );
}

// A conversation (Messages): bubbles on both sides and the message box.
export function ChatSkeleton({ label }: { label: string }) {
  const bubbles: [boolean, string][] = [[false, 'w-2/3'], [true, 'w-1/2'], [false, 'w-3/5'], [true, 'w-2/5']];
  return (
    <Status label={label} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="space-y-4 p-5">
        {bubbles.map(([mine, w], i) => (
          <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <Bone className={`h-14 ${w} rounded-2xl ${mine ? 'bg-emerald-100' : ''}`} />
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-slate-200 bg-white p-4">
        <Bone className="h-16 w-full rounded-xl" />
        <div className="flex justify-between"><Bone className="h-8 w-20 rounded-xl" /><Bone className="h-8 w-20 rounded-xl" /></div>
      </div>
    </Status>
  );
}

// A long form (application wizard): steps, then labelled fields.
export function FormSkeleton({ label, caption }: { label: string; caption?: string }) {
  return (
    <Status label={label} className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {caption && <p className="text-xs font-semibold text-slate-500">{caption}</p>}
      <div className="flex items-center gap-3">
        {[0, 1, 2, 3, 4].map(i => <React.Fragment key={i}><Bone className="size-8 shrink-0 rounded-full" />{i < 4 && <Bone className="h-1 flex-1" />}</React.Fragment>)}
      </div>
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <Bone className="h-5 w-48" />
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-2"><Bone className="h-3 w-24" /><Bone className="h-10 w-full rounded-xl" /></div>
          ))}
        </div>
        <div className="space-y-2"><Bone className="h-3 w-32" /><Bone className="h-24 w-full rounded-xl" /></div>
        <div className="flex justify-between pt-2"><Bone className="h-10 w-24 rounded-xl" /><Bone className="h-10 w-28 rounded-xl" /></div>
      </div>
    </Status>
  );
}
