import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  trend?: {
    text: string;
    type: 'positive' | 'negative' | 'neutral';
  };
  color?: string;
  onClick?: () => void;
  id?: string;
}

export default function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color = 'border-slate-100 bg-white hover:border-slate-200 card-shadow',
  onClick,
  id
}: DashboardCardProps) {
  return (
    <motion.div
      id={id}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`p-5 rounded-xl border transition-all cursor-pointer ${color} flex flex-col justify-between`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-3xl font-display font-extrabold text-brand-green mt-1.5">{value}</h3>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg text-slate-500">
          <Icon className="w-5 h-5 text-brand-green" />
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-600 font-medium">{description}</p>
        {trend && (
          <span
            className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
              trend.type === 'positive'
                ? 'bg-emerald-100 text-emerald-800'
                : trend.type === 'negative'
                ? 'bg-rose-100 text-rose-800'
                : 'bg-slate-100 text-slate-800'
            }`}
          >
            {trend.text}
          </span>
        )}
      </div>
    </motion.div>
  );
}
