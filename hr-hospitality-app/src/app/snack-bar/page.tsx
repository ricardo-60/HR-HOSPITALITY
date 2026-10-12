'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QuickSale } from '@/components/pos/QuickSale';
import { HoloTableMap } from '@/components/pos/HoloTableMap';
import { Zap, Search, Filter, Table as TableIcon, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const snackAreas = ['Interior Deck', 'Pool Area'];

export default function SnackBarPage() {
    const [activeArea, setActiveArea] = useState(snackAreas[0]);
    const [mesaSelecionada, setMesaSelecionada] = useState<{ id: string; name: string } | null>(null);

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-10 border-b border-white/5 pb-10"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="px-4 py-1.5 bg-[var(--brand-accent)] rounded-r-lg shadow-[0_0_15px_var(--brand-accent)]">
                                <span className="text-[10px] md:text-xs font-black text-black uppercase tracking-[0.5em]">Rapid Terminal Active</span>
                            </div>
                        </div>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-[#FFFFFF] tracking-tighter leading-none uppercase flex flex-col sm:flex-row sm:gap-4 justify-center md:justify-start">
                            <span>SNACK</span> <span className="text-[var(--brand-accent)] drop-shadow-[0_0_15px_var(--brand-accent)]">BAR</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.4em] md:tracking-[0.6em] text-[9px] md:text-[10px] mt-6 md:mt-8">HR-HOSPITALITY Operational High-Speed Protocol</p>
                    </div>

                    <div className="bg-[#111111] border border-white/10 p-5 md:p-6 rounded-[24px] md:rounded-[32px] flex items-center gap-6 md:gap-8 shadow-2xl w-full md:w-auto mt-6 md:mt-0">
                        <div className="text-right flex-1 md:flex-none">
                            <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.3em] md:tracking-[0.4em] mb-1">Live Occupancy</p>
                            <p className="text-3xl md:text-4xl font-black text-white tracking-tighter">50%</p>
                        </div>
                        <div className="w-[2px] h-10 md:h-12 bg-white/5 hidden md:block" />
                        <div className="p-4 bg-[var(--brand-secondary)]/10 border border-[var(--brand-secondary)]/20 rounded-xl md:rounded-2xl">
                            <Zap className="w-6 h-6 text-[var(--brand-secondary)] drop-shadow-[0_0_10px_var(--brand-secondary)] animate-pulse" />
                        </div>
                    </div>
                </motion.div>

                {/* Seleção de Área */}
                <div className="flex justify-between items-center bg-[#111111] px-5 md:px-6 py-3 md:py-4 rounded-full border border-white/10 shadow-lg hidden md:flex">
                    <div className="flex gap-6 md:gap-8">
                        {snackAreas.map((area) => (
                            <button key={area} onClick={() => setActiveArea(area)}
                                className={`btn-base btn-ghost btn-sm relative font-black uppercase tracking-widest transition-colors ${
                                    activeArea === area ? 'text-[var(--brand-accent)]' : 'text-white/40 hover:text-[var(--brand-primary)]'
                                }`}>
                                {area}
                                {activeArea === area && (
                                    <motion.div layoutId="snackNav" className="absolute -bottom-2 left-0 right-0 h-1 bg-[var(--brand-accent)] rounded-full drop-shadow-[0_0_8px_var(--brand-accent)]" />
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-6">
                        <Search className="w-5 h-5 text-white/20 cursor-pointer hover:text-[var(--brand-accent)] transition-all" />
                        <Filter className="w-5 h-5 text-white/20 cursor-pointer hover:text-[var(--brand-accent)] transition-all" />
                    </div>
                </div>

                {/* Cabeçalho/Legenda da grelha */}
                <AnimatePresence mode="wait">
                    <motion.div key={activeArea}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-white/[0.02] border border-[var(--brand-accent)]/20 rounded-2xl"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-[var(--brand-accent)] animate-pulse shadow-[0_0_10px_var(--brand-accent)]" />
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.4em]">Grelha de Mesas — {activeArea}</span>
                        </div>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">
                            {activeArea === 'Interior Deck' ? 'Zona interior • Serviço rápido em sala' : 'Zona da piscina • Serviço exterior'}
                        </span>
                    </motion.div>
                </AnimatePresence>

                {/* LAYOUT PRINCIPAL — Mapa de Mesas (Obrigatório) + QuickSale (Condicional) */}
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-10 md:gap-16 items-start">
                    {/* Lado Esquerdo — MAPA DE MESAS (OBRIGATÓRIO — Sempre Visível) */}
                    <div className="w-full lg:col-span-7 space-y-8 md:space-y-12">
                        {/* Legenda da área ativa */}
                        <AnimatePresence mode="wait">
                            <motion.div key={activeArea}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.25 }}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-white/[0.02] border border-[var(--brand-accent)]/20 rounded-2xl"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="w-2 h-2 rounded-full bg-[var(--brand-accent)] animate-pulse shadow-[0_0_10px_var(--brand-accent)]" />
                                    <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.4em]">Grelha de Mesas — {activeArea}</span>
                                </div>
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">
                                    {activeArea === 'Interior Deck' ? 'Zona interior • Serviço rápido em sala' : 'Zona da piscina • Serviço exterior'}
                                </span>
                            </motion.div>
                        </AnimatePresence>

                        {/* MAPA DE MESAS — SEMPRE VISÍVEL, FLUXO OBRIGATÓRIO */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-6"
                        >
                            <div className="bg-[#111111] border border-[var(--brand-accent)]/20 rounded-2xl p-4 md:p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 rounded-xl">
                                            <TableIcon className="w-5 h-5 text-[var(--brand-accent)]" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-white/50 uppercase tracking-wider">Mapa de Mesas — {activeArea}</p>
                                            <p className="text-white/40 text-sm">Selecione uma mesa para iniciar o atendimento</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-green-400 text-[10px] font-black uppercase tracking-wider">
                                            FLUXO OBRIGATÓRIO
                                        </span>
                                    </div>
                                </div>

                                {/* HoloTableMap integrado — gerencia seleção de mesa */}
                                <HoloTableMap 
                                    onTableSelect={(mesa) => { 
                                        console.log('[SnackBar] Mesa selecionada:', mesa?.name || 'nenhuma');
                                        setMesaSelecionada(mesa ? { id: mesa.id, name: mesa.name } : null);
                                    }} 
                                />
                            </div>
                        </motion.div>
                    </div>

                    {/* Lado Direito — QuickSale (SÓ APARECE COM MESA SELECIONADA) */}
                    <div className="w-full lg:col-span-5">
                        <AnimatePresence mode="wait">
                            {/* QuickSale / Venda Rápida — SÓ APARECE COM MESA SELECIONADA */}
                            {mesaSelecionada ? (
                                <motion.div
                                    key="quicksale"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-[#111111] border border-[var(--brand-accent)]/20 rounded-[24px] md:rounded-[32px] p-5 md:p-6 lg:p-8 h-full flex flex-col shadow-[0_50px_100px_rgba(0,0,0,1)] relative overflow-hidden"
                                >
                                    <QuickSale />
                                </motion.div>
                            ) : (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="bg-[#111111] border border-[var(--brand-accent)]/20 rounded-[24px] md:rounded-[32px] p-5 md:p-6 lg:p-8 h-[600px] md:h-[700px] lg:h-full flex flex-col items-center justify-center shadow-[0_50px_100px_rgba(0,0,0,1)] relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 bg-[var(--brand-accent)]/5 blur-[100px] -mr-16 -mt-16 md:-mr-24 md:-mt-24 pointer-events-none" />
                                <div className="text-center relative z-10">
                                    <div className="p-4 bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 rounded-2xl inline-block mb-6">
                                        <TableIcon className="w-12 h-12 text-[var(--brand-accent)]" />
                                    </div>
                                    <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-3">Selecione uma Mesa</h3>
                                    <p className="text-white/50 max-w-sm mx-auto mb-6">
                                        O fluxo de vendas exige que uma mesa seja selecionada no mapa à esquerda antes de lançar itens.
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm font-black">
                                            <CheckCircle className="w-5 h-5 inline mr-2" /> Mesa Livre — Abrir Nova Comanda
                                        </div>
                                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-black">
                                            <AlertCircle className="w-5 h-5 inline mr-2" /> Mesa Ocupada — Ver Conta / Fechar
                                        </div>
                                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm font-black">
                                            <Loader2 className="w-5 h-5 inline mr-2" /> Reservada / Manutenção — Indisponível
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}