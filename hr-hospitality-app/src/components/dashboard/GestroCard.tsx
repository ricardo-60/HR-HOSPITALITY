'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface GestroCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    color?: string;
    isCyber?: boolean;
}

export function GestroCard({ label, value, icon: Icon, trend, color = "#00FFFF", isCyber = true }: GestroCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -6, scale: 1.01 }}
            className="glass-card p-5 md:p-6 lg:p-8 rounded-[24px] md:rounded-[32px] group relative overflow-hidden h-full flex flex-col justify-between"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex justify-between items-start mb-8 md:mb-12 relative z-10">
                <div className="space-y-2 md:space-y-4 max-w-[70%]">
                    <p className="text-xs md:text-sm lg:text-base font-black text-white/40 uppercase tracking-luxury group-hover:text-white/60 transition-colors truncate">
                        {label}
                    </p>
                    <p className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white tracking-tighter tabular-nums leading-none">
                        {value}
                    </p>
                </div>

                <div className="p-4 md:p-5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10 group-hover:border-[currentColor] transition-all" style={{ color: color }}>
                    <Icon className="w-8 h-8 md:w-10 md:h-10 transition-transform group-hover:scale-110 group-hover:rotate-6" />
                </div>
            </div>

            <div className="flex items-center gap-3 md:gap-4 relative z-10 mt-auto">
                <div className="h-1.5 w-8 md:w-10 rounded-full bg-[currentColor] shadow-[0_0_10px_currentColor] animate-pulse" style={{ color: color }} />
                <span className="text-[10px] md:text-xs lg:text-sm font-black text-white/20 uppercase tracking-widest truncate">{trend || 'SYSTEM ACTIVE'}</span>
            </div>

            {/* Decorative Neon Trace */}
            <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-transparent via-[currentColor] to-transparent opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: color }} />
        </motion.div>
    );
}
