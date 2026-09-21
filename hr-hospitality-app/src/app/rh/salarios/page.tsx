'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { TrendingUp, Search, Download, FileSpreadsheet, ArrowLeft, DollarSign, Percent } from 'lucide-react';
import Link from 'next/link';

export default function SalariosPage() {
    const vencimentos = [
        { id: 'REC-06-001', nome: 'Ricardo Ferreira', cargo: 'Admin', salario: '3,500.00', bonus: '500.00', total: '4,000.00', status: 'Processado' },
        { id: 'REC-06-002', nome: 'Ana Sousa', cargo: 'Rececionista (SPA)', salario: '1,200.00', bonus: '150.00', total: '1,350.00', status: 'Pendente' },
        { id: 'REC-06-003', nome: 'João Silva', cargo: 'Técnico', salario: '1,100.00', bonus: '0.00', total: '1,100.00', status: 'Processado' },
        { id: 'REC-06-004', nome: 'Maria Conceição', cargo: 'Supervisora', salario: '1,400.00', bonus: '200.00', total: '1,600.00', status: 'Pendente' },
        { id: 'REC-06-005', nome: 'Carlos Pereira', cargo: 'Chefe de Sala', salario: '1,800.00', bonus: '450.00', total: '2,250.00', status: 'Pendente' },
    ];

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-12 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-8 border-b border-white/5 pb-8"
                >
                    <div>
                        <Link href="/rh" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6 font-bold uppercase tracking-widest text-[10px]">
                            <ArrowLeft className="w-4 h-4" /> Voltar ao Painel RH
                        </Link>
                        <h1 className="text-5xl font-black text-white tracking-tighter uppercase flex items-center gap-4">
                            <TrendingUp className="text-[#8B5CF6]" /> Processamento Salarial
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Vencimentos, Bónus, Descontos e Comissões
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all">
                            <FileSpreadsheet className="w-4 h-4" /> Exportar SEPA
                        </button>
                        <button className="flex items-center gap-2 bg-[#8B5CF6] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                            <DollarSign className="w-4 h-4" /> Processar Mês Atual
                        </button>
                    </div>
                </motion.div>

                {/* Status Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#111111] border border-[#8B5CF6]/20 p-8 rounded-3xl">
                        <DollarSign className="w-8 h-8 text-[#8B5CF6] mb-4" />
                        <p className="text-3xl font-black text-white">42,500€</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Massa Salarial Estimada</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Percent className="w-8 h-8 text-[#00F2FF] mb-4" />
                        <p className="text-3xl font-black text-white">1,850€</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Comissões a Pagar (POS)</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <TrendingUp className="w-8 h-8 text-[#F59E0B] mb-4" />
                        <p className="text-3xl font-black text-white">35</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Recibos Pendentes</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Download className="w-8 h-8 text-[#10B981] mb-4" />
                        <p className="text-3xl font-black text-white">Junho</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Mês de Referência</p>
                    </div>
                </div>

                {/* Tabela de Salários */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Pré-Visualização (Junho 2026)</h2>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input 
                                type="text" 
                                placeholder="Procurar funcionário..." 
                                className="bg-black/50 border border-white/10 rounded-full py-2 pl-10 pr-6 text-xs text-white focus:outline-none focus:border-[#8B5CF6]/50 transition-all font-bold"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-black/20">
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">ID Recibo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Colaborador</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Cargo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Salário Base (€)</th>
                                    <th className="p-6 text-[10px] font-black text-[#00F2FF] uppercase tracking-widest whitespace-nowrap text-right">Bónus/Comissões (€)</th>
                                    <th className="p-6 text-[10px] font-black text-[#10B981] uppercase tracking-widest whitespace-nowrap text-right">Total a Receber (€)</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Status</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vencimentos.map((venc, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={venc.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                                    >
                                        <td className="p-6 text-xs font-bold text-white/50">{venc.id}</td>
                                        <td className="p-6 text-sm font-black text-white">{venc.nome}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{venc.cargo}</td>
                                        <td className="p-6 text-sm font-bold text-white/50 text-right">{venc.salario}</td>
                                        <td className="p-6 text-sm font-bold text-[#00F2FF] text-right">+{venc.bonus}</td>
                                        <td className="p-6 text-sm font-black text-[#10B981] text-right">{venc.total}</td>
                                        <td className="p-6 text-right">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                venc.status === 'Processado' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 
                                                'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                            }`}>
                                                {venc.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button className="p-2 bg-white/5 rounded-lg hover:bg-[#8B5CF6]/20 text-white/50 hover:text-[#8B5CF6] transition-colors opacity-0 group-hover:opacity-100">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
