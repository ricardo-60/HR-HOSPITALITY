'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HoloTableMap } from '@/components/pos/HoloTableMap';
import { ShoppingBag, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function POSPage() {
    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-12 md:space-y-16 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-[#111111] p-8 md:p-12 lg:p-16 rounded-[32px] md:rounded-[40px] lg:rounded-[60px] border border-white/10 flex flex-col lg:flex-row justify-between items-center gap-10 relative overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-[var(--brand-secondary)]/5 blur-[80px] md:blur-[120px] -mr-32 -mt-32 md:-mr-48 md:-mt-48" />

                    <div className="relative z-10 text-center lg:text-left w-full lg:w-auto">
                        <div className="flex items-center justify-center lg:justify-start gap-4 mb-6 md:mb-8">
                            <div className="w-2 h-2 rounded-full bg-[var(--brand-secondary)] shadow-[0_0_10px_var(--brand-secondary)] animate-pulse" />
                            <span className="text-[9px] md:text-[10px] font-black text-white/50 uppercase tracking-[0.4em] md:tracking-[0.6em] truncate">Professional Station Active</span>
                        </div>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-[#FFFFFF] tracking-tighter leading-tight uppercase stroke-white/20 flex flex-col sm:flex-row sm:gap-4 justify-center lg:justify-start">
                            <span>GASTRO</span> <span className="text-[var(--brand-secondary)] drop-shadow-[0_0_15px_var(--brand-secondary)]">STATION</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.4em] md:tracking-[0.8em] text-[9px] md:text-[11px] mt-6 md:mt-8 max-w-lg leading-relaxed mx-auto lg:mx-0">
                            HR-HOSPITALITY ADVANCED POINT OF SALE CONTROL
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 md:gap-6 relative z-10 w-full lg:w-auto">
                        <div className="bg-black/60 border border-white/5 rounded-[32px] md:rounded-[40px] p-6 md:p-10 flex flex-col items-center justify-center min-w-[160px] md:min-w-[200px] shadow-2xl flex-1 sm:flex-auto">
                            <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.4em] mb-2 md:mb-4 text-center">Pending Tasks</p>
                            <p className="text-4xl md:text-5xl font-black text-[#FFFFFF] tracking-tighter tabular-nums">08</p>
                        </div>
                        <div className="bg-[var(--brand-secondary)] shadow-[0_20px_40px_rgba(255,215,0,0.2)] rounded-[32px] md:rounded-[40px] p-6 md:p-10 flex flex-col items-center justify-center min-w-[160px] md:min-w-[200px] hover:scale-105 transition-all cursor-pointer flex-1 sm:flex-auto">
                            <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 text-black mb-2 md:mb-4" />
                            <p className="text-[9px] md:text-[11px] font-black text-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-center">New Order</p>
                        </div>
                    </div>
                </motion.div>

                {/* Restaurante Vista */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[300px] md:h-[400px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group">
                    <div className="absolute inset-0 bg-black/50 z-10 group-hover:bg-black/30 transition-all duration-700 pointer-events-none" />
                    <Image 
                        src="/images/Snak bar.jpg" 
                        alt="Snack Bar / Restaurante" 
                        fill 
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                    />
                    <div className="absolute top-8 right-8 z-20 px-4 py-2 bg-black/50 backdrop-blur-md border border-[var(--brand-secondary)]/20 rounded-full">
                        <span className="text-[var(--brand-secondary)] font-black text-[9px] uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--brand-secondary)] animate-pulse shadow-[0_0_10px_var(--brand-secondary)]"></span>
                            Live View
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-10 md:p-14 bg-gradient-to-t from-[#111111] via-[#111111]/80 to-transparent z-20">
                        <span className="text-[var(--brand-secondary)] font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-3 block drop-shadow-[0_0_8px_var(--brand-secondary)]">Gastronomia Premium</span>
                        <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter drop-shadow-lg">Lounge & Snack Bar</h2>
                    </div>
                </motion.div>

                <div className="flex flex-col sm:flex-row justify-between items-center px-4 md:px-10 border-b border-white/5 pb-6 md:pb-8 gap-4 overflow-x-auto no-scrollbar">
                    <div className="flex gap-6 md:gap-10 min-w-max">
                        <button className="btn-base btn-ghost btn-sm text-[var(--brand-secondary)] relative font-black uppercase tracking-widest text-[10px] md:text-xs">
                            Main Gastro Hall
                            <motion.div layoutId="posNav" className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--brand-secondary)] rounded-full drop-shadow-[0_0_8px_var(--brand-secondary)]" />
                        </button>
                        <button className="btn-base btn-ghost btn-sm text-[10px] md:text-xs font-black uppercase tracking-widest text-white/40 hover:text-[var(--brand-secondary)] transition-colors">Executive Lounge</button>
                        <button className="btn-base btn-ghost btn-sm text-[10px] md:text-xs font-black uppercase tracking-widest text-white/40 hover:text-[var(--brand-secondary)] transition-colors">External Deck</button>
                    </div>
                </div>

                <HoloTableMap />
            </div>
        </DashboardLayout>
    );
}
