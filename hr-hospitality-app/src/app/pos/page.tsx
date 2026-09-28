/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HoloTableMap } from '@/components/pos/HoloTableMap';
import { ChefHat, ShoppingBag, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

const posAreas = ['Main Gastro Hall', 'Executive Lounge', 'External Deck'];

export default function POSPage() {
    const [activeArea, setActiveArea] = useState(posAreas[0]);
    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-12 md:space-y-16 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-[#111111] p-8 md:p-12 lg:p-16 rounded-[32px] md:rounded-[40px] lg:rounded-[60px] border border-white/10 flex flex-col lg:flex-row lg:flex-wrap justify-between items-center gap-10 relative overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
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

                    <div className="flex flex-col sm:flex-row gap-4 md:gap-6 relative z-10 w-full lg:w-auto lg:ml-auto">
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

                {/* Gestão de produtos — entrada em destaque para /pos/produtos */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-6 md:px-10 py-7 rounded-[32px] md:rounded-[44px] bg-[#111111] border border-[var(--brand-secondary)]/25 shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--brand-secondary)]/5 blur-[100px] -mr-24 -mt-24 pointer-events-none" />
                    <div className="flex items-center gap-5 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--brand-secondary)]/10 border border-[var(--brand-secondary)]/35 flex items-center justify-center shrink-0">
                            <ChefHat className="w-7 h-7 text-[var(--brand-secondary)]" />
                        </div>
                        <div>
                            <p className="text-[9px] md:text-[10px] font-black text-[var(--brand-secondary)] uppercase tracking-[0.4em] mb-1.5">
                                Catálogo do POS
                            </p>
                            <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter">
                                Gerir Produtos e Stock
                            </h2>
                            <p className="text-xs md:text-sm text-white/40 mt-1.5 max-w-xl leading-relaxed">
                                Registar pratos novos, ajustar preços, ligar artigos ao economato e importar entradas do
                                catálogo mestre — incluindo os produtos em rutura, que ficam ocultos só na caixa.
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/pos/produtos"
                        className="relative z-10 shrink-0 flex items-center justify-center gap-2 px-7 py-4 rounded-[24px] bg-[var(--brand-secondary)] text-black text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(255,215,0,0.2)] hover:scale-105 transition-transform"
                    >
                        <ShoppingBag className="w-4 h-4" />
                        Abrir gestão de produtos
                    </Link>
                </motion.div>

                {/* Restaurante Vista */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[300px] md:h-[400px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group">
                    <div className="absolute inset-0 bg-black/50 z-10 group-hover:bg-black/30 transition-all duration-700 pointer-events-none" />
                    <Image 
                        src="/images/snak-bar.jpg" 
                        alt="Snack Bar / Restaurante" 
                        fill 
                        priority
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
                        {posAreas.map((area) => (
                            <button key={area} onClick={() => setActiveArea(area)}
                                className={`btn-base btn-ghost btn-sm relative font-black uppercase tracking-widest text-[10px] md:text-xs transition-colors ${
                                    activeArea === area ? 'text-[var(--brand-secondary)]' : 'text-white/40 hover:text-[var(--brand-secondary)]'
                                }`}>
                                {area}
                                {activeArea === area && (
                                    <motion.div layoutId="posNav" className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--brand-secondary)] rounded-full drop-shadow-[0_0_8px_var(--brand-secondary)]" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Legenda da área ativa — reflexo visível do separador escolhido */}
                <AnimatePresence mode="wait">
                    <motion.div key={activeArea}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 md:px-6 py-4 bg-white/[0.02] border border-[var(--brand-secondary)]/20 rounded-2xl"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-[var(--brand-secondary)] animate-pulse shadow-[0_0_10px_var(--brand-secondary)]" />
                            <span className="text-[10px] font-black text-[var(--brand-secondary)] uppercase tracking-[0.4em]">Mapa de Mesas — {activeArea}</span>
                        </div>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">
                            {activeArea === 'Main Gastro Hall' ? 'Salão principal • 6 mesas ativas' :
                             activeArea === 'Executive Lounge' ? 'Lounge executivo • Mesa reservadas & VIP' :
                             'Esplanada externa • Serviço ao ar livre'}
                        </span>
                    </motion.div>
                </AnimatePresence>

                <HoloTableMap />
            </div>
        </DashboardLayout>
    );
}
