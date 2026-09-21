'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, Search, Plus, FileText, Settings, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EmpregadosPage() {
    const empregados = [
        { id: 'EMP-001', nome: 'Ricardo Ferreira', cargo: 'Administrador de Sistema', departamento: 'Gestão', status: 'Ativo', data: '12/01/2025' },
        { id: 'EMP-002', nome: 'Ana Sousa', cargo: 'Rececionista (SPA)', departamento: 'Wellness', status: 'Ativo', data: '14/01/2026' },
        { id: 'EMP-003', nome: 'João Silva', cargo: 'Técnico de Manutenção', departamento: 'Operações', status: 'Férias', data: '05/03/2024' },
        { id: 'EMP-004', nome: 'Maria Conceição', cargo: 'Supervisora de Andares', departamento: 'Housekeeping', status: 'Ativo', data: '22/11/2023' },
        { id: 'EMP-005', nome: 'Carlos Pereira', cargo: 'Chefe de Sala (Restaurante)', departamento: 'F&B', status: 'Folga', data: '10/05/2025' },
        { id: 'EMP-006', nome: 'Sara Mendes', cargo: 'Terapeuta Principal', departamento: 'Wellness', status: 'Ativo', data: '02/09/2025' },
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
                            <Users className="text-[#00F2FF]" /> Diretório de Staff
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Gestão de Fichas de Empregado e Estrutura Orgânica
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input 
                                type="text" 
                                placeholder="Procurar colaborador..." 
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#00F2FF]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button className="flex items-center gap-2 bg-[#00F2FF] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,242,255,0.3)]">
                            <Plus className="w-4 h-4" /> Novo
                        </button>
                    </div>
                </motion.div>

                {/* Table */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">ID</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Nome</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Cargo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Departamento</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Data Admissão</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Status</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {empregados.map((emp, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={emp.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                                    >
                                        <td className="p-6 text-xs font-bold text-white/50">{emp.id}</td>
                                        <td className="p-6 text-sm font-black text-white">{emp.nome}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{emp.cargo}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">
                                            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">{emp.departamento}</span>
                                        </td>
                                        <td className="p-6 text-xs font-bold text-white/40">{emp.data}</td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                emp.status === 'Ativo' ? 'bg-[#00F2FF]/10 text-[#00F2FF] border border-[#00F2FF]/20' : 
                                                emp.status === 'Férias' ? 'bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20' : 
                                                'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                            }`}>
                                                {emp.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                                <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-[#00F2FF] transition-colors">
                                                    <Settings className="w-4 h-4" />
                                                </button>
                                            </div>
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
