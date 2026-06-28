'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Car, ShieldCheck, Camera, MapPin, Clock, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

const parkingSlots = [
    { id: 'A-01', plate: 'LD-12-34-AB', status: 'OCUPADO', entryTime: '08:30', type: 'HÓSPEDE' },
    { id: 'A-02', plate: 'LD-56-78-CD', status: 'OCUPADO', entryTime: '09:15', type: 'HÓSPEDE' },
    { id: 'A-03', plate: '', status: 'LIVRE', entryTime: '', type: '' },
    { id: 'A-04', plate: 'HB-42-TR', status: 'OCUPADO', entryTime: '07:45', type: 'STAFF' },
    { id: 'A-05', plate: '', status: 'LIVRE', entryTime: '', type: '' },
    { id: 'A-06', plate: 'LD-99-22-ZZ', status: 'RESERVADO', entryTime: '', type: 'VIP' },
    { id: 'B-01', plate: 'LD-33-11-EF', status: 'OCUPADO', entryTime: '10:02', type: 'HÓSPEDE' },
    { id: 'B-02', plate: '', status: 'LIVRE', entryTime: '', type: '' },
    { id: 'B-03', plate: '', status: 'LIVRE', entryTime: '', type: '' },
    { id: 'B-04', plate: 'LD-77-44-GH', status: 'OCUPADO', entryTime: '09:50', type: 'HÓSPEDE' },
    { id: 'B-05', plate: '', status: 'MANUTENÇÃO', entryTime: '', type: '' },
    { id: 'B-06', plate: '', status: 'LIVRE', entryTime: '', type: '' },
];

const getSlotStyle = (status: string) => {
    switch (status) {
        case 'OCUPADO':    return 'border-cyan-400/50 bg-cyan-400/5 text-cyan-400';
        case 'RESERVADO':  return 'border-amber-400/50 bg-amber-400/5 text-amber-400';
        case 'MANUTENÇÃO': return 'border-red-500/50 bg-red-500/5 text-red-400';
        default:           return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
    }
};

export default function ParquePage() {
    const [filter, setFilter] = useState<'TODOS' | 'LIVRE' | 'OCUPADO'>('TODOS');
    const ocupados = parkingSlots.filter(s => s.status === 'OCUPADO').length;
    const livres = parkingSlots.filter(s => s.status === 'LIVRE').length;
    const reservados = parkingSlots.filter(s => s.status === 'RESERVADO').length;

    const filtered = filter === 'TODOS' ? parkingSlots :
        filter === 'LIVRE' ? parkingSlots.filter(s => s.status === 'LIVRE') :
        parkingSlots.filter(s => s.status === 'OCUPADO');

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-white/5 pb-16"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-1.5 h-6 bg-[var(--brand-accent)] shadow-[0_0_15px_var(--brand-accent)]" />
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.6em]">Parking Radar • Security Mesh</span>
                        </div>
                        <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            PAR<span className="text-[var(--brand-accent)]">QUE</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-8 max-w-lg leading-relaxed">
                            HR-HOSPITALITY PRIVATE PARKING MANAGEMENT • CCTV INTEGRATED
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 px-8 py-4 rounded-2xl text-center">
                            <p className="text-3xl font-black text-emerald-400 tabular-nums">{livres}</p>
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Lugares Livres</p>
                        </div>
                        <div className="bg-cyan-400/10 border border-cyan-400/30 px-8 py-4 rounded-2xl text-center">
                            <p className="text-3xl font-black text-cyan-400 tabular-nums">{ocupados}</p>
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Ocupados</p>
                        </div>
                        <div className="bg-amber-400/10 border border-amber-400/30 px-8 py-4 rounded-2xl text-center">
                            <p className="text-3xl font-black text-amber-400 tabular-nums">{reservados}</p>
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Reservados</p>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { label: 'Capacidade Total', value: `${parkingSlots.length}`, icon: MapPin, color: '#40E0D0' },
                        { label: 'Viaturas Hoje', value: `${ocupados + 3}`, icon: Car, color: '#FFD700' },
                        { label: 'Câmeras Ativas', value: '12/12', icon: Camera, color: '#10B981' },
                        { label: 'Última Atualização', value: 'Agora', icon: Clock, color: '#0047AB' },
                    ].map((stat, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                            className="bg-[#111111] border border-white/10 p-8 rounded-[32px] shadow-xl flex flex-col gap-4">
                            <div className="p-3 w-fit rounded-xl bg-white/5 border border-white/5">
                                <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                            </div>
                            <p className="text-3xl font-black text-white tabular-nums">{stat.value}</p>
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">{stat.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-4">
                    {(['TODOS', 'LIVRE', 'OCUPADO'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                filter === f ? 'bg-[var(--brand-accent)] text-black shadow-[0_0_20px_rgba(64,224,208,0.3)]' :
                                'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20'
                            }`}>{f}</button>
                    ))}
                </div>

                {/* Parking Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                    {filtered.map((slot, i) => (
                        <motion.div key={slot.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.03 * i }}
                            whileHover={{ scale: 1.04, y: -3 }}
                            className={`relative glass-panel rounded-[24px] border-2 p-5 md:p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[140px] ${getSlotStyle(slot.status)}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-2">{slot.id}</p>
                            {slot.status === 'OCUPADO' ? (
                                <>
                                    <Car className="w-8 h-8 mb-2 opacity-80" />
                                    <p className="text-[10px] font-black tracking-wider mb-1">{slot.plate}</p>
                                    <p className="text-[8px] opacity-50 uppercase">{slot.type}</p>
                                    <div className="absolute top-2 right-2 text-[7px] font-black opacity-60 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />{slot.entryTime}
                                    </div>
                                </>
                            ) : slot.status === 'RESERVADO' ? (
                                <>
                                    <ShieldCheck className="w-8 h-8 mb-2 opacity-80" />
                                    <p className="text-[9px] font-black uppercase">VIP</p>
                                    <p className="text-[8px] opacity-50 uppercase">Reservado</p>
                                </>
                            ) : slot.status === 'MANUTENÇÃO' ? (
                                <>
                                    <AlertTriangle className="w-8 h-8 mb-2 opacity-80" />
                                    <p className="text-[9px] font-black uppercase">Manutenção</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-10 h-10 rounded-full border-2 border-emerald-400/30 mb-2 flex items-center justify-center">
                                        <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10B981]" />
                                    </div>
                                    <p className="text-[9px] font-black uppercase">Livre</p>
                                </>
                            )}
                        </motion.div>
                    ))}
                </div>

                {/* Hotel Image */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="relative w-full h-52 md:h-72 rounded-[40px] overflow-hidden border border-white/10 group">
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent z-10" />
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
                    <Image src="/images/fachada-hotel-lukweku-angola.png" alt="Hotel Lukweku Fachada" fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute left-10 bottom-10 z-20">
                        <p className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.4em] mb-2">Parque Privado</p>
                        <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Hotel Lukweku</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Av. 21 de Janeiro, Benfica, Luanda</p>
                    </div>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
