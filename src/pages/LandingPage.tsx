import React, { useState } from 'react';
import { mockScholarships } from '../data/scholarships';
import { mockAnnouncements } from '../data/announcements';
import ScholarshipCard from '../components/ScholarshipCard';
import { ArrowRight, BookOpen, ShieldCheck, HelpCircle, ChevronDown, ChevronUp, Star, Users, DollarSign, Calendar, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Use the DLSUD background image for the hero section
import heroImage from '../assets/sample hero 1.jpg';

interface LandingPageProps {
  onLoginClick: () => void;
  onExploreClick: () => void;
  onViewScholarship: (id: string) => void;
}

export default function LandingPage({ onLoginClick, onExploreClick, onViewScholarship }: LandingPageProps) {
  // Local state for Accordion FAQs
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "Who are eligible to apply for scholarships in AniSkolar?",
      a: "Eligibility varies depending on the scholarship category. Generally, regular students of De La Salle University–Dasmariñas who have met the academic GPA thresholds, have no failing grades, and have no pending disciplinary offenses are eligible. Specific programs like the Br. President Financial Assistance Grant target students with financial needs."
    },
    {
      q: "How can I renew my active scholarship for the next term?",
      a: "Scholars can renew their grants by submitting their latest Certified True Copy of Grades (TCG) and any other program-specific requirements during the announced renewal period in the Student Portal. LSO will evaluate your academic compliance before automatically renewing your discount."
    },
    {
      q: "Can I apply for multiple scholarships at the same time?",
      a: "While you may explore and submit applications for multiple grants to maximize your chances, the University generally allows only one active major scholarship discount (e.g. you cannot hold both a full academic scholarship and an athletic scholarship simultaneously) unless explicitly permitted."
    },
    {
      q: "What should I do if my document uploads are failing?",
      a: "Ensure your documents are in JPEG/JPG format and do not exceed 10MB in size. If issues persist, you can contact the Linkages and Scholarship Office (LSO) directly or visit the office on the Ground Floor of the Admin Building."
    }
  ];

  const stats = [
    { label: 'Total Scholarships', value: '15+', icon: Star },
    { label: 'Active Scholars', value: '2,500+', icon: Users },
    { label: 'Financial Aid Distributed', value: '₱45M+', icon: DollarSign },
  ];

  return (
    <div className="bg-slate-50">
      {/* 1. Hero Section */}
      <section
        id="hero"
        className="relative min-h-[85vh] flex items-center justify-center bg-cover bg-center text-white"
      style={{ backgroundImage: `linear-gradient(135deg, rgba(0, 112, 60, 0.3), rgba(0, 112, 60, 0.7)), url(${heroImage})` }}
      >
        {/* Decorative Grid Accent */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24 text-center">
          <div className="space-y-6">

            {/* Title & Slogan */}
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-tight text-white">
            Fulfill Your Dreams with <span className="text-[#00703C] bg-white px-7 py-0.5 rounded-lg">AniSkolar</span>
            </h1>
            
            <p className="text-lg text-white font-normal leading-relaxed max-w-2xl mx-auto">
              The centralized scholarship portal of DLSU-D. Discover, apply, and manage your university grants effortlessly, empowering Lasallians to create a lasting global impact.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <button
                onClick={onExploreClick}
                className="w-full sm:w-auto sm:min-w-60 font-display font-bold uppercase text-xs tracking-wider text-white bg-[#00703C]/80 hover:bg-[#005c30] px-8 py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-white/10"
              >
                <span>Explore Scholarships</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onLoginClick}
                className="w-full sm:w-auto sm:min-w-60 font-display font-bold uppercase text-xs tracking-wider text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 px-8 py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <span>Login to Access More</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. About AniSkolar */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display font-black text-3xl sm:text-4xl text-slate-950 tracking-tight mb-4">
              About AniSkolar Portal
            </h2>
            <div className="w-16 h-1 bg-brand-green mx-auto mb-6 rounded-full"></div>
            <p className="text-base text-slate-600 leading-relaxed">
              AniSkolar is the official, student-centered digital scholarship solution of De La Salle University–Dasmariñas. Managed by the Linkages and Scholarship Office (LSO), AniSkolar replaces traditional paperwork with a simple, secure, and modern online environment designed specifically for the Lasallian community.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl border border-slate-100 bg-slate-50/50 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 bg-emerald-100 text-brand-green rounded-xl flex items-center justify-center mb-6">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Centralized Exploration</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Browse every available grant, from academic and financial assistance to athletic development and leadership awards, all in one place.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-slate-100 bg-slate-50/50 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 bg-emerald-100 text-brand-green rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Transparent Evaluations</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Monitor your application status, view evaluation progress, and receive SFAG updates directly in your private dashboard.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-slate-100 bg-slate-50/50 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 bg-emerald-100 text-brand-green rounded-xl flex items-center justify-center mb-6">
                <Star className="w-6 h-6" />
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-12 gap-4">
            <div>
              <h2 className="font-display font-black text-3xl text-slate-950 tracking-tight">Available Scholarships</h2>
              <p className="text-sm text-slate-500 mt-2">Explore active grants. Log in to start your online application.</p>
            </div>
            <button
              onClick={onExploreClick}
              className="font-display font-bold text-xs uppercase tracking-wider text-brand-green hover:text-brand-green-dark flex items-center space-x-1.5 shrink-0"
            >
              <span>View All Scholarships</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mockScholarships.slice(0, 3).map((scholarship) => (
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
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display font-black text-3xl text-slate-950 tracking-tight mb-4">Simple Application Process</h2>
            <div className="w-16 h-1 bg-brand-green mx-auto mb-6 rounded-full"></div>
            <p className="text-sm text-slate-600">
              Applying for financial support at DLSU-D is straightforward. Follow these four straightforward milestones:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Explore Grants', desc: 'Browse and search our categorized scholarships and find the perfect match.' },
              { step: '02', title: 'Check Eligibility', desc: 'Review required grade averages and necessary documentation rules.' },
              { step: '03', title: 'Submit Requirements', desc: 'Log in and upload scanned digital copies of your credentials directly.' },
              { step: '04', title: 'Wait for Evaluation', desc: 'The LSO evaluates submissions; receive real-time notifications on outcomes.' }
            ].map((item, idx) => (
              <div key={idx} className="relative p-6 rounded-xl border border-slate-100 bg-slate-50/30">
                <span className="text-5xl font-display font-black text-emerald-100 block mb-4">{item.step}</span>
                <h3 className="font-display font-bold text-base text-slate-900 mb-2">{item.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Latest Announcements Preview */}
      <section id="announcements" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display font-black text-3xl text-slate-950 tracking-tight mb-4">Latest Scholarship Announcements</h2>
            <div className="w-16 h-1 bg-brand-green mx-auto mb-6 rounded-full"></div>
            <p className="text-sm text-slate-600">Stay up to date with key scholarship announcements, deadlines, and requirements.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {mockAnnouncements.slice(0, 2).map((ann) => (
              <div key={ann.id} className="bg-white p-6 rounded-xl border border-slate-100 card-shadow">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-brand-green border border-emerald-100 font-bold">{ann.category}</span>
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{ann.date}</span>
                  </div>
                </div>
                <h3 className="font-display font-bold text-base text-slate-900 mb-2">{ann.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-3 mb-4 leading-relaxed">{ann.description}</p>
                <button
                  onClick={onLoginClick}
                  className="text-xs font-semibold text-brand-green hover:text-brand-green-dark flex items-center space-x-1.5 focus:outline-hidden"
                >
                  <span>Read details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Frequently Asked Questions */}
      <section id="faqs" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-display font-black text-3xl text-slate-950 tracking-tight mb-4 flex items-center justify-center gap-2">
              <HelpCircle className="w-8 h-8 text-brand-green" />
              <span>Frequently Asked Questions</span>
            </h2>
            <p className="text-sm text-slate-500">Quick answers to common questions about scholarships and AniSkolar portal.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-xl border border-slate-100 card-shadow transition-colors overflow-hidden ${
                    isOpen ? 'border-brand-green/30 bg-slate-50/50' : 'hover:border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex justify-between items-center focus:outline-hidden"
                  >
                    <span className="font-display font-bold text-sm sm:text-base text-slate-800 leading-snug">
                      {faq.q}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-brand-green shrink-0 ml-4" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 ml-4" />
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="p-5 pt-0 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100">
                          {faq.a}
                        </div>
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
