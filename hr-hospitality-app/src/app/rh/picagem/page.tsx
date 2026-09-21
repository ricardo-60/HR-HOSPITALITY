'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Timer, Search, Clock, Fingerprint, ArrowLeft, Activity } from 'lucide-react';
import Link from 'next/link';

export default function PicagemPage() {
    const picagens = [
        { id: 'PIC-001', nome: 'Ricardo Ferreira', data: 'Hoje', entrada: '08:00', saida: '---', horas: '4h 30m', status: 'Em Turno' },
        { id: 'PIC-002', nome: 'Ana Sousa', data: 'Hoje', entrada: '07:45', saida: '16:30', horas: '8h 45m', status: 'Turno Fechado' },
        { id: 'PIC-003', nome: 'Maria Conceição', data: 'Hoje', entrada: '09:15', saida: '---', horas: '3h 15m', status: 'Atraso' },
        { id: 'PIC-004', nome: 'Carlos Pereira', data: 'Ontem', entrada: '16:00', saida: '00:30', horas: '8h 30m', status: 'Turno Fechado' },
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
                            <Timer className="text-[#10B981]" /> Tempo & Presença
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Relógio de Ponto, Biometria e Banco de Horas
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input 
                                type="text" 
                                placeholder="Procurar registo..." 
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#10B981]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button className="flex items-center gap-2 bg-[#10B981] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <Fingerprint className="w-4 h-4" /> Picagem Manual
                        </button>
                    </div>
                </motion.div>

                {/* Status Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#111111] border border-[#10B981]/20 p-8 rounded-3xl">
                        <Activity className="w-8 h-8 text-[#10B981] mb-4" />
                        <p className="text-3xl font-black text-white">98%</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Assiduidade Hoje</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Clock className="w-8 h-8 text-[#00F2FF] mb-4" />
                        <p className="text-3xl font-black text-white">314h</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Horas Trabalhadas Mês</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Timer className="w-8 h-8 text-[#F59E0B] mb-4" />
                        <p className="text-3xl font-black text-white">24h</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Horas Extra (Por Pagar)</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Fingerprint className="w-8 h-8 text-[#F43F5E] mb-4" />
                        <p className="text-3xl font-black text-white">1</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Atrasos Detetados</p>
                    </div>
                </div>

                {/* Tabela de Picagens */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">ID Registo</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Colaborador</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Data</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Entrada</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Saída</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Horas Calculadas</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {picagens.map((pic, i) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={pic.id} 
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                                    >
                                        <td className="p-6 text-xs font-bold text-white/50">{pic.id}</td>
                                        <td className="p-6 text-sm font-black text-white">{pic.nome}</td>
                                        <td className="p-6 text-xs font-bold text-white/70">{pic.data}</td>
                                        <td className="p-6 text-xs font-bold text-[#10B981]">{pic.entrada}</td>
                                        <td className="p-6 text-xs font-bold text-white/50">{pic.saida}</td>
                                        <td className="p-6 text-xs font-bold text-white">{pic.horas}</td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                pic.status === 'Turno Fechado' ? 'bg-white/10 text-white/50 border border-white/20' : 
                                                pic.status === 'Em Turno' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 
                                                'bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20'
                                            }`}>
                                                {pic.status}
                                            </span>
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
