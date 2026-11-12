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
    <Status label={label} className="min-h-dvh bg-slate-50">
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

// --- Where the user is going ---------------------------------------------------
// While the session loads (App.tsx), the skeleton matches the account that
// last signed in on this browser (admin console, student portal or duty
// office portal) and the page being opened, instead of one generic page.
// rememberShell() is called once the real page shows; forgetShell() on sign-out.

export type Shell = 'admin' | 'student' | 'office';
const SHELL_KEY = 'aniskolar:shell';
const ADMIN_VIEW_KEY = 'aniskolar:adminView';

export function rememberShell(shell: Shell): void {
  try { localStorage.setItem(SHELL_KEY, shell); } catch { /* no storage */ }
}
export function forgetShell(): void {
  try { localStorage.removeItem(SHELL_KEY); sessionStorage.removeItem(ADMIN_VIEW_KEY); } catch { /* no storage */ }
}
export function rememberedShell(): Shell | null {
  try {
    const v = localStorage.getItem(SHELL_KEY);
    return v === 'admin' || v === 'student' || v === 'office' ? v : null;
  } catch { return null; }
}
// The admin page open in this tab (AdminDashboard keeps it), restored on refresh.
export function rememberAdminView(view: string): void {
  try { sessionStorage.setItem(ADMIN_VIEW_KEY, view); } catch { /* no storage */ }
}
export function rememberedAdminView(): string | null {
  try { return sessionStorage.getItem(ADMIN_VIEW_KEY); } catch { return null; }
}

// A page heading and description.
function HeadingBones() {
  return (
    <div className="space-y-2">
      <Bone className="h-7 w-56 max-w-full" />
      <Bone className="h-4 w-80 max-w-full" />
    </div>
  );
}

// A search bar over a list of rows (most admin pages).
function TableBones({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex gap-3 border-b border-slate-100 p-4"><Bone className="h-9 flex-1 rounded-lg" /><Bone className="hidden h-9 w-40 rounded-lg sm:block" /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-0">
          <Bone className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2"><Bone className={`h-3.5 ${i % 2 ? 'w-1/3' : 'w-2/5'}`} /><Bone className="h-3 w-1/4" /></div>
          <Bone className="hidden h-3.5 w-20 md:block" />
          <Bone className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function KpiBones({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><Bone className="h-3 w-20" /><Bone className="h-7 w-14" /></div>
      ))}
    </div>
  );
}

function ChatBones() {
  const bubbles: [boolean, string][] = [[false, 'w-2/3'], [true, 'w-1/2'], [false, 'w-3/5']];
  return (
    <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[18rem_1fr]">
      <div className="hidden space-y-1 border-r border-slate-100 p-3 md:block">
        {[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-3 rounded-lg p-2"><Bone className="size-9 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Bone className="h-3 w-1/2" /><Bone className="h-3 w-3/4" /></div></div>)}
      </div>
      <div className="flex flex-col justify-end space-y-4 p-5">
        {bubbles.map(([mine, w], i) => (
          <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><Bone className={`h-12 ${w} rounded-2xl ${mine ? 'bg-emerald-100' : ''}`} /></div>
        ))}
        <Bone className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}

function CardGridBones({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><Bone className="h-24 w-full rounded-xl" /><Bone className="h-4 w-3/4" /><Bone className="h-3 w-1/2" /></div>
      ))}
    </div>
  );
}

function StackBones() {
  return (
    <div className="space-y-4">
      {[0, 1].map(i => <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><Bone className="h-4 w-1/2" /><Bone className="h-3 w-full" /><Bone className="h-3 w-4/5" /></div>)}
    </div>
  );
}

function FormBones() {
  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <Bone className="h-5 w-48" />
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="space-y-2"><Bone className="h-3 w-24" /><Bone className="h-10 w-full rounded-xl" /></div>)}
      </div>
    </div>
  );
}

function SideNavBones({ items = 8 }: { items?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: items }, (_, i) => <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2"><Bone className="size-5 shrink-0 rounded-md" /><Bone className={`h-3.5 ${i % 3 ? 'w-24' : 'w-32'}`} /></div>)}
    </div>
  );
}

// The admin console: sidebar, top bar, and the open page's shape.
export function AdminShellSkeleton({ view }: { view?: string | null }) {
  let page: React.ReactNode;
  if (!view || view === 'home') page = <><KpiBones /><div className="grid gap-4 lg:grid-cols-2"><TableBones rows={3} /><TableBones rows={3} /></div></>;
  else if (view === 'messages') page = <ChatBones />;
  else if (view === 'analytics') page = <><KpiBones /><div className="h-64 rounded-2xl border border-slate-200 bg-white p-5"><Bone className="h-full w-full rounded-xl" /></div></>;
  else if (view === 'fse' || view === 'automation' || view === 'security') page = <StackBones />;
  else if (view === 'dutyHours' || view === 'renewals') page = <><KpiBones count={view === 'renewals' ? 4 : 3} /><TableBones /></>;
  else page = <TableBones />;
  return (
    <Status label="Loading the admin console" className="flex h-dvh overflow-hidden bg-slate-50">
      <div className="hidden w-16 shrink-0 border-r border-slate-200 bg-white md:block lg:w-60">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4"><Bone className="size-8 shrink-0 rounded-full" /><Bone className="hidden h-4 w-24 lg:block" /></div>
        <div className="hidden lg:block"><SideNavBones items={10} /></div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8"><Bone className="h-4 w-24 md:hidden" /><Bone className="ml-auto h-8 w-36 rounded-full" /></div>
        <div className="space-y-6 overflow-hidden px-4 py-8 sm:px-6 lg:px-8"><HeadingBones />{page}</div>
      </div>
    </Status>
  );
}

// The student portal: sidebar, top bar, and the open page's shape.
// Just the page area of a student page (inside the portal, while that
// page's code loads).
export function StudentPageSkeleton({ page }: { page?: string | null }) {
  const isDashboard = !page || page === 'dashboard';
  return <Status label="Loading" className="space-y-6">{isDashboard ? null : <HeadingBones />}{studentContent(page)}</Status>;
}

function studentContent(page?: string | null): React.ReactNode {
  let content: React.ReactNode;
  if (page === 'messages') content = <ChatBones />;
  else if (page === 'duty-hours') content = <><KpiBones /><TableBones rows={5} /></>;
  else if (page === 'explore') content = <CardGridBones cards={6} />;
  else if (page === 'applications' || page === 'announcements' || page === 'notifications') content = <TableBones rows={5} />;
  else if (page === 'profile' || page === 'apply-scholarship' || page === 'gpa-calculator' || page === 'account-security') content = <FormBones />;
  else if (page === 'renewals' || page === 'scholarship-details' || page === 'my-scholarship') content = <StackBones />;
  else content = <><div className="h-40 rounded-2xl border border-slate-200 bg-white p-6"><Bone className="h-6 w-56" /><Bone className="mt-3 h-4 w-80 max-w-full" /></div><CardGridBones /></>;
  return content;
}

export function StudentShellSkeleton({ page }: { page?: string | null }) {
  const content = studentContent(page);
  const isDashboard = !page || page === 'dashboard';
  return (
    <Status label="Loading AniSkolar" className="flex min-h-dvh bg-slate-50">
      <div className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex h-16 items-center gap-2.5 px-5"><Bone className="size-9 shrink-0 rounded-full" /><Bone className="h-4 w-28" /></div>
        <SideNavBones items={9} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6"><Bone className="h-5 w-32" /><Bone className="h-9 w-40 rounded-full" /></div>
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8">{isDashboard ? null : <HeadingBones />}{content}</div>
      </div>
    </Status>
  );
}

// The duty office portal: top bar, tabs, the scholars table.
export function OfficeShellSkeleton() {
  return (
    <Status label="Loading the office portal" className="min-h-dvh bg-slate-50">
      <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6"><Bone className="h-5 w-40" /><Bone className="h-8 w-32 rounded-full" /></div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <HeadingBones />
        <div className="flex gap-2">{[0, 1, 2, 3].map(i => <Bone key={i} className="h-9 w-28 rounded-lg" />)}</div>
        <TableBones rows={5} />
      </div>
    </Status>
  );
}
