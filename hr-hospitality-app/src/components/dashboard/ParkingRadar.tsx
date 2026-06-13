'use client';

import { motion } from 'framer-motion';
import { Camera, ShieldCheck, Timer, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ParkingSlotProps {
    id: string;
    status: 'FREE' | 'OCCUPIED';
    plate?: string;
    entryTime?: string;
}

const initialSlots: ParkingSlotProps[] = [
    { id: 'A01', status: 'OCCUPIED', plate: 'HB-42-TR', entryTime: '2026-03-10T07:30:00' },
    { id: 'A02', status: 'FREE' },
    { id: 'A03', status: 'OCCUPIED', plate: '99-XL-01', entryTime: '2026-03-10T08:15:00' },
    { id: 'A04', status: 'FREE' },
    { id: 'A05', status: 'FREE' },
    { id: 'A06', status: 'OCCUPIED', plate: 'RT-22-ZZ', entryTime: '2026-03-10T04:20:00' },
];

export function ParkingRadar() {
    const [slots, setSlots] = useState(initialSlots);

    const calculateDuration = (entryTime?: string) => {
        if (!entryTime) return null;
        const entry = new Date(entryTime).getTime();
        const now = new Date().getTime();
        const durationMs = now - entry;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    };

    const isOvertime = (entryTime?: string) => {
        if (!entryTime) return false;
        const entry = new Date(entryTime).getTime();
        const now = new Date().getTime();
        return (now - entry) > (4 * 60 * 60 * 1000); // 4 hours alert
    };

    return (
        <div className="bg-[#111111] border border-[#00F2FF]/20 rounded-[60px] p-16 shadow-[0_50px_100px_rgba(0,0,0,1)] relative overflow-hidden group">
            {/* Laser Scanning Line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-[#00F2FF] shadow-[0_0_15px_#00F2FF] opacity-50 pointer-events-none animate-scan-fast" />

            <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-20 relative z-10">
                <div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-1.5 h-10 bg-[#00F2FF] shadow-[0_0_20px_#00F2FF]" />
                        <h3 className="text-4xl font-black text-white tracking-tighter uppercase">
                            ASSET <span className="text-[#00F2FF]">TRACKING</span>
                        </h3>
                    </div>
                    <p className="text-[10px] text-white/20 uppercase tracking-[0.6em] font-black ml-10">VEHICLE SURVEILLANCE & LOGISTICS • DNA HR-TECNOLOGIA</p>
                </div>
                <div className="flex gap-6">
                    <div className="bg-black/40 border border-white/5 p-6 rounded-2xl flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Fleet Load</p>
                            <p className="text-2xl font-black text-white tracking-widest">50%</p>
                        </div>
                        <Camera className="w-6 h-6 text-[#00F2FF]" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 relative z-10">
                {slots.map((slot) => {
                    const overtime = isOvertime(slot.entryTime);
                    return (
                        <motion.div
                            key={slot.id}
                            whileHover={{ scale: 1.02 }}
                            className={`p-10 rounded-[40px] border-2 transition-all duration-300 relative group overflow-hidden ${slot.status === 'OCCUPIED'
                                    ? (overtime ? 'border-[#FFFF00]/40 bg-[#FFFF00]/5 shadow-[0_0_30px_rgba(255,255,0,0.1)]' : 'border-[#00F2FF]/30 bg-black/60')
                                    : 'border-white/5 bg-[#050505]'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-10">
                                <span className={`text-[11px] font-black tracking-[0.5em] uppercase ${overtime ? 'text-[#FFFF00]/40' : 'text-white/20'}`}>{slot.id}</span>
                                {slot.status === 'OCCUPIED' && (
                                    overtime ? <AlertCircle className="w-6 h-6 text-[#FFFF00] animate-pulse" /> : <ShieldCheck className="w-6 h-6 text-[#00F2FF]" />
                                )}
                            </div>

                            <div className="space-y-6">
                                {slot.status === 'OCCUPIED' ? (
                                    <>
                                        <div>
                                            <p className={`text-3xl font-black tracking-[0.2em] leading-none uppercase tabular-nums ${overtime ? 'text-[#FFFF00]' : 'text-white'}`}>
                                                {slot.plate}
                                            </p>
                                            <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mt-3">Verified Object</p>
                                        </div>
                                        <div className="pt-6 border-t border-white/5 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <Timer className={`w-4 h-4 ${overtime ? 'text-[#FFFF00]' : 'text-white/20'}`} />
                                                <span className={`text-[10px] font-black tracking-widest tabular-nums ${overtime ? 'text-[#FFFF00]' : 'text-white/40'}`}>
                                                    {calculateDuration(slot.entryTime)}
                                                </span>
                                            </div>
                                            {overtime && (
                                                <span className="text-[8px] font-black text-black bg-[#FFFF00] px-3 py-1 rounded tracking-tighter">OVERTIME</span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-3xl font-black text-white/5 tracking-widest uppercase">READY</p>
                                        <p className="text-[9px] font-black text-white/10 uppercase tracking-[0.4em]">Bay Available</p>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
