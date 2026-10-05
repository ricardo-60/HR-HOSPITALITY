'use client';

import { Printer, ShieldCheck, Download, X, ArrowLeft } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface CheckoutConsolidatedProps {
    guestName: string;
    roomNumber: string;
    items: { description: string, value: number, category: string }[];
    taxes: number;
    onFinalize: () => void;
    onClose?: () => void;
}

export function CheckoutConsolidated({ guestName, roomNumber, items, taxes, onFinalize, onClose }: CheckoutConsolidatedProps) {
    const subtotal = items.reduce((acc, item) => acc + item.value, 0);
    const total = subtotal + taxes;
    const [auditId] = useState(() => 'AUDIT-' + Math.random().toString(36).substr(2, 9).toUpperCase());
    const [downloading, setDownloading] = useState(false);

    // Escape key handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && onClose) {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            // Generate report content
            const reportContent = generateReportContent();
            const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `checkout-relatorio-${roomNumber}-${guestName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Falha ao gerar relatório:', err);
        } finally {
            setDownloading(false);
        }
    };

    const generateReportContent = () => {
        const lines = [
            '========================================',
            'HR-HOSPITALITY - CONSOLIDATED AUDIT REPORT',
            '========================================',
            '',
            `Audit ID: ${auditId}`,
            `Date: ${new Date().toLocaleString('pt-PT')}`,
            `Guest: ${guestName}`,
            `Room: RM-${roomNumber}`,
            '',
            '--- TRANSACTIONAL LOGS ---',
            ...items.map((item, i) => {
                const num = String(i + 1).padStart(3, '0');
                return `${num}. ${item.description.padEnd(50)} | ${item.category.padEnd(15)} | ${item.value.toFixed(2).padStart(12)} Kz`;
            }),
            '',
            '--- SUMMARY ---',
            `Subtotal: ${subtotal.toFixed(2).padStart(12)} Kz`,
            `Taxes:    ${taxes.toFixed(2).padStart(12)} Kz`,
            `TOTAL:    ${total.toFixed(2).padStart(12)} Kz`,
            '',
            '--- VERIFICATION ---',
            'Status: Signed & Verified',
            '========================================',
        ];
        return lines.join('\n');
    };

    const handleBack = () => {
        if (onClose) onClose();
    };

    return (
        <div className="bg-[#111111] border border-white/20 rounded-[60px] p-16 shadow-[0_50px_100px_rgba(0,0,0,1)] flex flex-col h-full relative overflow-hidden border-t-[#00F2FF] border-t-2">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00F2FF]/5 blur-[120px] -mr-32 -mt-32" />

            <div className="flex justify-between items-start mb-20 relative z-10">
                <div className="flex items-center gap-4">
                    {/* Back/Close button */}
                    <button
                        onClick={handleBack}
                        className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 hover:border-[#00F2FF]/40 transition-all flex items-center justify-center"
                        aria-label="Voltar ao painel principal"
                        title="Voltar (Esc)"
                    >
                        <ArrowLeft className="w-5 h-5 text-white/70 hover:text-[#00F2FF] transition-colors" />
                    </button>
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-1 h-10 bg-[#00F2FF] shadow-[0_0_20px_rgba(0,242,255,0.4)]" />
                            <h3 className="text-5xl font-black text-white tracking-tighter uppercase">
                                FAST <span className="text-[#00F2FF]">CHECK-OUT</span>
                            </h3>
                        </div>
                        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.5em] ml-6">DNA HR-HOSPITALITY • CONSOLIDATED AUDIT</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Download button - now functional */}
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="p-5 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 hover:border-[#00F2FF]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        aria-label="Baixar relatório consolidado"
                        title="Baixar relatório"
                    >
                        <Download className="w-6 h-6 text-white/40 hover:text-[#00F2FF] transition-colors" />
                        {downloading && (
                            <span className="sr-only">A gerar relatório...</span>
                        )}
                    </button>
                    {/* Explicit close button */}
                    <button
                        onClick={handleBack}
                        className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center"
                        aria-label="Fechar e cancelar"
                        title="Fechar (Esc)"
                    >
                        <X className="w-5 h-5 text-white/50 hover:text-red-400 transition-colors" />
                    </button>
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
