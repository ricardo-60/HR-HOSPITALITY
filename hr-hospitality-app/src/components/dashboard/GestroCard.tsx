/* eslint-disable */
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
    // Valores-texto longos (ex.: "ONLINE") usam escala menor para nunca serem cortados
    const isLongText = String(value).length > 4;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -6, scale: 1.01 }}
            className="glass-card p-5 md:p-6 lg:p-8 rounded-[24px] md:rounded-[32px] group relative overflow-hidden h-full flex flex-col justify-between gap-4"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Linha 1: label + ícone (label quebra linha em vez de ser cortado) */}
            <div className="flex justify-between items-start gap-3 relative z-10">
                <p className="text-xs md:text-sm lg:text-base font-black text-white/40 uppercase tracking-luxury group-hover:text-white/60 transition-colors leading-tight min-w-0 break-words">
                    {label}
                </p>

                <div className="p-3 md:p-4 bg-white/5 rounded-xl md:rounded-2xl border border-white/10 shrink-0 group-hover:border-[currentColor] transition-all" style={{ color: color }}>
                    <Icon className="w-7 h-7 md:w-8 md:h-8 transition-transform group-hover:scale-110 group-hover:rotate-6" />
                </div>
            </div>

            {/* Linha 2: valor em largura total (sem colisão com o ícone) */}
            <p className={`relative z-10 font-black text-white tracking-tighter tabular-nums leading-none ${isLongText
                ? 'text-2xl md:text-3xl lg:text-4xl'
                : 'text-4xl md:text-5xl lg:text-6xl xl:text-7xl'
                }`}>
                {value}
            </p>

            {/* Linha 3: trend (quebra linha em vez de reticências) */}
            <div className="flex items-center gap-3 md:gap-4 relative z-10 mt-auto">
                <div className="h-1.5 w-8 md:w-10 shrink-0 rounded-full bg-[currentColor] shadow-[0_0_10px_currentColor] animate-pulse" style={{ color: color }} />
                <span className="text-[10px] md:text-xs lg:text-sm font-black text-white/20 uppercase tracking-wider leading-tight">{trend || 'SYSTEM ACTIVE'}</span>
            </div>

            {/* Decorative Neon Trace */}
            <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-transparent via-[currentColor] to-transparent opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: color }} />
        </motion.div>
    );
}
