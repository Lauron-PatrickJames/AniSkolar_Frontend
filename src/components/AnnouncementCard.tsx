import React, { useEffect, useId, useState } from 'react';
import { Announcement } from '../types';
import { Award, Bell, Calendar, ChevronDown, Clock, ExternalLink, Images, Megaphone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { mockScholarships } from '../data/scholarships';

// --- Shared pieces -------------------------------------------------------------------

export const CATEGORY: Record<Announcement['category'], { icon: React.ElementType; badge: string; tile: string }> = {
  General: { icon: Megaphone, badge: 'bg-sky-50 text-sky-800 ring-sky-200', tile: 'bg-sky-50 text-sky-600' },
  Deadline: { icon: Clock, badge: 'bg-rose-50 text-rose-800 ring-rose-200', tile: 'bg-rose-50 text-rose-600' },
  Event: { icon: Calendar, badge: 'bg-amber-50 text-amber-900 ring-amber-200', tile: 'bg-amber-50 text-amber-600' },
  Update: { icon: Award, badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', tile: 'bg-emerald-50 text-emerald-600' },
};
const FALLBACK = { icon: Bell, badge: 'bg-slate-50 text-slate-700 ring-slate-200', tile: 'bg-slate-100 text-slate-500' };
export const categoryOf = (a: Announcement) => CATEGORY[a.category] ?? FALLBACK;

// Posted in the last 3 days.
export const isNew = (iso?: string | null) => !!iso && Date.now() - Date.parse(iso) < 3 * 24 * 60 * 60 * 1000;

export const scholarshipName = (a: Announcement) =>
  a.scholarshipId ? mockScholarships.find(s => s.id === a.scholarshipId)?.name : undefined;

// The summary is usually repeated in the body, so the body falls back to it.
export const bodyOf = (a: Announcement) => a.content?.trim() || a.description;

export function Marked({ text, term }: { text: string; term?: string }) {
  const t = term?.trim();
  if (!t) return <>{text}</>;
  const parts = text.split(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return <>{parts.map((p, i) => (p.toLowerCase() === t.toLowerCase() ? <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit">{p}</mark> : p))}</>;
}

// Plain-text body: paragraphs on blank lines, and web addresses as links.
export function Body({ text, className = '' }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const linkify = (line: string) =>
    line.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-green underline decoration-brand-green/30 underline-offset-2 hover:decoration-brand-green">
          {part}
        </a>
      ) : (
        part
      ),
    );
  return (
    <div className={`max-w-[70ch] space-y-4 text-[15px] leading-7 text-slate-700 ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line break-words">{linkify(p)}</p>
      ))}
    </div>
  );
}

export function MetaRow({ announcement, className = '' }: { announcement: Announcement; className?: string }) {
  const cat = categoryOf(announcement);
  const Icon = cat.icon;
  const scholarship = scholarshipName(announcement);
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs ${className}`}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${cat.badge}`}>
        <Icon className="size-3.5" aria-hidden />
        {announcement.category}
      </span>
      {isNew(announcement.publishedAt) && <span className="rounded-full bg-brand-green px-2 py-0.5 font-semibold text-white">New</span>}
      {scholarship && <span className="max-w-full truncate text-slate-500">{scholarship}</span>}
      <time className="ml-auto shrink-0 text-slate-500" dateTime={announcement.publishedAt ?? undefined}>{announcement.date}</time>
    </div>
  );
}

// The post's pictures: the chosen one shown whole (posters carry text, so
// it's never cropped), with the rest as thumbnails to switch between.
export function Gallery({ urls, title, maxHeight = 'max-h-[26rem]' }: { urls: string[]; title: string; maxHeight?: string }) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [urls.join('|')]);
  if (urls.length === 0) return null;
  const current = urls[Math.min(active, urls.length - 1)];
  return (
    <div className="space-y-2">
      <a href={current} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
        <img src={current} alt={urls.length > 1 ? `Image ${active + 1} of ${urls.length} for “${title}”` : `Image for “${title}”`} className={`mx-auto w-auto object-contain ${maxHeight}`} />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Open full size <ExternalLink className="size-3.5" aria-hidden />
        </span>
      </a>
      {urls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="More images">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1} of ${urls.length}`}
              aria-pressed={i === active}
              className={`size-16 shrink-0 overflow-hidden rounded-md ring-2 ring-offset-1 transition ${i === active ? 'ring-brand-green' : 'ring-transparent opacity-70 hover:opacity-100'}`}
            >
              <img src={u} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FacebookLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-green">
      View on Facebook
      <ExternalLink className="size-4" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// --- The full post, as students read it ---------------------------------------------
// Used by the student Announcements page's reading window and by the admin
// "Student view", so both always show the same thing.

export function AnnouncementArticle({ announcement: a, titleId }: { announcement: Announcement; titleId?: string }) {
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <MetaRow announcement={a} />
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{a.title}</h2>
        {a.postedBy && <p className="text-sm text-slate-500">Posted by {a.postedBy}</p>}
      </header>
      <Gallery urls={a.imageUrls ?? []} title={a.title} maxHeight="max-h-[60vh]" />
      <Body text={bodyOf(a)} className="text-base leading-8" />
      {a.fbPermalink && (
        <div className="border-t border-slate-100 pt-4">
          <FacebookLink href={a.fbPermalink} />
        </div>
      )}
    </article>
  );
}

// --- A card that opens in place (phones, and a scholarship's details page) ----------

interface AnnouncementCardProps {
  announcement: Announcement;
  id?: string;
  isInitiallyExpanded?: boolean;
  // Text to mark in the title and preview (the page's search).
  highlight?: string;
  key?: React.Key;
}

export default function AnnouncementCard({ announcement, id, isInitiallyExpanded = false, highlight }: AnnouncementCardProps) {
  const [open, setOpen] = useState(isInitiallyExpanded);
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const images = announcement.imageUrls ?? [];

  return (
    <article
      id={id}
      aria-labelledby={`${panelId}-title`}
      className={`overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] duration-200 ${
        open ? 'border-slate-300 shadow-md shadow-slate-900/5' : 'border-slate-200 shadow-xs hover:border-slate-300'
      }`}
    >
      {/* The picture is always in view; closed, it's a preview of the first one. */}
      {images.length > 0 && !open && (
        <div className="relative bg-slate-100">
          <img src={images[0]} alt="" loading="lazy" className="mx-auto max-h-64 w-auto object-contain" />
          {images.length > 1 && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white">
              <Images className="size-3.5" aria-hidden />{images.length} photos
            </span>
          )}
        </div>
      )}

      <div className="relative px-4 pb-4 pt-4 sm:px-5">
        <MetaRow announcement={announcement} />
        <h3 id={`${panelId}-title`} className="mt-2.5 text-base font-semibold leading-snug text-slate-900 sm:text-lg">
          {/* The whole header opens the post: the button stretches over it. */}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="text-left after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-green"
          >
            <Marked text={announcement.title} term={highlight} />
          </button>
        </h3>
        {announcement.postedBy && <p className="mt-1 text-sm text-slate-500">Posted by {announcement.postedBy}</p>}
        {!open && announcement.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 sm:text-[15px]">
            <Marked text={announcement.description} term={highlight} />
          </p>
        )}
        <span className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${open ? 'text-slate-500' : 'text-brand-green'}`} aria-hidden>
          {open ? 'Show less' : 'Read announcement'}
          <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={`${panelId}-title`}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <div className="space-y-5 border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">
              <Gallery urls={images} title={announcement.title} maxHeight="max-h-[24rem]" />
              <Body text={bodyOf(announcement)} />
              {announcement.fbPermalink && (
                <div className="border-t border-slate-100 pt-4">
                  <FacebookLink href={announcement.fbPermalink} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
