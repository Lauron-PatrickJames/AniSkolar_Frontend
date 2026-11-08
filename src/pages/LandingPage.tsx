import React, { useEffect, useState } from 'react';
import { mockScholarships } from '../data/scholarships';
import { Announcement, Scholarship } from '../types';
import ScholarshipCard from '../components/ScholarshipCard';
import { Bone } from '../components/Skeletons';
import { ArrowRight, BookOpen, ShieldCheck, ChevronDown, Star, Users, DollarSign, Calendar, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Use the DLSUD background image for the hero section
import heroImage from '../assets/sample hero 1.jpg';

interface LandingPageProps {
  onLoginClick: () => void;
  onExploreClick: () => void;
  onViewScholarship: (id: string) => void;
  scholarships?: Scholarship[];
  // The office's published announcements (latest first); the newest two are
  // previewed. The section is hidden when there are none.
  announcements?: Announcement[];
  announcementsLoaded?: boolean;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_domain: 'Please sign in with your official DLSU-D email address (@dlsud.edu.ph). Other email accounts are not allowed.',
};

export default function LandingPage({ onLoginClick, onExploreClick, onViewScholarship, scholarships = mockScholarships, announcements = [], announcementsLoaded = true }: LandingPageProps) {
  // Local state for Accordion FAQs
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Surfaces the reason when SsoCallbackPage bounces someone back here
  // (e.g. ?error=invalid_domain for a non-DLSU-D email). Read once on
  // mount, then strip the param so a page refresh doesn't re-show it.
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode && AUTH_ERROR_MESSAGES[errorCode]) {
      setAuthError(AUTH_ERROR_MESSAGES[errorCode]);
      params.delete('error');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', newUrl);
    }
  }, []);

  const faqs = [
    {
      q: "Who are eligible to apply for scholarships in AniSkolar?",
      a: "Eligibility varies depending on the scholarship category. Generally, regular students of De La Salle University–Dasmariñas who have met the academic GPA thresholds, have no failing grades, and have no pending disciplinary offenses are eligible. Specific programs like the Br. President Financial Assistance Grant target students with financial needs."
    },
    {
      q: "How can I renew my active scholarship for the next term?",
      a: "Scholars can renew their grants by submitting their latest Certified True Copy of Grades (TCG) and any other program-specific requirements during the announced renewal period in the Student Portal. The AdSO will evaluate your academic compliance before automatically renewing your discount."
    },
    {
      q: "Can I apply for multiple scholarships at the same time?",
      a: "While you may explore and submit applications for multiple grants to maximize your chances, the University generally allows only one active major scholarship discount (e.g. you cannot hold both a full academic scholarship and an athletic scholarship simultaneously) unless explicitly permitted."
    },
    {
      q: "What should I do if my document uploads are failing?",
      a: "Ensure your documents are in JPEG/JPG format and do not exceed 10MB in size. If issues persist, you can contact the Admissions and Scholarship Office (AdSO) directly or visit the office at the Ayuntamiento De Gonzalez Bldg.."
    }
  ];

  const stats = [
    { label: 'Total Scholarships', value: '15+', icon: Star },
    { label: 'Active Scholars', value: '2,500+', icon: Users },
    { label: 'Financial Aid Distributed', value: '₱45M+', icon: DollarSign },
  ];

  return (
    <div className="bg-slate-50">
      {/* Auth error banner (e.g. non-DLSU-D email rejected during Microsoft sign-in) */}
      <AnimatePresence>
        {authError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-rose-50 border-b border-rose-100"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold">{authError}</p>
              </div>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="shrink-0 text-rose-500 hover:text-rose-700 focus:outline-hidden"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Hero Section */}
      <section
        id="hero"
        className="relative min-h-[95vh] flex items-center justify-center bg-cover bg-center text-white"
      style={{ backgroundImage: `linear-gradient(135deg, rgba(0, 60, 32, 0.55), rgba(0, 80, 42, 0.85)), url(${heroImage})` }}
      >
        {/* Decorative Grid Accent */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24 text-center">
          <div className="space-y-6">

            {/* Title & Slogan */}
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.08] text-white text-balance">
              Fulfill Your Dreams with <span className="text-emerald-200">AniSkolar</span>
            </h1>
            
            <p className="text-lg text-emerald-50 leading-relaxed max-w-2xl mx-auto text-pretty">
              The centralized scholarship portal of DLSU-D. Discover, apply, and manage your university grants effortlessly, empowering Lasallians to create a lasting global impact.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                onClick={onExploreClick}
                className="w-full sm:w-auto sm:min-w-60 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-green shadow-lg shadow-black/20 hover:bg-emerald-50 transition-colors focus:outline-hidden focus-visible:ring-4 focus-visible:ring-white/40"
              >
                <span>Explore Scholarships</span>
                <ArrowRight className="w-4 h-4" aria-hidden />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                onClick={onLoginClick}
                className="w-full sm:w-auto sm:min-w-60 inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-semibold text-white ring-1 ring-inset ring-white/50 hover:bg-white/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>Login to Access More</span>
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. About AniSkolar */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-950 tracking-tight mb-4 text-balance">
              About AniSkolar Portal
            </h2>
            <p className="text-base text-slate-600 leading-relaxed text-pretty">
              AniSkolar is the official, student-centered digital scholarship solution of De La Salle University–Dasmariñas. Managed by the Admissions and Scholarship Office (AdSO), AniSkolar replaces traditional paperwork with a simple, secure, and modern online environment designed specifically for the Lasallian community.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70">
              <div className="size-10 bg-emerald-50 text-brand-green rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="size-5" aria-hidden />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Centralized Exploration</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Browse every available grant, from academic and financial assistance to athletic development and leadership awards, all in one place.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70">
              <div className="size-10 bg-emerald-50 text-brand-green rounded-lg flex items-center justify-center mb-4">
                <ShieldCheck className="size-5" aria-hidden />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Transparent Evaluations</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Monitor your application status, view evaluation progress, and receive SFAG updates directly in your private dashboard.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70">
              <div className="size-10 bg-emerald-50 text-brand-green rounded-lg flex items-center justify-center mb-4">
                <Star className="size-5" aria-hidden />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Lasallian Excellence</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Dedicated to helping promising Lasallians thrive, ensuring financial limitations do not block their academic potentials and service goals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Available Scholarships Preview */}
      <section id="scholarships" className="py-20 bg-slate-50 border-t border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 gap-4">
            <div>
              <h2 className="font-display font-extrabold text-3xl text-slate-950 tracking-tight text-balance">Available Scholarships</h2>
              <p className="text-base text-slate-600 mt-2">Explore active grants. Log in to start your online application.</p>
            </div>
            <button
              type="button"
              onClick={onExploreClick}
              className="group inline-flex items-center gap-1.5 shrink-0 rounded-lg px-1 text-sm font-semibold text-brand-green hover:text-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green"
            >
              <span>View All Scholarships</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scholarships.slice(0, 3).map((scholarship) => (
              <ScholarshipCard
                key={scholarship.id}
                scholarship={scholarship}
                onViewDetails={onViewScholarship}
                onApply={onLoginClick} // Prompt login first
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. How to Apply Section */}
      <section id="how-to-apply" className="py-20 bg-white border-t border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display font-extrabold text-3xl text-slate-950 tracking-tight mb-4 text-balance">Simple Application Process</h2>
            <p className="text-base text-slate-600">
              Applying for financial support at DLSU-D is straightforward. Follow these four straightforward milestones:
            </p>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Explore Grants', desc: 'Browse and search our categorized scholarships and find the perfect match.' },
              { step: '02', title: 'Check Eligibility', desc: 'Review required grade averages and necessary documentation rules.' },
              { step: '03', title: 'Submit Requirements', desc: 'Log in and upload scanned digital copies of your credentials directly.' },
              { step: '04', title: 'Wait for Evaluation', desc: 'The AdSO evaluates submissions; receive real-time notifications on outcomes.' }
            ].map((item, idx) => (
              <li key={idx} className="rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200/70">
                <span className="mb-4 block font-display text-3xl font-extrabold text-brand-green tabular-nums">{item.step}</span>
                <h3 className="font-display font-bold text-base text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. Latest Announcements Preview (real posts; hidden when there are none) */}
      {(!announcementsLoaded || announcements.length > 0) && (
      <section id="announcements" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display font-extrabold text-3xl text-slate-950 tracking-tight mb-4 text-balance">Latest Scholarship Announcements</h2>
            <p className="text-base text-slate-600">Stay up to date with key scholarship announcements, deadlines, and requirements.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {!announcementsLoaded && [0, 1].map(i => (
              <div key={i} role="status" className="bg-white p-6 rounded-2xl ring-1 ring-slate-200/70 space-y-3">
                <span className="sr-only">Loading announcements…</span>
                <div className="flex justify-between"><Bone className="h-5 w-20 rounded-full" /><Bone className="h-4 w-24" /></div>
                <Bone className="h-5 w-3/4" />
                <Bone className="h-3 w-full" /><Bone className="h-3 w-5/6" />
                <Bone className="h-3 w-24" />
              </div>
            ))}
            {announcements.slice(0, 2).map((ann) => (
              <div key={ann.id} className="bg-white p-6 rounded-2xl ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-500 mb-3">
                  <span className="font-semibold text-brand-green">{ann.category}</span>
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-4 h-4" aria-hidden />
                    <span>{ann.date}</span>
                  </div>
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900 mb-2 text-balance">{ann.title}</h3>
                <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">{ann.description}</p>
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="group inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-green hover:text-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green"
                >
                  <span>Read details</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* 6. Frequently Asked Questions */}
      <section id="faqs" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-display font-extrabold text-3xl text-slate-950 tracking-tight mb-4 text-balance">
              Frequently Asked Questions
            </h2>
            <p className="text-base text-slate-600">Quick answers to common questions about scholarships and AniSkolar portal.</p>
          </div>

          <div className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200/70">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={idx}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full text-left px-5 py-4 flex justify-between items-center gap-4 focus:outline-hidden focus-visible:bg-slate-50"
                  >
                    <span className="font-display font-bold text-base text-slate-900 leading-snug">
                      {faq.q}
                    </span>
                    <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-green' : 'text-slate-400'}`} aria-hidden />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}