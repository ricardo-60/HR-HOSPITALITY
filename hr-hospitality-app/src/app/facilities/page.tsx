'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ParkingRadar } from '@/components/dashboard/ParkingRadar';
import { motion } from 'framer-motion';
import { Car, Dumbbell, Shield, Activity, Waves } from 'lucide-react';
import Image from 'next/image';

export default function FacilitiesPage() {
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
                            <span className="text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.6em]">Facilities Protocol • Secure</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                            FACILI<span className="text-[#00F2FF]">TIES</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            HR-HOSPITALITY AUTOMATED ACCESS & SURVEILLANCE
                        </p>
                    </div>
                </motion.div>

                {/* Wellness / Piscina */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[300px] md:h-[400px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group mb-16">
                    <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-700 pointer-events-none" />
                    <Image 
                        src="/images/Piscina de Noite.jpg" 
                        alt="Wellness Center e Piscina" 
                        fill 
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                    />
                    <div className="absolute top-8 right-8 z-20 px-4 py-2 bg-black/50 backdrop-blur-md border border-cyber-cyan/30 rounded-full">
                        <span className="text-cyber-cyan font-black text-[9px] uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyber-cyan animate-pulse shadow-[0_0_10px_#00FFFF]"></span>
                            Área Monitorizada
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-10 md:p-14 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-20 flex flex-col justify-end">
                        <span className="text-cyber-cyan font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-3 block flex items-center gap-3 drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]">
                            <Waves className="w-4 h-4" /> Centro de Wellness & Lazer
                        </span>
                        <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter drop-shadow-lg">Piscina Exclusiva</h2>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                    <div className="lg:col-span-12">
                        <ParkingRadar />
                    </div>

                    <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-12">
                        {/* Access Control Terminals */}
                        <div className="glass-panel p-12 rounded-[50px] relative overflow-hidden group">
                            <div className="flex items-center gap-5 mb-10">
                                <div className="p-4 bg-cyber-cyan/10 border border-cyber-cyan/20 rounded-2xl">
                                    <Shield className="w-6 h-6 text-cyber-cyan" />
                                </div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Terminais de Acesso</h3>
                            </div>

                            <div className="space-y-6">
                                {[
                                    { name: 'ENTRADA PRINCIPAL', status: 'ONLINE', ip: '192.168.1.101' },
                                    { name: 'GINÁSIO VIP', status: 'ONLINE', ip: '192.168.1.105' },
                                    { name: 'PARKING GATE B', status: 'OFFLINE', ip: '192.168.1.112' },
                                ].map((terminal, i) => (
                                    <div key={i} className="flex justify-between items-center p-6 bg-white/5 border border-white/5 rounded-2xl hover:border-white/10 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-3 h-3 rounded-full ${terminal.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_10px_#10B981]' : 'bg-red-500 shadow-[0_0_10px_red] animate-pulse'}`} />
                                            <div>
                                                <p className="text-[10px] font-black text-white uppercase tracking-widest">{terminal.name}</p>
                                                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">{terminal.ip}</p>
                                            </div>
                                        </div>
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${terminal.status === 'ONLINE' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {terminal.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Gym Occupancy / Quick Action */}
                        <div className="bg-cyber-cyan/5 border border-cyber-cyan/10 rounded-[50px] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyber-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 animate-scan-fast" />
                            <div className="w-16 h-16 rounded-full bg-black border border-cyber-cyan/20 flex items-center justify-center mb-8 relative z-10">
                                <Dumbbell className="w-8 h-8 text-cyber-cyan animate-bounce" />
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4 relative z-10">GYM CONTROL</h2>
                            <p className="text-white/30 font-black uppercase tracking-[0.4em] text-[8px] max-w-xs relative z-10 mb-8">
                                Real-time biometric validation and occupancy tracking.
                            </p>
                            <div className="flex gap-4 relative z-10">
                                <button className="btn-base btn-primary btn-sm">Grant Access</button>
                                <button className="btn-base btn-secondary btn-sm">Logs</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
