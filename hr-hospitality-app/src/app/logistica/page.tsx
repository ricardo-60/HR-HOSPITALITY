/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, ShoppingCart, Truck, AlertTriangle, Calendar, ClipboardList, X, PackagePlus, Ship } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PedidoStock {
    id: string;
    item: string;
    quantidade: number;
    fornecedor: string;
    criadoEm: string;
}

export const inventoryItems = [
    { id: 'SKU-001', name: 'Gin Premium Lukweku', quantity: 12, unit: 'Btls', lot: 'LT-2026-X', expiry: '2026-04-15', status: 'OK' },
    { id: 'SKU-002', name: 'Tónica Artisanal', quantity: 144, unit: 'Units', lot: 'LT-2026-A', expiry: '2027-12-01', status: 'OK' },
    { id: 'SKU-003', name: 'Café Grão Arábica', quantity: 25, unit: 'Kg', lot: 'LT-2025-Z', expiry: '2026-03-25', status: 'EXPIRING' }, // Near expiry
    { id: 'SKU-004', name: 'Vinho Tinto Reserva', quantity: 4, unit: 'Btls', lot: 'LT-2026-V', expiry: '2030-01-01', status: 'CRITICAL' }, // Low stock
];

const technicalSheets = [
    { name: 'Lukweku Gin Tonic', components: [{ item: 'Gin Premium', qty: '5cl' }, { item: 'Tónica', qty: '1 unit' }] },
    { name: 'Café Expresso', components: [{ item: 'Café Grão', qty: '7g' }] },
];

export default function LogisticaPage() {
    const [pedidos, setPedidos] = useState<PedidoStock[]>([]);
    const [showPedidoModal, setShowPedidoModal] = useState(false);
    const [showManifesto, setShowManifesto] = useState(false);
    const [pedidoItem, setPedidoItem] = useState(inventoryItems[0].id);
    const [pedidoQtd, setPedidoQtd] = useState('1');
    const [pedidoFornecedor, setPedidoFornecedor] = useState('');

    useEffect(() => {
        try { setPedidos(JSON.parse(localStorage.getItem('logistica_pedidos') || '[]')); } catch { /* ignorar dados inválidos */ }
    }, []);

    const guardarPedidos = (lista: PedidoStock[]) => {
        setPedidos(lista);
        localStorage.setItem('logistica_pedidos', JSON.stringify(lista));
    };

    const criarPedido = (e: React.FormEvent) => {
        e.preventDefault();
        const item = inventoryItems.find(i => i.id === pedidoItem);
        const qtd = parseInt(pedidoQtd, 10);
        if (!item || !qtd || qtd < 1 || !pedidoFornecedor.trim()) return;
        const novo: PedidoStock = {
            id: `PED-${Date.now().toString().slice(-6)}`,
            item: item.name,
            quantidade: qtd,
            fornecedor: pedidoFornecedor.trim(),
            criadoEm: new Date().toLocaleString('pt-PT'),
        };
        guardarPedidos([novo, ...pedidos]);
        setPedidoQtd('1');
        setPedidoFornecedor('');
        setShowPedidoModal(false);
    };

    const exportarRelatorioStock = () => {
        const sep = ';';
        const header = ['ID', 'Nome', 'Qtd', 'Unidade', 'Lote', 'Validade', 'Estado'].join(sep);
        const linhas = inventoryItems.map(i => [i.id, i.name, i.quantity, i.unit, i.lot, i.expiry, i.status].join(sep));
        const csv = '\uFEFF' + [header, ...linhas].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-stock-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
                            <span className="text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.6em]">DNA HR-TECNOLOGIA • ERP Operational</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                            ECONO<span className="text-[#00F2FF]">MATO</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            STOCK CONTROL • LOT TRACKING • EXPIRY MONITORING
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button onClick={() => setShowPedidoModal(true)} className="px-8 py-4 bg-[#00F2FF] text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,255,0.3)]">Novo Pedido</button>
                        <button onClick={exportarRelatorioStock} className="px-8 py-4 bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all">Relatório Stock</button>
                    </div>
                </motion.div>

                {/* Inventory Table */}
                <div className="glass-panel rounded-[40px] overflow-hidden">
                    <div className="p-8 md:p-12 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 bg-white/[0.01]">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-[#00F2FF]/10 border border-[#00F2FF]/30 flex items-center justify-center">
                                <Box className="w-6 h-6 text-[#00F2FF]" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Inventário Central</h3>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-1">Gestão de Lotes & Rastreabilidade</p>
                            </div>
                        </div>
                        <div className="flex gap-6">
                            <div className="flex items-center gap-3 px-6 py-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_red] animate-pulse" />
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Ruptura (1)</span>
                            </div>
                            <div className="flex items-center gap-3 px-6 py-3 bg-cyber-yellow/5 border border-cyber-yellow/20 rounded-xl">
                                <div className="w-2 h-2 rounded-full bg-cyber-yellow shadow-[0_0_8px_yellow] animate-pulse" />
                                <span className="text-[9px] font-black text-cyber-yellow uppercase tracking-widest">Validade (1)</span>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto min-w-full">
                        <table className="w-full text-left responsive-table">
                            <thead>
                                <tr className="bg-white/[0.02]">
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Reference</th>
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Product</th>
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Stock Level</th>
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Lot ID</th>
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Expiration</th>
                                    <th className="px-12 py-8 text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {inventoryItems.map((item) => (
                                    <tr key={item.id} className={`group hover:bg-white/[0.03] transition-colors ${item.status === 'EXPIRING' ? 'bg-cyber-yellow/5' : item.status === 'CRITICAL' ? 'bg-red-500/5' : ''}`}>
                                        <td data-label="Reference" className="px-12 py-8">
                                            <span className="text-white/30 font-black text-[10px] tracking-widest font-mono">{item.id}</span>
                                        </td>
                                        <td data-label="Product" className="px-12 py-8">
                                            <p className={`font-black text-xs uppercase tracking-widest group-hover:text-cyber-cyan transition-all ${item.status === 'EXPIRING' ? 'text-cyber-yellow neon-glow-yellow' : 'text-white'}`}>
                                                {item.name}
                                            </p>
                                        </td>
                                        <td data-label="Stock Level" className="px-12 py-8">
                                            <div className="flex items-center gap-4">
                                                <span className={`text-sm font-black tabular-nums ${item.status === 'CRITICAL' ? 'text-red-500' : 'text-white'}`}>{item.quantity}</span>
                                                <span className="text-white/20 text-[10px] font-black uppercase">{item.unit}</span>
                                            </div>
                                        </td>
                                        <td data-label="Lot ID" className="px-12 py-8">
                                            <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg inline-block">
                                                <span className="text-white/40 font-black text-[9px] tracking-widest">{item.lot}</span>
                                            </div>
                                        </td>
                                        <td data-label="Expiration" className="px-12 py-8">
                                            <div className={`flex items-center gap-3 ${item.status === 'EXPIRING' ? 'text-cyber-yellow' : 'text-white/20'}`}>
                                                <Calendar className="w-4 h-4" />
                                                <span className="font-black text-[10px] tracking-widest tabular-nums">{item.expiry}</span>
                                            </div>
                                        </td>
                                        <td data-label="Status" className="px-12 py-8">
                                            <div className={`px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest inline-block ${item.status === 'OK' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' :
                                                item.status === 'EXPIRING' ? 'text-cyber-yellow border-cyber-yellow/20 bg-cyber-yellow/5 neon-glow-yellow animate-pulse' :
                                                    'text-red-500 border-red-500/20 bg-red-500/5 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                                }`}>
                                                {item.status}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Technical Sheets Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2 glass-panel rounded-[40px] p-12 relative overflow-hidden">
                        <div className="flex items-center gap-5 mb-12">
                            <div className="w-12 h-12 rounded-2xl bg-cyber-purple/10 border border-cyber-purple/30 flex items-center justify-center">
                                <ClipboardList className="w-6 h-6 text-cyber-purple" />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Fichas Técnicas (Auto-Abate)</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {technicalSheets.map((sheet, i) => (
                                <div key={i} className="p-8 bg-white/5 border border-white/10 rounded-3xl group hover:border-cyber-purple transition-all">
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-6 border-b border-white/5 pb-4 group-hover:text-cyber-purple">{sheet.name}</h4>
                                    <div className="space-y-4">
                                        {sheet.components.map((comp, j) => (
                                            <div key={j} className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{comp.item}</span>
                                                <span className="text-[10px] font-black text-cyber-purple tracking-widest">{comp.qty}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-[40px] p-12 bg-cyber-purple/5 flex flex-col justify-center text-center">
                        <div className="w-20 h-20 rounded-full bg-cyber-purple/20 border border-cyber-purple/40 flex items-center justify-center mx-auto mb-10 animate-pulse">
                            <Truck className="w-10 h-10 text-cyber-purple" />
                        </div>
                        <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-4">Tracking de Carga</h4>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] leading-relaxed">
                            Monitorização em tempo real de fornecedores externos e SLAs de receção.
                        </p>
                        <button onClick={() => setShowManifesto(v => !v)} className={`mt-12 px-8 py-4 border text-white font-black text-[9px] uppercase tracking-[0.3em] rounded-xl transition-all ${showManifesto ? 'bg-cyber-purple text-black border-cyber-purple' : 'bg-white/5 border-white/10 hover:bg-cyber-purple hover:text-black hover:border-cyber-purple'}`}>Ver Manifesto de Carga</button>
                    </div>
                </div>

                {/* Manifesto de Carga (toggle) */}
                <AnimatePresence>
                    {showManifesto && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="glass-panel rounded-[40px] overflow-hidden border border-cyber-purple/30"
                        >
                            <div className="p-8 md:p-12 border-b border-white/5 flex items-center justify-between gap-6 bg-cyber-purple/5">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-cyber-purple/10 border border-cyber-purple/30 flex items-center justify-center">
                                        <Ship className="w-6 h-6 text-cyber-purple" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Manifesto de Carga</h3>
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-1">Itens a Abordo • Inventário Central</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowManifesto(false)} className="text-white/30 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="divide-y divide-white/5">
                                {inventoryItems.map((item, i) => (
                                    <motion.div key={item.id}
                                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}
                                        className="px-8 md:px-12 py-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-8 hover:bg-white/[0.03] transition-colors"
                                    >
                                        <span className="text-white/30 font-black text-[10px] tracking-widest font-mono min-w-[90px]">{item.id}</span>
                                        <span className="flex-1 font-black text-xs uppercase tracking-widest text-white">{item.name}</span>
                                        <span className="text-white/40 font-black text-[10px] uppercase">{item.quantity} {item.unit}</span>
                                        <span className="text-white/30 font-black text-[10px] tracking-widest">Lote {item.lot}</span>
                                        <span className="text-white/30 font-black text-[10px] tracking-widest tabular-nums">Val. {item.expiry}</span>
                                        <span className={`px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest inline-block ${
                                            item.status === 'OK' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' :
                                            item.status === 'EXPIRING' ? 'text-cyber-yellow border-cyber-yellow/20 bg-cyber-yellow/5' :
                                            'text-red-500 border-red-500/20 bg-red-500/5'}`}>{item.status}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Pedidos */}
                <div>
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-1.5 h-6 bg-[#00F2FF] shadow-[0_0_10px_#00F2FF]" />
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Pedidos</h2>
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border text-[#00F2FF] border-[#00F2FF]/30 bg-[#00F2FF]/10">{pedidos.length}</span>
                    </div>
                    {pedidos.length === 0 ? (
                        <div className="glass-panel rounded-[32px] border border-white/10 p-10 text-center">
                            <PackagePlus className="w-8 h-8 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Sem pedidos registados — clique em "Novo Pedido"</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <AnimatePresence mode="popLayout">
                                {pedidos.map((p, i) => (
                                    <motion.div key={p.id} layout
                                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: 0.04 * i }}
                                        className="glass-panel rounded-[24px] border border-white/10 p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8 hover:border-[#00F2FF]/40 transition-all"
                                    >
                                        <div className="p-3 bg-[#00F2FF]/10 border border-[#00F2FF]/20 rounded-xl">
                                            <ShoppingCart className="w-5 h-5 text-[#00F2FF]" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-white uppercase tracking-tight">{p.item}</p>
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">{p.id} • {p.criadoEm}</p>
                                        </div>
                                        <p className="text-[11px] font-black text-[#00F2FF] uppercase tracking-widest tabular-nums">{p.quantidade} un.</p>
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{p.fornecedor}</p>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Novo Pedido */}
            <AnimatePresence>
                {showPedidoModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.form
                            onSubmit={criarPedido}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between border-b border-white/5 pb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-5 bg-[#00F2FF] shadow-[0_0_10px_#00F2FF]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-widest">Novo Pedido de Stock</h3>
                                </div>
                                <button type="button" onClick={() => setShowPedidoModal(false)} className="text-white/30 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Item do Inventário</label>
                                <select value={pedidoItem} onChange={(e) => setPedidoItem(e.target.value)}
                                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[#00F2FF] transition-all font-bold">
                                    {inventoryItems.map(i => (
                                        <option key={i.id} value={i.id} className="bg-[#0A0A0A]">{i.id} — {i.name} (stock: {i.quantity} {i.unit})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Quantidade</label>
                                <input type="number" min={1} required value={pedidoQtd} onChange={(e) => setPedidoQtd(e.target.value)}
                                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[#00F2FF] transition-all font-bold tabular-nums" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Fornecedor</label>
                                <input type="text" required value={pedidoFornecedor} onChange={(e) => setPedidoFornecedor(e.target.value)}
                                    placeholder="Ex: Lukweku Distribuidora"
                                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[#00F2FF] transition-all font-bold" />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowPedidoModal(false)}
                                    className="flex-1 px-6 py-4 bg-white/5 border border-white/10 text-white/60 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all">
                                    Cancelar
                                </button>
                                <button type="submit"
                                    className="flex-1 px-6 py-4 bg-[#00F2FF] text-black font-black text-[10px] uppercase tracking-widest rounded-2xl hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,255,0.3)]">
                                    Criar Pedido
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
}
