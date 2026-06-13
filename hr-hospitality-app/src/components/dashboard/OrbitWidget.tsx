'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface OrbitWidgetProps {
    label: string;
    percentage: number;
    color: string;
    icon: LucideIcon;
}

export function OrbitWidget({ label, percentage, color, icon: Icon }: OrbitWidgetProps) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative flex flex-col items-center justify-center p-12 bg-[#111111] border border-white/10 rounded-[50px] group hover:border-[#00F2FF]/40 transition-all duration-500 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-3xl -mr-12 -mt-12" />

            <div className="relative w-36 h-36">
                {/* Track */}
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="72"
                        cy="72"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="10"
                        fill="transparent"
                        className="text-white/[0.03]"
                    />
                    {/* Progress */}
                    <motion.circle
                        cx="72"
                        cy="72"
                        r={radius}
                        stroke={color}
                        strokeWidth="10"
                        fill="transparent"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                        strokeLinecap="round"
                        className="drop-shadow-[0_0_12px_var(--tw-shadow-color)]"
                        style={{ '--tw-shadow-color': color } as any}
                    />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="p-4 bg-black/60 rounded-2xl border border-white/5 mb-2 shadow-inner group-hover:border-[#00F2FF]/30 transition-all"
                    >
                        <Icon className="w-6 h-6 transition-all group-hover:scale-110" style={{ color }} />
                    </motion.div>
                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums">{percentage}%</span>
                </div>
            </div>

            <div className="mt-10 text-center w-full">
                <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/30 mb-4 group-hover:text-white transition-colors">
                    {label}
                </p>
                <div className="h-[2px] w-16 bg-white/5 mx-auto rounded-full overflow-hidden">
                    <motion.div
                        initial={{ translateZ: 0 }}
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="h-full w-full"
                        style={{ backgroundColor: color }}
                    />
                </div>
            </div>
        </div>
    );
}
