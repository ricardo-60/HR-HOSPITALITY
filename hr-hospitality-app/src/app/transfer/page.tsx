/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, MapPin, Clock, User, Phone, CheckCircle2, Circle, Plus, Navigation } from 'lucide-react';
import { useState } from 'react';

interface Transfer {
    id: string;
    guest: string;
    room: string;
    from: string;
    to: string;
    time: string;
    driver: string;
    vehicle: string;
    status: 'AGENDADO' | 'EM CURSO' | 'CONCLUÍDO' | 'CANCELADO';
    type: 'AEROPORTO' | 'HOTEL' | 'CITY TOUR' | 'EXECUTIVO';
}

const transfers: Transfer[] = [
    { id: 'TRF-001', guest: 'Carlos Mendes', room: '101', from: 'Hotel Lukweku', to: 'Aeroporto Internacional', time: '06:30', driver: 'António Silva', vehicle: 'Toyota Land Cruiser', status: 'CONCLUÍDO', type: 'AEROPORTO' },
    { id: 'TRF-002', guest: 'Maria Santos', room: '205', from: 'Aeroporto Internacional', to: 'Hotel Lukweku', time: '10:15', driver: 'José Ferreira', vehicle: 'Mercedes E-Class', status: 'EM CURSO', type: 'AEROPORTO' },
    { id: 'TRF-003', guest: 'João Baptista', room: '312', from: 'Hotel Lukweku', to: 'Mausoléo António Agostinho Neto', time: '14:00', driver: 'Carlos Gomes', vehicle: 'Land Rover Defender', status: 'AGENDADO', type: 'CITY TOUR' },
    { id: 'TRF-004', guest: 'Ana Rodrigues', room: '108', from: 'Hotel Lukweku', to: 'Talatona Convention Center', time: '15:30', driver: 'Miguel Sousa', vehicle: 'Mercedes S-Class', status: 'AGENDADO', type: 'EXECUTIVO' },
    { id: 'TRF-005', guest: 'Pedro Alves', room: '401', from: 'Hotel Lukweku', to: 'Shopping Belas Mall', time: '16:00', driver: 'Rafael Costa', vehicle: 'Toyota Land Cruiser', status: 'AGENDADO', type: 'CITY TOUR' },
];

const statusConfig = {
    'AGENDADO':   { color: 'text-[var(--brand-secondary)] border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/10', dot: 'bg-[var(--brand-secondary)]' },
    'EM CURSO':   { color: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10', dot: 'bg-cyan-400 animate-pulse' },
    'CONCLUÍDO':  { color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10', dot: 'bg-emerald-400' },
    'CANCELADO':  { color: 'text-red-400 border-red-400/30 bg-red-400/10', dot: 'bg-red-400' },
};

const typeConfig = {
    'AEROPORTO': 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    'HOTEL':     'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    'CITY TOUR': 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    'EXECUTIVO': 'text-purple-400 border-purple-400/30 bg-purple-400/10',
};

export default function TransferPage() {
    const [activeFilter, setActiveFilter] = useState<string>('TODOS');
    const filters = ['TODOS', 'AGENDADO', 'EM CURSO', 'CONCLUÍDO'];

    const agendados = transfers.filter(t => t.status === 'AGENDADO').length;
    const emCurso = transfers.filter(t => t.status === 'EM CURSO').length;
    const concluidos = transfers.filter(t => t.status === 'CONCLUÍDO').length;

    const filtered = activeFilter === 'TODOS' ? transfers : transfers.filter(t => t.status === activeFilter);

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-14 pb-20 px-4">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-10 border-b border-white/5 pb-14">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-1.5 h-6 bg-[var(--brand-secondary)] shadow-[0_0_15px_var(--brand-secondary)]" />
                            <span className="text-[10px] font-black text-[var(--brand-secondary)] uppercase tracking-[0.6em]">VIP Transfer • Security Protocol</span>
                        </div>
                        <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            TRANS<span className="text-[var(--brand-secondary)]">FER</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-8 max-w-lg leading-relaxed">
                            HR-HOSPITALITY VIP GROUND TRANSPORTATION MANAGEMENT
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex gap-4">
                            {[
                                { label: 'Agendados', value: agendados, color: 'text-[var(--brand-secondary)]' },
                                { label: 'Em Curso', value: emCurso, color: 'text-cyan-400' },
                                { label: 'Concluídos', value: concluidos, color: 'text-emerald-400' },
                            ].map((s, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl text-center">
                                    <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mt-1">{s.label}</p>
                                </div>
                            ))}
                        </div>
                        <button className="flex items-center gap-3 px-8 py-5 bg-[var(--brand-secondary)] text-black font-black text-[10px] uppercase tracking-[0.4em] rounded-[24px] hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,215,0,0.3)]">
                            <Plus className="w-4 h-4" /> Novo Transfer
                        </button>
                    </div>
                </motion.div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-3">
                    {filters.map(f => (
                        <button key={f} onClick={() => setActiveFilter(f)}
                            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeFilter === f
                                    ? 'bg-[var(--brand-secondary)] text-black shadow-[0_0_20px_rgba(255,215,0,0.3)]'
                                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'
                            }`}>{f}</button>
                    ))}
                </div>

                {/* Transfer Cards */}
                <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((t, i) => {
                            const scfg = statusConfig[t.status];
                            return (
                                <motion.div key={t.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: 0.04 * i }}
                                    className="glass-panel rounded-[28px] border border-white/10 p-6 md:p-8 hover:border-white/20 transition-all group"
                                >
                                    <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                                        {/* ID + Type */}
                                        <div className="flex items-center gap-4 min-w-[200px]">
                                            <div className={`p-3 rounded-xl border ${typeConfig[t.type]}`}>
                                                <Car className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-white tracking-widest">{t.id}</p>
                                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${typeConfig[t.type]}`}>{t.type}</span>
                                            </div>
                                        </div>

                                        {/* Guest */}
                                        <div className="min-w-[180px]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="w-3 h-3 text-white/20" />
                                                <p className="text-sm font-black text-white uppercase tracking-tight">{t.guest}</p>
                                            </div>
                                            <p className="text-[10px] font-black text-white/30 uppercase">Quarto {t.room}</p>
                                        </div>

                                        {/* Route */}
                                        <div className="flex-1">
                                            <div className="flex items-start gap-3">
                                                <div className="flex flex-col items-center gap-1 mt-1">
                                                    <Circle className="w-3 h-3 text-[var(--brand-secondary)] fill-current" />
                                                    <div className="w-px h-6 bg-white/10" />
                                                    <MapPin className="w-3 h-3 text-cyan-400" />
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[10px] font-black text-white/50 uppercase">{t.from}</p>
                                                    <p className="text-[10px] font-black text-cyan-400 uppercase">{t.to}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Driver + Time */}
                                        <div className="text-right">
                                            <div className="flex items-center gap-2 justify-end mb-1">
                                                <Clock className="w-3 h-3 text-white/20" />
                                                <p className="text-lg font-black text-white tabular-nums">{t.time}</p>
                                            </div>
                                            <p className="text-[10px] font-black text-white/30 uppercase">{t.driver}</p>
                                            <p className="text-[9px] font-black text-white/20 uppercase">{t.vehicle}</p>
                                        </div>

                                        {/* Status */}
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${scfg.color}`}>
                                            <div className={`w-2 h-2 rounded-full ${scfg.dot}`} />
                                            {t.status}
                                        </div>

                                        {/* Action */}
                                        {t.status === 'AGENDADO' && (
                                            <button className="flex items-center gap-2 px-5 py-2 bg-cyan-400 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] whitespace-nowrap">
                                                <Navigation className="w-3 h-3" /> Iniciar
                                            </button>
                                        )}
                                        {t.status === 'EM CURSO' && (
                                            <button className="flex items-center gap-2 px-5 py-2 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all whitespace-nowrap">
                                                <CheckCircle2 className="w-3 h-3" /> Concluir
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Fleet Status */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="glass-panel rounded-[32px] border border-white/10 p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-1.5 h-5 bg-[var(--brand-secondary)]" />
                        <h3 className="text-lg font-black text-white uppercase tracking-tighter">Frota Disponível</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {[
                            { vehicle: 'Toyota Land Cruiser', plate: 'LD-88-20-AB', status: 'EM SERVIÇO' },
                            { vehicle: 'Mercedes E-Class', plate: 'LD-45-12-CD', status: 'EM SERVIÇO' },
                            { vehicle: 'Mercedes S-Class', plate: 'LD-33-97-EF', status: 'DISPONÍVEL' },
                            { vehicle: 'Land Rover Defender', plate: 'LD-71-55-GH', status: 'DISPONÍVEL' },
                            { vehicle: 'Toyota Land Cruiser', plate: 'LD-22-08-IJ', status: 'MANUTENÇÃO' },
                        ].map((v, i) => (
                            <div key={i} className={`p-4 rounded-[20px] border text-center ${
                                v.status === 'DISPONÍVEL' ? 'border-emerald-500/30 bg-emerald-500/5' :
                                v.status === 'EM SERVIÇO' ? 'border-cyan-400/30 bg-cyan-400/5' :
                                'border-red-500/30 bg-red-500/5'
                            }`}>
                                <Car className={`w-8 h-8 mx-auto mb-3 ${
                                    v.status === 'DISPONÍVEL' ? 'text-emerald-400' :
                                    v.status === 'EM SERVIÇO' ? 'text-cyan-400' : 'text-red-400'
                                }`} />
                                <p className="text-[9px] font-black text-white uppercase tracking-wide leading-tight mb-1">{v.vehicle}</p>
                                <p className="text-[8px] font-black text-white/30 uppercase">{v.plate}</p>
                                <p className={`text-[8px] font-black uppercase mt-2 ${
                                    v.status === 'DISPONÍVEL' ? 'text-emerald-400' :
                                    v.status === 'EM SERVIÇO' ? 'text-cyan-400' : 'text-red-400'
                                }`}>{v.status}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
