'use client';

import { motion } from 'framer-motion';
import { CreditCard, Home, Printer, ShieldCheck, Download } from 'lucide-react';

interface CheckoutConsolidatedProps {
    guestName: string;
    roomNumber: string;
    items: { description: string, value: number, category: string }[];
    taxes: number;
    onFinalize: () => void;
}

export function CheckoutConsolidated({ guestName, roomNumber, items, taxes, onFinalize }: CheckoutConsolidatedProps) {
    const subtotal = items.reduce((acc, item) => acc + item.value, 0);
    const total = subtotal + taxes;
    const auditId = 'AUDIT-' + Math.random().toString(36).substr(2, 9).toUpperCase();

    return (
        <div className="bg-[#111111] border border-white/20 rounded-[60px] p-16 shadow-[0_50px_100px_rgba(0,0,0,1)] flex flex-col h-full relative overflow-hidden border-t-[#00F2FF] border-t-2">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00F2FF]/5 blur-[120px] -mr-32 -mt-32" />

            <div className="flex justify-between items-start mb-20 relative z-10">
                <div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-1 h-10 bg-[#00F2FF] shadow-[0_0_20px_rgba(0,242,255,0.4)]" />
                        <h3 className="text-5xl font-black text-white tracking-tighter uppercase">
                            FAST <span className="text-[#00F2FF]">CHECK-OUT</span>
                        </h3>
                    </div>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.5em] ml-6">DNA HR-HOSPITALITY • CONSOLIDATED AUDIT</p>
                </div>
                <div className="p-5 bg-white/5 rounded-3xl border border-white/10 group cursor-pointer hover:border-[#00F2FF]/40 transition-all">
                    <Download className="w-6 h-6 text-white/40 group-hover:text-[#00F2FF]" />
                </div>
            </div>

            <div className="space-y-12 flex-1 overflow-y-auto pr-8 custom-scrollbar mb-16 relative z-10">
                <div className="flex flex-col gap-4 p-8 bg-black/40 rounded-[40px] border border-white/5">
                    <div className="flex justify-between items-end">
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Guest Entity</p>
                        <p className="text-2xl font-black text-white tracking-widest uppercase">{guestName}</p>
                    </div>
                    <div className="flex justify-between items-end border-t border-white/5 pt-4">
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Unit / Room</p>
                        <p className="text-2xl font-black text-[#00F2FF] tracking-widest">RM-{roomNumber}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] ml-4">Transactional Logs</p>
                    {items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center p-8 bg-[#111111] border border-white/5 rounded-3xl hover:border-white/20 transition-all group">
                            <div className="flex items-center gap-6">
                                <div className="w-2 h-2 rounded-full bg-white/20 group-hover:bg-[#00F2FF] transition-all" />
                                <div>
                                    <p className="text-white font-black text-xs uppercase tracking-widest leading-none mb-2">{item.description}</p>
                                    <p className="text-[8px] font-black text-white/10 uppercase tracking-[0.3em] font-mono">{item.category}</p>
                                </div>
                            </div>
                            <span className="text-white font-black text-sm tabular-nums tracking-widest">{item.value.toFixed(2)}Kz</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-auto pt-16 border-t border-white/10 relative z-10 space-y-12">
                <div className="flex justify-between items-end px-8">
                    <div>
                        <p className="text-white/20 font-black uppercase tracking-[0.5em] text-[10px] mb-4">Consolidated Total</p>
                        <p className="text-9xl font-black text-white tracking-tighter tabular-nums leading-none">
                            {total.toFixed(2)}<span className="text-[#00F2FF] text-3xl ml-6">Kz</span>
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-white/10 uppercase tracking-widest mb-2 font-mono">AUDIT_TOKEN: {auditId}</p>
                        <div className="flex items-center gap-3 justify-end">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Signed & Verified</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pb-4">
                    <button className="btn-base btn-secondary btn-md">
                        <Printer className="w-5 h-5" /> PRINT RECEIPT
                    </button>
                    <button
                        onClick={onFinalize}
                        className="btn-base btn-primary btn-md"
                    >
                        FINALIZE SESSION
                    </button>
                </div>
            </div>
        </div>
    );
}
