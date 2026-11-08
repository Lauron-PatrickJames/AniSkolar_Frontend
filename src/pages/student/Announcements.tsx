import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Announcement, Scholarship } from '../../types';
import { AnnouncementArticle, Marked, categoryOf, isNew, scholarshipName } from '../../components/AnnouncementCard';
import { ArrowRight, Images, Megaphone, Search, X } from 'lucide-react';

interface AnnouncementsProps {
  announcements: Announcement[];
  // Kept for callers; the page no longer filters by scholarship.
  scholarships?: Scholarship[];
  id?: string;
}

// A school news board: the newest announcement as the featured story, the
// rest as picture cards, and the full post in a reading window. Newest first,
// as the feed sends them; a search box narrows the board.
export default function Announcements({ announcements, id }: AnnouncementsProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (!q) return announcements;
    return announcements.filter(a =>
      [a.title, a.description, a.content, a.postedBy ?? ''].some(t => t.toLowerCase().includes(q)),
    );
  }, [announcements, q]);

  // While searching, every result is a plain card; otherwise the newest leads.
  const [featured, ...rest] = q ? [undefined, ...shown] : shown;
  const opened = announcements.find(a => a.id === openId) ?? null;
  const total = `${announcements.length} ${announcements.length === 1 ? 'announcement' : 'announcements'}`;

  return (
    <div id={id} className="space-y-8">
      {/* Masthead */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-green">Admissions and Scholarship Office</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">News and announcements</h2>
          <p className="mt-1 text-sm text-slate-500">Updates for scholars and applicants of DLSU-D · {total}</p>
        </div>
        <div role="search" className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search announcements"
            aria-label="Search announcements"
            className="block h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{q ? `${shown.length} of ${total}` : ''}</p>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <Megaphone className="mx-auto size-10 text-slate-300" aria-hidden />
          <h3 className="mt-3 font-display text-lg font-semibold text-slate-800">{q ? 'No announcements match your search' : 'No announcements yet'}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
            {q ? 'Try a different word, or clear the search to see everything.' : 'Updates from the Admissions and Scholarship Office will show up here.'}
          </p>
          {q && <button type="button" onClick={() => setQuery('')} className="mt-4 text-sm font-semibold text-brand-green hover:text-brand-green-dark">Clear search</button>}
        </div>
      ) : (
        <>
          {featured && <Featured announcement={featured} onOpen={() => setOpenId(featured.id)} />}

          {rest.length > 0 && (
            <section aria-labelledby="ann-more" className="space-y-4">
              <h3 id="ann-more" className="font-display text-lg font-semibold text-slate-900">
                {q ? `Results for “${query.trim()}”` : 'More announcements'}
              </h3>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map(a => (
                  <li key={a.id}><NewsCard announcement={a} highlight={q} onOpen={() => setOpenId(a.id)} /></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ReadingWindow announcement={opened} onClose={() => setOpenId(null)} />
    </div>
  );
}

// --- Pictures ---------------------------------------------------------------------------

// The post's first picture, shown whole over a soft blur of itself so a
// poster's text is never cropped. Posts without one get a branded panel.
function Cover({ announcement, className = '' }: { announcement: Announcement; className?: string }) {
  const images = announcement.imageUrls ?? [];
  const cat = categoryOf(announcement);
  const Icon = cat.icon;
  if (images.length === 0) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 ${className}`} aria-hidden>
        <div className="absolute inset-0 [background-image:radial-gradient(rgb(0_105_55/0.12)_1px,transparent_1px)] [background-size:16px_16px]" />
        <Icon className="absolute -bottom-8 -right-8 size-44 text-brand-green/[0.07]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-green shadow-sm ring-1 ring-brand-green/15"><Icon className="size-6" /></span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-green/80">{announcement.category}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      <img src={images[0]} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
      <img src={images[0]} alt="" loading="lazy" className="relative mx-auto h-full w-auto max-w-full object-contain" />
      {images.length > 1 && (
        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
          <Images className="size-3.5" aria-hidden />{images.length}
        </span>
      )}
    </div>
  );
}

function CategoryChip({ announcement, onImage = false }: { announcement: Announcement; onImage?: boolean }) {
  const cat = categoryOf(announcement);
  const Icon = cat.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${onImage ? 'bg-white/95 text-slate-800 ring-black/5 shadow-sm' : cat.badge}`}>
      <Icon className="size-3.5" aria-hidden />{announcement.category}
    </span>
  );
}

// --- The featured (newest) story --------------------------------------------------------

function Featured({ announcement: a, onOpen }: { announcement: Announcement; onOpen: () => void }) {
  const scholarship = scholarshipName(a);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md lg:grid lg:h-[24rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Cover announcement={a} className="aspect-[16/10] lg:aspect-auto lg:h-full" />
      <div className="flex min-h-0 flex-col p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-green/10 px-2.5 py-0.5 text-xs font-semibold text-brand-green">Latest</span>
          <CategoryChip announcement={a} />
          {isNew(a.publishedAt) && <span className="rounded-full bg-brand-green px-2.5 py-0.5 text-xs font-semibold text-white">New</span>}
        </div>
        <h3 className="mt-4 font-display text-2xl font-bold leading-tight text-slate-900 sm:text-[1.75rem]">
          <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 focus:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand-green">
            {a.title}
          </button>
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          <time dateTime={a.publishedAt ?? undefined}>{a.date}</time>
          {a.postedBy && <> · {a.postedBy}</>}
        </p>
        {scholarship && <p className="mt-1 text-sm font-medium text-slate-600">{scholarship}</p>}
        {a.description && <p className="mt-4 line-clamp-4 text-[15px] leading-7 text-slate-600">{a.description}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand-green" aria-hidden>
          Read full announcement <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}

// --- A card on the board -----------------------------------------------------------------

function NewsCard({ announcement: a, highlight, onOpen }: { announcement: Announcement; highlight?: string; onOpen: () => void }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        <Cover announcement={a} className="aspect-[16/10]" />
        {(a.imageUrls?.length ?? 0) > 0 && <div className="absolute left-3 top-3"><CategoryChip announcement={a} onImage /></div>}
        {isNew(a.publishedAt) && <span className="absolute right-3 top-3 rounded-full bg-brand-green px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">New</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs text-slate-500">
          {(a.imageUrls?.length ?? 0) === 0 && <span className="font-semibold text-slate-600">{a.category} · </span>}
          <time dateTime={a.publishedAt ?? undefined}>{a.date}</time>
        </p>
        <h4 className="mt-1.5 line-clamp-2 font-display text-lg font-semibold leading-snug text-slate-900 group-hover:text-brand-green">
          <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 focus:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand-green">
            <Marked text={a.title} term={highlight} />
          </button>
        </h4>
        {a.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600"><Marked text={a.description} term={highlight} /></p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
          <span className="truncate text-slate-500">{a.postedBy ?? ''}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-green" aria-hidden>
            Read more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

// --- The full post -----------------------------------------------------------------------

// A native modal dialog: it traps focus, closes on Escape, and hands focus
// back to the card that opened it.
function ReadingWindow({ announcement: a, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (a && !d.open) d.showModal();
    if (!a && d.open) d.close();
  }, [a]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="reading-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      {a && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 sm:px-8">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-brand-green">Announcement</p>
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800" autoFocus>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-8 pt-5 sm:px-8">
            <AnnouncementArticle announcement={a} titleId="reading-title" />
          </div>
        </div>
      )}
    </dialog>
  );
}
