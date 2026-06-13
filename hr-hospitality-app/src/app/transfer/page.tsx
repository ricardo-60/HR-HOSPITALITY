'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export default function TransferPage() {
    return (
        <DashboardLayout>
            <div className="flex flex-col items-center justify-center h-[80vh] text-center">
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-8 bg-white/5 border border-white/10 rounded-[32px] glass-panel"
                >
                    <ShieldCheck className="w-16 h-16 md:w-24 md:h-24 mx-auto text-[var(--brand-accent)] animate-pulse mb-6 drop-shadow-[0_0_15px_var(--brand-accent)]" />
                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-widest uppercase mb-4">
                        Transfer VIP
                    </h1>
                    <p className="text-sm md:text-base font-black text-white/50 uppercase tracking-[0.3em]">
                        Infraestrutura Ativa. Secção em preparação UI.
                    </p>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
