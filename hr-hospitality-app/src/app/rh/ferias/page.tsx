'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { HeartPulse, Search, Plus, Calendar, Check, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function FeriasPage() {
    const pedidos = [
        { id: 'REQ-101', nome: 'João Silva', tipo: 'Férias Anuais', datas: '05/03 - 19/03 (15 dias)', status: 'Aprovado' },
        { id: 'REQ-102', nome: 'Carlos Pereira', tipo: 'Baixa Médica', datas: '12/03 - 14/03 (3 dias)', status: 'Pendente' },
        { id: 'REQ-103', nome: 'Ana Sousa', tipo: 'Férias Anuais', datas: '01/08 - 15/08 (15 dias)', status: 'Pendente' },
        { id: 'REQ-104', nome: 'Maria Conceição', tipo: 'Folga Extra', datas: '20/03 (1 dia)', status: 'Rejeitado' },
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
                            <HeartPulse className="text-[#F43F5E]" /> Férias & Ausências
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Aprovações, Baixas Médicas e Calendário Global
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input 
                                type="text" 
                                placeholder="Procurar pedido..." 
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#F43F5E]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button className="flex items-center gap-2 bg-[#F43F5E] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                            <Calendar className="w-4 h-4" /> Ver Mapa
                        </button>
                    </div>
                </motion.div>

                {/* Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl flex items-center gap-6">
                        <div className="p-4 bg-white/5 rounded-2xl"><HeartPulse className="w-8 h-8 text-[#F43F5E]" /></div>
                        <div>
                            <p className="text-3xl font-black text-white">3</p>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Atualmente Ausentes</p>
                        </div>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl flex items-center gap-6">
                        <div className="p-4 bg-white/5 rounded-2xl"><Calendar className="w-8 h-8 text-[#F59E0B]" /></div>
                        <div>
                            <p className="text-3xl font-black text-white">12</p>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pedidos Pendentes</p>
                        </div>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl flex items-center gap-6">
                        <div className="p-4 bg-white/5 rounded-2xl"><Check className="w-8 h-8 text-[#10B981]" /></div>
                        <div>
                            <p className="text-3xl font-black text-white">45</p>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Aprovados este mês</p>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Pedidos Recentes</h2>
                        <button className="text-[10px] font-black text-[#F43F5E] uppercase tracking-widest border border-[#F43F5E]/20 px-4 py-2 rounded-full hover:bg-[#F43F5E]/10 transition-colors">
                            Ver Histórico
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-black/20">
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">ID</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Colaborador</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Tipo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Datas / Duração</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Status</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Aprovação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidos.map((req, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={req.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                                    >
                                        <td className="p-6 text-xs font-bold text-white/50">{req.id}</td>
                                        <td className="p-6 text-sm font-black text-white">{req.nome}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{req.tipo}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{req.datas}</td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                req.status === 'Aprovado' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 
                                                req.status === 'Rejeitado' ? 'bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20' : 
                                                'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                            }`}>
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            {req.status === 'Pendente' && (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="p-2 bg-[#10B981]/10 rounded-lg hover:bg-[#10B981]/20 text-[#10B981] transition-colors">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button className="p-2 bg-[#F43F5E]/10 rounded-lg hover:bg-[#F43F5E]/20 text-[#F43F5E] transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
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
