'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Box, ShoppingCart, Truck, AlertTriangle, Calendar, ClipboardList } from 'lucide-react';

const inventoryItems = [
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
                        <button className="px-8 py-4 bg-[#00F2FF] text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,255,0.3)]">Novo Pedido</button>
                        <button className="px-8 py-4 bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all">Relatório Stock</button>
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
                        <button className="mt-12 px-8 py-4 bg-white/5 border border-white/10 text-white font-black text-[9px] uppercase tracking-[0.3em] rounded-xl hover:bg-cyber-purple hover:text-black transition-all">Ver Manifesto de Carga</button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
