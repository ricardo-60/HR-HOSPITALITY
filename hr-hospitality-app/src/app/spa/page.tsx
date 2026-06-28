'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Heart, Droplets, Sun, Zap, Star, Clock } from 'lucide-react';
import Image from 'next/image';

const services = [
    { name: 'Massagem Relaxante', duration: '60 min', price: '15.000 Kz', icon: Heart, status: 'DISPONÍVEL' },
    { name: 'Tratamento Facial', duration: '45 min', price: '12.000 Kz', icon: Star, status: 'DISPONÍVEL' },
    { name: 'Hidroterapia', duration: '30 min', price: '8.000 Kz', icon: Droplets, status: 'EM CURSO' },
    { name: 'Sauna & Banho Turco', duration: '90 min', price: '10.000 Kz', icon: Sun, status: 'DISPONÍVEL' },
    { name: 'Treino Personalizado', duration: '60 min', price: '6.000 Kz', icon: Zap, status: 'DISPONÍVEL' },
    { name: 'Yoga & Meditação', duration: '50 min', price: '5.000 Kz', icon: Clock, status: 'RESERVADO' },
];

const stats = [
    { label: 'Sessões Hoje', value: '14', color: '#40E0D0' },
    { label: 'Clientes Ativos', value: '8', color: '#FFD700' },
    { label: 'Receita Diária', value: '142K Kz', color: '#10B981' },
    { label: 'Avaliação Média', value: '4.9★', color: '#0047AB' },
];

export default function SpaPage() {
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
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.6em]">Wellness & Leisure • Premium</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            BEM<span className="text-[var(--brand-accent)]">-ESTAR</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            HR-HOSPITALITY SPA & GENTLEMAN GYM • WELLNESS CENTER
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button className="px-8 py-5 bg-[var(--brand-accent)] text-black font-black text-[10px] uppercase tracking-[0.4em] rounded-[24px] hover:scale-105 transition-all shadow-[0_10px_30px_rgba(64,224,208,0.3)]">
                            Nova Reserva
                        </button>
                    </div>
                </motion.div>

                {/* Hero Image */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="relative w-full h-[350px] md:h-[480px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group">
                    <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-700 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-900/50 via-blue-950 to-black" />
                    <Image
                        src="/images/piscina-de-tarde.jpg"
                        alt="Piscina e Spa Hotel Lukweku"
                        fill
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                        priority
                    />
                    <div className="absolute bottom-0 left-0 w-full p-10 md:p-14 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-20">
                        <span className="text-[var(--brand-accent)] font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-3 block">Gentleman Gym & Pool Spa</span>
                        <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter">Centro de Bem-Estar</h2>
                    </div>
                </motion.div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * i }}
                            className="bg-[#111111] border border-white/10 p-8 md:p-12 rounded-[40px] shadow-2xl hover:border-white/20 transition-all"
                        >
                            <p className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-3 tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">{stat.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Services Grid */}
                <div>
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-1.5 h-6 bg-[var(--brand-accent)] shadow-[0_0_10px_var(--brand-accent)]" />
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Serviços Disponíveis</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {services.map((service, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.05 * i }}
                                whileHover={{ scale: 1.02, y: -4 }}
                                className="glass-panel p-8 md:p-10 rounded-[32px] border border-white/10 hover:border-[var(--brand-accent)]/40 transition-all cursor-pointer group"
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <div className="p-4 bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/20 rounded-2xl group-hover:bg-[var(--brand-accent)]/20 transition-all">
                                        <service.icon className="w-7 h-7 text-[var(--brand-accent)]" />
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                        service.status === 'DISPONÍVEL' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' :
                                        service.status === 'EM CURSO' ? 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10' :
                                        'text-amber-400 border-amber-400/30 bg-amber-400/10'
                                    }`}>{service.status}</span>
                                </div>
                                <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight mb-2">{service.name}</h3>
                                <div className="flex items-center justify-between mt-6">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{service.duration}</span>
                                    <span className="text-[var(--brand-accent)] font-black text-sm tracking-widest">{service.price}</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Pool Images Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { src: '/images/piscina-com-por-dos-sol.jpg', label: 'Piscina • Pôr do Sol' },
                        { src: '/images/piscina-de-noite.jpg', label: 'Piscina • Noturna' },
                        { src: '/images/piscina-decorada.jpg', label: 'Piscina • Eventos' },
                    ].map((img, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.1 * i }}
                            className="relative h-52 md:h-64 rounded-[32px] overflow-hidden border border-white/10 group cursor-pointer shadow-2xl"
                        >
                            <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-500" />
                            <Image src={img.src} alt={img.label} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                            <div className="absolute bottom-0 left-0 w-full p-5 z-20">
                                <span className="text-[9px] font-black text-white/80 uppercase tracking-[0.3em]">{img.label}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
}
