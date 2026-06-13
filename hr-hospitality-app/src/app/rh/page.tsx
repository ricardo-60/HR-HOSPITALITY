'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, Timer, TrendingUp, ShieldAlert, BrainCircuit, Activity, ClipboardList } from 'lucide-react';

export default function ModoRHPage() {
    const hotelOccupancy = 84; // Mock occupancy from context/props in real case

    const getStaffSuggestion = () => {
        if (hotelOccupancy > 80) return "REFORÇO CRÍTICO: Lavandaria e Cozinha (Ocupação > 80%)";
        if (hotelOccupancy > 50) return "OPERATIVO: Staff Standard";
        return "BAIXA CARGA: Ajustar turnos p/ manutenção";
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-20 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-white/5 pb-16"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-1.5 h-6 bg-[#00F2FF] shadow-[0_0_15px_#00F2FF]" />
                            <span className="text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.6em]">DNA HR-GESTPRO • HR Performance Engine</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                            MODO <span className="text-[#00F2FF]">RH</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            HUMAN CAPITAL MANAGEMENT • SMART SCHEDULING • COMMISSIONS
                        </p>
                    </div>
                </motion.div>

                {/* Smart Suggestion Banner */}
                <div className="bg-[#FFFF00]/10 border border-[#FFFF00]/40 p-12 rounded-[50px] flex flex-col md:flex-row items-center justify-between gap-10 shadow-[0_20px_50px_rgba(255,255,0,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFFF00]/5 blur-3xl" />
                    <div className="flex items-center gap-8 relative z-10">
                        <div className="p-6 bg-[#FFFF00] rounded-3xl">
                            <BrainCircuit className="w-8 h-8 text-black" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-[#FFFF00] uppercase tracking-[0.4em] mb-2">IA Staff Suggestion Engine</p>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{getStaffSuggestion()}</h2>
                        </div>
                    </div>
                    <button className="px-12 py-6 bg-[#FFFF00] text-black font-black text-xs uppercase tracking-[0.5em] rounded-2xl hover:scale-105 transition-all relative z-10 shadow-2xl">
                        AUTORIZAR ESCALA EXTRA
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {[
                        { label: 'Staff Ativo', value: '42', icon: Users, color: '#00F2FF', sub: 'Em Turno' },
                        { label: 'Picagem Pontual', value: '98%', icon: Timer, color: '#FFFFFF', sub: '+2% vs Ontem' },
                        { label: 'Comissões Brutas', value: '1.240Kz', icon: TrendingUp, color: '#10B981', sub: 'Pendente' },
                        { label: 'Status Hardware', value: 'ONLINE', icon: Activity, color: '#10B981', sub: 'Biometria/NFC' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-[#111111] border border-white/10 p-12 rounded-[50px] shadow-2xl group hover:border-[#00F2FF]/40 transition-all">
                            <div className="flex justify-between items-start mb-12">
                                <div className="p-5 bg-white/5 rounded-2xl border border-white/5 group-hover:bg-[#00F2FF]/5 group-hover:border-[#00F2FF]/20 transition-all">
                                    <stat.icon className="w-8 h-8" style={{ color: stat.color }} />
                                </div>
                            </div>
                            <p className="text-5xl font-black text-white tracking-tighter mb-4 tabular-nums">{stat.value}</p>
                            <div>
                                <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em]">{stat.label}</p>
                                <p className="text-[9px] font-black text-white/10 uppercase tracking-widest mt-1">{stat.sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-[#111111] border border-white/5 rounded-[60px] p-24 flex flex-col items-center justify-center text-center group transition-all hover:border-[#00F2FF]/10">
                    <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-12 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-t from-[#00F2FF]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <ClipboardList className="w-10 h-10 text-white/20 group-hover:text-[#00F2FF] transition-all" />
                    </div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-6">Controlo de Acessos & Hardline</h2>
                    <p className="text-white/20 font-black uppercase tracking-[0.5em] text-xs max-w-md leading-relaxed">
                        Integração direta com hardware Room-Control e terminais biométricos de picagem. DNA HR-TECNOLOGIA.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
