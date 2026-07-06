import React from 'react';
import { Mail, Phone, MapPin, ExternalLink, ShieldCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer id="main-footer" className="bg-slate-900 text-slate-300 pt-16 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-1" id="footer-brand">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center font-display font-bold text-white text-lg shadow-md">
                AS
              </div>
              <div>
                <span className="font-display font-bold text-xl text-white tracking-tight">AniSkolar</span>
                <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">DLSU-D Portal</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Providing modern, streamlined scholarship access for Lasallians. Bridging dreams with opportunities for a brighter tomorrow.
            </p>
            <div className="flex items-center space-x-2 text-xs text-brand-green font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>SFAO Certified Official Portal</span>
            </div>
          </div>

          {/* Quick Links */}
          <div id="footer-links-quick">
            <h3 className="font-display font-semibold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#about" className="hover:text-brand-green transition-colors text-slate-400">About AniSkolar</a>
              </li>
              <li>
                <a href="#scholarships" className="hover:text-brand-green transition-colors text-slate-400">Available Grants</a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-brand-green transition-colors text-slate-400">Application Process</a>
              </li>
              <li>
                <a href="#faqs" className="hover:text-brand-green transition-colors text-slate-400">Frequently Asked Questions</a>
              </li>
            </ul>
          </div>

          {/* External Links */}
          <div id="footer-links-univ">
            <h3 className="font-display font-semibold text-white mb-4 text-sm uppercase tracking-wider">University Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://www.dlsud.edu.ph" target="_blank" rel="noopener noreferrer" className="hover:text-brand-green transition-colors flex items-center space-x-1 text-slate-400">
                  <span>Official DLSU-D Website</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
              <li>
                <a href="https://dlsud.edu.ph/sfao" target="_blank" rel="noopener noreferrer" className="hover:text-brand-green transition-colors flex items-center space-x-1 text-slate-400">
                  <span>SFAO Web Office</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-green transition-colors text-slate-400">Student Portal (OSRP)</a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-green transition-colors text-slate-400">University Registrar</a>
              </li>
            </ul>
          </div>

          {/* Contact SFAO */}
          <div id="footer-contact">
            <h3 className="font-display font-semibold text-white mb-4 text-sm uppercase tracking-wider">Contact SFAO</h3>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-brand-green shrink-0 mt-1" />
                <span>Scholarship & Financial Assistance Office, Ground Floor, Admin Building, DLSU-D, Dasmariñas, Cavite, PH</span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-brand-green shrink-0" />
                <span>+63 (46) 481-1900 ext. 4015</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-brand-green shrink-0" />
                <span>sfao@dlsud.edu.ph</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 text-center flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500">
          <p id="copyright">
            © {new Date().getFullYear()} De La Salle University–Dasmariñas. All Rights Reserved.
          </p>
          <p className="mt-2 sm:mt-0 flex items-center justify-center space-x-1">
            <span>Designed for Capstone</span>
            <span className="text-brand-green font-semibold">Animo La Salle!</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
