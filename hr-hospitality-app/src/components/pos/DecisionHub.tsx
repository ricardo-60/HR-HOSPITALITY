'use client';

import { motion } from 'framer-motion';
import { CreditCard, Home } from 'lucide-react';

interface DecisionHubProps {
    total: number;
    onConfirm: (method: 'IMMEDIATE' | 'ROOM') => void;
}

export function DecisionHub({ onConfirm }: DecisionHubProps) {
    return (
        <div className="space-y-8 relative z-10">
            <div className="grid grid-cols-2 gap-6">
                <motion.button
                    whileHover={{ scale: 1.02, borderColor: '#00F2FF' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onConfirm('IMMEDIATE')}
                    className="flex flex-col items-center justify-center p-6 bg-[#111111] border border-white/10 rounded-2xl group transition-all shadow-xl"
                >
                    <div className="w-12 h-12 rounded-2xl bg-[#00F2FF]/10 flex items-center justify-center mb-4 border border-[#00F2FF]/20 group-hover:bg-[#00F2FF] transition-all">
                        <CreditCard className="w-6 h-6 text-[#00F2FF] group-hover:text-black transition-all" />
                    </div>
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-1">Liquidação</span>
                    <span className="text-xs font-black text-white uppercase tracking-widest">PAGAR AGORA</span>
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.02, borderColor: '#8B5CF6' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onConfirm('ROOM')}
                    className="flex flex-col items-center justify-center p-6 bg-[#111111] border border-white/10 rounded-2xl group transition-all shadow-xl"
                >
                    <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/10 flex items-center justify-center mb-4 border border-[#8B5CF6]/20 group-hover:bg-[#8B5CF6] transition-all">
                        <Home className="w-6 h-6 text-[#8B5CF6] group-hover:text-black transition-all" />
                    </div>
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-1">Hospedagem</span>
                    <span className="text-xs font-black text-white uppercase tracking-widest">DEBITAR NO QUARTO</span>
                </motion.button>
            </div>

            <div className="p-8 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00F2FF] animate-pulse" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Protocolo de Segurança Ativo</p>
                </div>
                <p className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">HR-HOSPITALITY PAY-LINK</p>
            </div>
        </div>
    );
}
