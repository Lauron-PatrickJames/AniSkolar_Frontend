import React from 'react';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import logo from '../assets/logo.png';

// The public pages' footer (landing, sign-in, scholarship details): DLSU-D
// green like the hero and header, the AdSO's contact details as links you
// can tap (call, email, map), and the team's credits.

// The team, each name linking to their LinkedIn.
const DEVELOPERS = [
  { name: 'Paula Ng', url: 'https://www.linkedin.com/in/paula-ng-7b11473b6/' },
  { name: 'Allyson Martin', url: 'https://www.linkedin.com/in/allyson-martin-908914392/' },
  { name: 'Patrick Lauron', url: 'https://www.linkedin.com/in/patjeyms/' },
];

const EXPLORE = [
  { label: 'About AniSkolar', href: '#about' },
  { label: 'Scholarships', href: '#scholarships' },
  { label: 'How to apply', href: '#how-to-apply' },
  { label: 'FAQs', href: '#faqs' },
];

const UNIVERSITY = [
  { label: 'DLSU-D website', href: 'https://www.dlsud.edu.ph' },
  { label: 'Schoolbook', href: 'https://www.dlsud.edu.ph/aboutSchoolbook.htm' },
  { label: 'University Registrar', href: 'https://www.dlsud.edu.ph/registrar/' },
];

const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Ayuntamiento+de+Gonzalez+Building+De+La+Salle+University-Dasmari%C3%B1as';

const linkClass = 'rounded-sm text-emerald-50/75 transition-colors hover:text-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300';
const heading = 'mb-4 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200/90';

export default function Footer() {
  return (
    <footer id="main-footer" className="relative overflow-hidden bg-[#063a22] text-sm text-emerald-50/80">
      {/* A soft glow so the green isn't flat. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-24 sm:px-6 sm:pt-16 sm:pb-8 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-4" id="footer-brand">
            <a href="#hero" className="inline-flex items-center gap-3 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <img src={logo} alt="" className="size-8 object-contain" />
              </span>
              <span>
                <span className="block font-display text-xl font-bold tracking-tight text-white">AniSkolar</span>
                <span className="block text-xs font-medium text-emerald-200/80">DLSU-D Scholarship Portal</span>
              </span>
            </a>
            <p className="mt-4 max-w-sm leading-relaxed text-emerald-50/70">
              Find the scholarships you can apply for, apply online, and follow your application and grant in one place, with your DLSU-D account.
            </p>
          </div>

          {/* Links */}
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 lg:col-span-4">
            <div id="footer-links-quick">
              <h3 className={heading}>Explore</h3>
              <ul className="space-y-2.5">
                {EXPLORE.map(l => <li key={l.href}><a href={l.href} className={linkClass}>{l.label}</a></li>)}
              </ul>
            </div>
            <div id="footer-links-univ">
              <h3 className={heading}>University</h3>
              <ul className="space-y-2.5">
                {UNIVERSITY.map(l => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={`${linkClass} group inline-flex items-center gap-1`}>
                      {l.label}
                      <ArrowUpRight className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Contact the AdSO */}
          <div className="lg:col-span-4" id="footer-contact">
            <h3 className={heading}>Admissions and Scholarship Office</h3>
            <ul className="space-y-3.5">
              <li>
                <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} flex items-start gap-3`}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
                  <span>Ayuntamiento de Gonzalez Bldg., De La Salle University–Dasmariñas, Brgy. Fatima 1, Dasmariñas City, Cavite 4115</span>
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
                <span>
                  <a href="tel:+63464811900" className={linkClass}>(046) 481 1900</a>
                  <span className="text-emerald-50/50"> or </span>
                  <a href="tel:+63287795180,3029" className={linkClass}>(02) 8779 5180</a>
                  <span className="text-emerald-50/50">, local 3029</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
                <span className="flex min-w-0 flex-col gap-1">
                  <a href="mailto:scholarship@dlsud.edu.ph" className={`${linkClass} break-all`}>scholarship@dlsud.edu.ph</a>
                  <a href="mailto:AdSO_admissions@dlsud.edu.ph" className={`${linkClass} break-all`}>AdSO_admissions@dlsud.edu.ph</a>
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom row: kept clear of the round "back to top" button. */}
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-emerald-50/55 sm:flex-row sm:items-center sm:justify-between sm:pr-20">
          <p id="copyright">© {new Date().getFullYear()} De La Salle University–Dasmariñas. All rights reserved.</p>
          <p>
            Developed by{' '}
            {DEVELOPERS.map((d, i) => (
              <React.Fragment key={d.url}>
                {i > 0 && (i === DEVELOPERS.length - 1 ? ', and ' : ', ')}
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${d.name} on LinkedIn`}
                  className="rounded-sm font-semibold text-emerald-200 underline-offset-2 hover:text-white hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  {d.name}
                </a>
              </React.Fragment>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
