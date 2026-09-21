'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { DoorOpen, Search, FileX, ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function SaidasPage() {
    const desligamentos = [
        { id: 'OFF-001', nome: 'António Costa', data: '15/06/2026', motivo: 'Término de Contrato', avisoPrevi: 'Sim', equipamentos: 'Pendente', status: 'Em Processamento' },
        { id: 'OFF-002', nome: 'Sandra Dias', data: '01/05/2026', motivo: 'Demissão Voluntária', avisoPrevi: 'Sim', equipamentos: 'Devolvidos', status: 'Concluído' },
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
                            <DoorOpen className="text-[#EC4899]" /> Saídas & Desligamentos
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Processos de Offboarding, Acertos Finais e Devoluções
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input 
                                type="text" 
                                placeholder="Procurar registo..." 
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#EC4899]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button className="flex items-center gap-2 bg-[#EC4899] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                            <FileX className="w-4 h-4" /> Novo Processo
                        </button>
                    </div>
                </motion.div>

                {/* Status Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#111111] border border-[#EC4899]/20 p-8 rounded-3xl flex flex-col justify-center">
                        <AlertTriangle className="w-8 h-8 text-[#EC4899] mb-4" />
                        <p className="text-3xl font-black text-white">1</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Processos Pendentes</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl flex flex-col justify-center">
                        <DoorOpen className="w-8 h-8 text-white/40 mb-4" />
                        <p className="text-3xl font-black text-white">2</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Saídas no Ano (2026)</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl flex flex-col justify-center">
                        <p className="text-[10px] font-black text-[#EC4899] uppercase tracking-widest mb-4">Checklist de Offboarding</p>
                        <ul className="text-xs font-bold text-white/50 space-y-3">
                            <li className="flex items-center gap-2">✓ Revogação de Acessos POS</li>
                            <li className="flex items-center gap-2">✓ Cálculo Sub. Férias/Natal</li>
                            <li className="flex items-center gap-2 text-white">⭕ Devolução Farda & Chaves</li>
                            <li className="flex items-center gap-2">⭕ Assinatura Rescisão</li>
                        </ul>
                    </div>
                </div>

                {/* Tabela de Offboarding */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Processo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Ex-Colaborador</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Data Efetiva</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Motivo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Equipamentos</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Status</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {desligamentos.map((off, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={off.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                        <td className="p-6 text-xs font-bold text-white/50">{off.id}</td>
                                        <td className="p-6 text-sm font-black text-white">{off.nome}</td>
                                        <td className="p-6 text-xs font-bold text-[#EC4899]">{off.data}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{off.motivo}</td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                off.equipamentos === 'Devolvidos' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 
                                                'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                            }`}>
                                                {off.equipamentos}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                off.status === 'Concluído' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 
                                                'bg-[#EC4899]/10 text-[#EC4899] border border-[#EC4899]/20'
                                            }`}>
                                                {off.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                                                <ArrowLeft className="w-4 h-4 rotate-180" />
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
