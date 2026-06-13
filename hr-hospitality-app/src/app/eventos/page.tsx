'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Building2, CalendarDays, Mic, UsersRound } from 'lucide-react';
import Image from 'next/image';

export default function EventosPage() {
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
                            <div className="w-1.5 h-6 bg-[var(--brand-accent)] shadow-[0_0_15px_var(--brand-accent)]" />
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.6em]">Facilities Protocol • Premium</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                            EVEN<span className="text-[var(--brand-accent)]">TOS</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            HR-HOSPITALITY CORPORATE EVENT MANAGEMENT
                        </p>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[400px] md:h-[550px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group mb-16">
                    <div className="absolute inset-0 bg-black/50 z-10 group-hover:bg-black/30 transition-all duration-700 pointer-events-none" />
                    <Image 
                        src="/images/Sala de Reunioes.jpg" 
                        alt="Sala de Reuniões e Eventos" 
                        fill 
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                        priority
                    />
                    <div className="absolute top-8 right-8 z-20 px-4 py-2 bg-black/50 backdrop-blur-md border border-[var(--brand-accent)]/30 rounded-full">
                        <span className="text-[var(--brand-accent)] font-black text-[9px] uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--brand-accent)] animate-pulse shadow-[0_0_10px_var(--brand-accent)]"></span>
                            Pronto a Reservar
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-10 md:p-14 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-20 flex flex-col justify-end">
                        <span className="text-[var(--brand-accent)] font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-3 block drop-shadow-[0_0_8px_var(--brand-accent)]">Business Center & Galas</span>
                        <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter drop-shadow-lg">Salas de Conferência</h2>
                    </div>
                </motion.div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    {[
                        { title: 'Agenda Global', desc: 'Calendário sincronizado com website', icon: CalendarDays },
                        { title: 'Apoio Audio-Visual', desc: 'Sistemas HR-Tecnologia integrados', icon: Mic },
                        { title: 'Gestão de Lotação', desc: 'Controlo estrito de convidados', icon: UsersRound },
                    ].map((item, idx) => (
                        <div key={idx} className="bg-[#111111] border border-white/10 p-10 rounded-[40px] shadow-2xl">
                            <item.icon className="w-10 h-10 text-[var(--brand-accent)] mb-6" />
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">{item.title}</h3>
                            <p className="text-xs font-black text-white/40 uppercase tracking-widest">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
}
