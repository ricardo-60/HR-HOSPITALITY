'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Check } from 'lucide-react';
import { useState } from 'react';
import { printThermalReceipt as sendThermalReceipt } from '@/lib/thermalPrint';

/* ─────────────────────────────────────────────
   Dados simulados de produtos rápidos
   ───────────────────────────────────────────── */
const quickProducts = [
    { name: 'Coca-Cola Zero', price: 2.50, icon: '🥤' },
    { name: 'Cerveja Sagres', price: 3.50, icon: '🍺' },
    { name: 'Hambúrguer Gourmet', price: 12.00, icon: '🍔' },
    { name: 'Batatas Fritas', price: 4.50, icon: '🟟' },
    { name: 'Café Espresso', price: 1.20, icon: '☕' },
    { name: 'Tosta Mista', price: 5.50, icon: '🥪' },
];

/* ─────────────────────────────────────────────
   Rótulos e formatação de pagamento
   ───────────────────────────────────────────── */
const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Dinheiro',
    TPA: 'TPA',
    TRANSFER: 'Transferência',
    ROOM: 'Conta do Quarto',
};
const fmt = (v: number) => Number(v).toFixed(2).replace('.', ',');

/* ─────────────────────────────────────────────
   Impressão térmica de talão (padrão partilhado)
   ───────────────────────────────────────────── */
const printThermalReceipt = async (
    setFlash: (value: string | null) => void,
    total: number,
    payLabel: string,
    items: Array<{ name: string; qty: number; total: number }>,
) => {
    const impressaoOK = await sendThermalReceipt({
        title: 'HR-HOSPITALITY SNACK-BAR',
        headerLines: [
            `Data/Hora: ${new Date().toLocaleString('pt-PT', { hour12: false })}`,
            `Operador: Venda Rápida`,
        ],
        items,
        total: fmt(total),
        payLabel,
        footerLines: ['Obrigado e volte sempre!'],
    });

    if (impressaoOK) {
        setFlash(`Talão térmico impresso — ${payLabel} ${fmt(total)}`);
    } else {
        setFlash(`Falha na impressão — ${payLabel} ${fmt(total)} (verificar impressora)`);
    }
};

/* ─────────────────────────────────────────────
   Componente QuickSale
   ───────────────────────────────────────────── */
export function QuickSale() {
    const [statusError, setStatusError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [cart, setCart] = useState<Array<{ name: string; qty: number; total: number }>>([]);
    const [flash, setFlash] = useState<string | null>(null);

    return (
        <div className="bg-[#111111] border border-[var(--brand-accent)]/20 rounded-[24px] md:rounded-[32px] p-5 md:p-6 lg:p-8 h-full flex flex-col shadow-[0_50px_100px_rgba(0,0,0,1)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 bg-[var(--brand-accent)]/5 blur-[100px] -mr-16 -mt-16 md:-mr-24 md:-mt-24 pointer-events-none" />

            <div className="flex justify-between items-start mb-10 md:mb-16 relative z-10">
                <div>
                    <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                        <div className="w-1.5 h-6 md:h-8 bg-[var(--brand-accent)] shadow-[0_0_20px_var(--brand-accent)]" />
                        <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase">
                            QUICK <span className="text-[var(--brand-accent)] drop-shadow-[0_0_15px_var(--brand-accent)]">LINK</span>
                        </h3>
                    </div>
                    <p className="text-[9px] md:text-[10px] text-white/20 font-black uppercase tracking-[0.4em] ml-8 md:ml-10">Terminal de Auditoria de Consumos</p>
                </div>
            </div>

            {/* Alerta de Rigor Financeiro - erros */}
            {statusError && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500"
                >
                    <AlertCircle size={20} />
                    <p className="text-[10px] font-black uppercase tracking-widest">{statusError}</p>
                </motion.div>
            )}

            {notice && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4 text-emerald-500"
                >
                    <Check size={20} />
                    <p className="text-[10px] font-black uppercase tracking-widest">{notice}</p>
                </motion.div>
            )}

            {/* Feedback da impressão térmica (talão) */}
            {flash && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-8 p-4 bg-[#00F2FF]/10 border border-[#00F2FF]/20 rounded-2xl flex items-center gap-4 text-[#00F2FF]"
                >
                    <Check size={20} />
                    <p className="text-[10px] font-black uppercase tracking-widest">{flash}</p>
                </motion.div>
            )}

            <div className="space-y-4 flex-1 overflow-y-auto pr-6 custom-scrollbar relative z-10">
                {quickProducts.map((product, i) => (
                    <motion.button
                        key={i}
                        whileHover={{ x: 6 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            // Simulação de bloqueio
                            if (statusError) return;
                            setTotal(t => t + product.price);
                            setCart(c => {
                                const idx = c.findIndex(i => i.name === product.name);
                                if (idx >= 0) {
                                    const next = [...c];
                                    next[idx] = { ...next[idx], qty: next[idx].qty + 1, total: next[idx].total + product.price };
                                    return next;
                                }
                                return [...c, { name: product.name, qty: 1, total: product.price }];
                            });
                            setNotice(`${product.name} lançado (+${product.price.toFixed(2)} Kz).`);
                            setTimeout(() => setNotice(null), 2500);
                        }}
                        className={`w-full p-4 md:p-4.5 rounded-2xl border border-white/5 bg-black/40 flex justify-between items-center group transition-all duration-300 shadow-xl ${statusError ? 'opacity-30 cursor-not-allowed' : 'hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary)]/10 hover:shadow-[0_0_20px_rgba(0,71,171,0.2)]'}`}
                    >
                        <div className="flex items-center gap-6 md:gap-8">
                            <span className="text-3xl md:text-4xl filter saturate-0 group-hover:saturate-100 transition-all duration-500">{product.icon}</span>
                            <div className="text-left">
                                <p className="text-white font-black text-[10px] md:text-xs uppercase tracking-[0.1em] mb-1.5 md:mb-2">{product.name}</p>
                                <div className="px-3 md:px-4 py-1 bg-[var(--brand-accent)] rounded drop-shadow-[0_0_5px_var(--brand-accent)] inline-block">
                                    <p className="text-black text-[9px] md:text-[10px] font-black tracking-widest">{product.price.toFixed(2)}Kz</p>
                                </div>
                            </div>
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Alerta de Rigor Financeiro - erros (duplicata removida) */}
            {/* Notice alert removed - was duplicate */}

            <div className="mt-8 pt-8 border-t border-white/10 relative z-10">
                <div className="flex justify-between items-end mb-6 md:mb-8 px-4 md:px-6">
                    <div>
                        <p className="text-white/20 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[8px] md:text-[9px] mb-2">Operational Total</p>
                        <p className="text-4xl md:text-5xl font-black text-white tracking-tighter tabular-nums leading-none drop-shadow-2xl">
                            {total.toFixed(2)}<span className="text-[var(--brand-accent)] drop-shadow-[0_0_10px_var(--brand-accent)] text-lg md:text-xl ml-2 md:ml-3">Kz</span>
                        </p>
                    </div>
                </div>
                <button 
                    disabled={!!statusError || total <= 0}
                    onClick={() => {
                        const itensVendidos = cart;
                        setNotice(`Ordem de ${total.toFixed(2)} Kz transmitida ao sistema.`);

                        // LANÇAR IMPRESSÃO TÉRMICA IMEDIATA (padrão partilhado)
                        ;(async () => {
                            try {
                                await printThermalReceipt(setFlash, total, PAYMENT_LABELS.CASH, itensVendidos);
                            } catch (e) {
                                console.error('[QuickSale] erro ao imprimir talão:', e);
                            }
                        })();

                        setTotal(0);
                        setCart([]);
                        setTimeout(() => setNotice(null), 3000);
                    }}
                    className="btn-base btn-primary btn-md w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    TRANSMIT ORDER
                </button>
            </div>
        </div>
    );
}