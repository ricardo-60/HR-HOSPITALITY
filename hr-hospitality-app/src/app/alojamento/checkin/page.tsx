'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Checkin360 } from '@/components/alojamento/Checkin360';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CheckinContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const room = searchParams.get('room') || '';

    return (
        <div className="max-w-[1500px] mx-auto space-y-20 pb-20 px-4">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-white/5 pb-16"
            >
                <div>
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-1.5 h-6 bg-cyber-purple shadow-[0_0_15px_#A78BFA]" />
                        <span className="text-[10px] font-black text-[#A78BFA] uppercase tracking-[0.6em]">Smart Boarding Protocol • Elite</span>
                    </div>
                    <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                        VALI<span className="text-cyber-purple">DAÇÃO</span>
                    </h1>
                    <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                        VERIFICAÇÃO DE IDENTIDADE • ATIVAÇÃO DE FACILITIES • GARANTIA
                    </p>
                </div>

                <button
                    onClick={() => router.back()}
                    className="px-8 py-4 bg-white/5 border border-white/10 text-white/40 font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                >
                    Cancelar
                </button>
            </motion.div>

            <Checkin360 roomId={room} onComplete={() => router.push('/alojamento')} />
        </div>
    );
}

export default function CheckinPage() {
    return (
        <DashboardLayout>
            <Suspense fallback={
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="w-12 h-12 border-4 border-cyber-purple border-t-transparent rounded-full animate-spin" />
                </div>
            }>
                <CheckinContent />
            </Suspense>
        </DashboardLayout>
    );
}
