'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, Timer, CalendarClock, TrendingUp, ShieldAlert, HeartPulse, DoorOpen, Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ModoRHPage() {
    const modules = [
        { 
            title: 'Diretório de Staff', 
            desc: 'Gestão de Colaboradores e Contratos', 
            icon: Users, 
            path: '/rh/empregados', 
            color: '#00F2FF',
            stats: '42 Ativos'
        },
        { 
            title: 'Tempo & Presença', 
            desc: 'Picagem de Ponto e Banco de Horas', 
            icon: Timer, 
            path: '/rh/picagem', 
            color: '#10B981',
            stats: '98% Pontualidade'
        },
        { 
            title: 'Gestão de Férias', 
            desc: 'Calendário de Ausências e Baixas Médicas', 
            icon: HeartPulse, 
            path: '/rh/ferias', 
            color: '#F43F5E',
            stats: '3 Em Férias'
        },
        { 
            title: 'Escalas e Turnos', 
            desc: 'Planeamento de Rosters da Equipa', 
            icon: CalendarClock, 
            path: '/rh/escalas', 
            color: '#F59E0B',
            stats: 'Ocupação 84%'
        },
        { 
            title: 'Proc. Salarial', 
            desc: 'Vencimentos, Bónus e Comissões', 
            icon: TrendingUp, 
            path: '/rh/salarios', 
            color: '#8B5CF6',
            stats: 'Fecho Pendente'
        },
        { 
            title: 'Desligamentos', 
            desc: 'Processos de Saída e Offboarding', 
            icon: DoorOpen, 
            path: '/rh/saidas', 
            color: '#EC4899',
            stats: '0 Registos'
        },
    ];

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col justify-between border-b border-white/5 pb-12"
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-1.5 h-6 bg-[#00F2FF] shadow-[0_0_15px_#00F2FF]" />
                        <span className="text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.6em]">DNA HR-GESTPRO • Core Human Capital</span>
                    </div>
                    <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                        Recursos <span className="text-[#00F2FF]">Humanos</span>
                    </h1>
                    <p className="text-white/30 font-black uppercase tracking-[0.4em] text-xs mt-6 max-w-2xl leading-relaxed">
                        Painel central de gestão profissional: Férias, Salários, Controlo de Ponto, Avaliação e Offboarding.
                    </p>
                </motion.div>

                {/* Dashboard Stats Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-[#111111] border border-[#00F2FF]/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(0,242,255,0.05)]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-3 bg-[#00F2FF]/10 rounded-xl">
                                <Users className="w-6 h-6 text-[#00F2FF]" />
                            </div>
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black tracking-widest text-white/50">HOJE</span>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter mb-2">38<span className="text-xl text-white/20">/42</span></p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Colaboradores Presentes</p>
                    </div>
                    
                    <div className="bg-[#111111] border border-[#10B981]/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-3 bg-[#10B981]/10 rounded-xl">
                                <Activity className="w-6 h-6 text-[#10B981]" />
                            </div>
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black tracking-widest text-white/50">TURNO</span>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter mb-2">98%</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Taxa de Pontualidade</p>
                    </div>

                    <div className="bg-[#111111] border border-[#F43F5E]/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(244,63,94,0.05)]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-3 bg-[#F43F5E]/10 rounded-xl">
                                <HeartPulse className="w-6 h-6 text-[#F43F5E]" />
                            </div>
                            <span className="px-3 py-1 bg-[#F43F5E]/10 rounded-full text-[10px] font-black tracking-widest text-[#F43F5E]">ALERTA</span>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter mb-2">4</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ausências / Férias</p>
                    </div>

                    <div className="bg-[#111111] border border-[#F59E0B]/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-3 bg-[#F59E0B]/10 rounded-xl">
                                <ShieldAlert className="w-6 h-6 text-[#F59E0B]" />
                            </div>
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black tracking-widest text-white/50">SISTEMA</span>
                        </div>
                        <p className="text-2xl font-black text-white tracking-tighter mb-2 mt-2">ONLINE</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Relógios de Ponto</p>
                    </div>
                </div>

                {/* Sub-modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {modules.map((mod, i) => (
                        <Link href={mod.path} key={i}>
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="group bg-white/5 border border-white/10 p-10 rounded-[40px] hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 opacity-20 blur-3xl rounded-full group-hover:opacity-40 transition-opacity" style={{ backgroundColor: mod.color }} />
                                
                                <div className="flex justify-between items-start mb-12 relative z-10">
                                    <div className="p-4 rounded-2xl bg-black/50 border border-white/5">
                                        <mod.icon className="w-8 h-8" style={{ color: mod.color }} />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-black/50 rounded-full text-white/50">
                                        {mod.stats}
                                    </span>
                                </div>
                                
                                <div className="relative z-10">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3 flex items-center gap-3">
                                        {mod.title}
                                    </h3>
                                    <p className="text-xs font-bold text-white/40 leading-relaxed">
                                        {mod.desc}
                                    </p>
                                </div>

                                <div className="mt-8 flex items-center gap-2 text-[10px] font-black tracking-[0.3em] uppercase opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0" style={{ color: mod.color }}>
                                    Aceder Módulo <ArrowRight className="w-3 h-3" />
                                </div>
                            </motion.div>
                        </Link>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
}
