'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QuickSale } from '@/components/pos/QuickSale';
import { Zap, Search, Filter } from 'lucide-react';
import { motion } from 'framer-motion';

const snackTables = [
    { id: 'S1', number: 1, status: 'FREE' },
    { id: 'S2', number: 2, status: 'OCCUPIED', bill: 12.50 },
    { id: 'S3', number: 3, status: 'FREE' },
    { id: 'S4', number: 4, status: 'OCCUPIED', bill: 45.00 },
    { id: 'S5', number: 5, status: 'OCCUPIED', bill: 8.20 },
    { id: 'S6', number: 6, status: 'FREE' },
];

export default function SnackBarPage() {
    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
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

                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-10 md:gap-16 items-start">
                    <div className="w-full lg:col-span-7 space-y-8 md:space-y-12">
                        <div className="flex justify-between items-center bg-[#111111] px-5 md:px-6 py-3 md:py-4 rounded-full border border-white/10 shadow-lg hidden md:flex">
                            <div className="flex gap-6 md:gap-8">
                                <button className="btn-base btn-ghost btn-sm text-[var(--brand-accent)] relative font-black uppercase tracking-widest">
                                    Interior Deck
                                    <motion.div layoutId="snackNav" className="absolute -bottom-2 left-0 right-0 h-1 bg-[var(--brand-accent)] rounded-full drop-shadow-[0_0_8px_var(--brand-accent)]" />
                                </button>
                                <button className="btn-base btn-ghost btn-sm text-white/40 hover:text-[var(--brand-primary)] font-black uppercase tracking-widest transition-colors">Pool Area</button>
                            </div>
                            <div className="flex gap-6">
                                <Search className="w-5 h-5 text-white/20 cursor-pointer hover:text-[var(--brand-accent)] transition-all" />
                                <Filter className="w-5 h-5 text-white/20 cursor-pointer hover:text-[var(--brand-accent)] transition-all" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 md:gap-10">
                            {snackTables.map((table) => (
                                <motion.div
                                    key={table.id}
                                    whileHover={{ scale: 1.05, border: '2px solid var(--brand-accent)' }}
                                    className={`aspect-square rounded-full flex flex-col items-center justify-center transition-all duration-300 border shadow-2xl relative ${table.status === 'OCCUPIED'
                                            ? 'border-[var(--brand-accent)] bg-[#111111] shadow-[0_0_30px_var(--brand-accent)]'
                                            : 'border-white/10 bg-[#111111]/30 hover:bg-[#111111]'
                                        }`}
                                >
                                    <span className={`text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter ${table.status === 'OCCUPIED' ? 'text-white' : 'text-white/5'}`}>{table.number}</span>

                                    {table.bill && (
                                        <div className="absolute bottom-6 md:bottom-10 px-3 md:px-4 py-1.5 bg-[var(--brand-accent)] rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.6)] border border-white/20">
                                            <span className="text-black font-black text-[9px] md:text-[10px] tracking-widest">{table.bill.toFixed(2)}Kz</span>
                                        </div>
                                    )}

                                    {table.status === 'OCCUPIED' && (
                                        <div className="absolute inset-0 rounded-full border-2 border-[var(--brand-accent)]/80 animate-pulse pointer-events-none drop-shadow-[0_0_10px_var(--brand-accent)]" />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    <div className="w-full lg:col-span-5 h-[600px] md:h-[700px] lg:h-full">
                        <QuickSale />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
