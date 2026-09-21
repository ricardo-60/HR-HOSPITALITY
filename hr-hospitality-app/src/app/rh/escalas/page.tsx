'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { CalendarClock, CalendarDays, Plus, ArrowLeft, ArrowRight, Sun, Moon, Sunrise } from 'lucide-react';
import Link from 'next/link';

export default function EscalasPage() {
    const turnos = [
        { id: 'T-001', nome: 'Ricardo Ferreira', dia: 'Segunda', tipo: 'Manhã', horas: '08:00 - 16:30' },
        { id: 'T-002', nome: 'Ana Sousa', dia: 'Terça', tipo: 'Tarde', horas: '16:00 - 00:30' },
        { id: 'T-003', nome: 'João Silva', dia: 'Quarta', tipo: 'Noite', horas: '00:00 - 08:30' },
        { id: 'T-004', nome: 'Maria Conceição', dia: 'Quinta', tipo: 'Manhã', horas: '08:00 - 16:30' },
        { id: 'T-005', nome: 'Carlos Pereira', dia: 'Sexta', tipo: 'Folga', horas: '---' },
    ];

    const getIcon = (tipo: string) => {
        if (tipo === 'Manhã') return <Sunrise className="w-5 h-5 text-[#F59E0B]" />;
        if (tipo === 'Tarde') return <Sun className="w-5 h-5 text-[#00F2FF]" />;
        if (tipo === 'Noite') return <Moon className="w-5 h-5 text-[#8B5CF6]" />;
        return null;
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-12 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-8 border-b border-white/5 pb-8"
                >
                    <div>
                        <Link href="/rh" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6 font-bold uppercase tracking-widest text-[10px]">
                            <ArrowLeft className="w-4 h-4" /> Voltar ao Painel RH
                        </Link>
                        <h1 className="text-5xl font-black text-white tracking-tighter uppercase flex items-center gap-4">
                            <CalendarClock className="text-[#F59E0B]" /> Escalas & Turnos
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Planeamento de Rosters e Alocação de Equipas
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all">
                            <CalendarDays className="w-4 h-4" /> Ver Mês
                        </button>
                        <button className="flex items-center gap-2 bg-[#F59E0B] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                            <Plus className="w-4 h-4" /> Criar Escala
                        </button>
                    </div>
                </motion.div>

                {/* Semana View */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] p-8">
                    <div className="flex justify-between items-center mb-8 bg-white/5 p-4 rounded-2xl">
                        <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Semana: 15 a 21 de Junho, 2026</h2>
                        <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"><ArrowRight className="w-5 h-5" /></button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Colaborador</th>
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Seg</th>
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Ter</th>
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Qua</th>
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Qui</th>
                                    <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Sex</th>
                                    <th className="p-4 text-[10px] font-black text-[#F43F5E] uppercase tracking-widest text-center">Sáb</th>
                                    <th className="p-4 text-[10px] font-black text-[#F43F5E] uppercase tracking-widest text-center">Dom</th>
                                </tr>
                            </thead>
                            <tbody>
                                {turnos.map((t, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={t.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                    >
                                        <td className="p-4 text-sm font-black text-white">{t.nome}</td>
                                        
                                        {/* Mocking a week for visual purposes */}
                                        {[1, 2, 3, 4, 5].map(day => (
                                            <td key={day} className="p-4 text-center">
                                                {day === 3 && t.tipo === 'Folga' ? (
                                                    <span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center p-2 bg-white/5 rounded-xl border border-white/10 hover:border-white/30 cursor-pointer transition-colors">
                                                        {getIcon(t.tipo) || <Sun className="w-5 h-5 text-[#00F2FF]" />}
                                                        <span className="text-[9px] font-bold text-white/50 mt-1">{t.horas}</span>
                                                    </div>
                                                )}
                                            </td>
                                        ))}
                                        <td className="p-4 text-center"><span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span></td>
                                        <td className="p-4 text-center"><span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
