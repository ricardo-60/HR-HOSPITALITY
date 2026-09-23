'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Plus, FileText, Settings, ArrowLeft, StickyNote, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import VoiceInput from '@/components/voice/VoiceInput';

type Empregado = { id: string; nome: string; cargo: string; departamento: string; status: string; data: string };

export const EMPREGADOS_BASE: Empregado[] = [
    { id: 'EMP-001', nome: 'Ricardo Ferreira', cargo: 'Administrador de Sistema', departamento: 'Gestão', status: 'Ativo', data: '12/01/2025' },
    { id: 'EMP-002', nome: 'Ana Sousa', cargo: 'Rececionista (SPA)', departamento: 'Wellness', status: 'Ativo', data: '14/01/2026' },
    { id: 'EMP-003', nome: 'João Silva', cargo: 'Técnico de Manutenção', departamento: 'Operações', status: 'Férias', data: '05/03/2024' },
    { id: 'EMP-004', nome: 'Maria Conceição', cargo: 'Supervisora de Andares', departamento: 'Housekeeping', status: 'Ativo', data: '22/11/2023' },
    { id: 'EMP-005', nome: 'Carlos Pereira', cargo: 'Chefe de Sala (Restaurante)', departamento: 'F&B', status: 'Folga', data: '10/05/2025' },
    { id: 'EMP-006', nome: 'Sara Mendes', cargo: 'Terapeuta Principal', departamento: 'Wellness', status: 'Ativo', data: '02/09/2025' },
];

export default function EmpregadosPage() {
    // Ocorrências & justificações do staff — ditáveis por voz (persistidas localmente)
    const [ocorrencias, setOcorrencias] = useState<string[]>([]);
    const [novaOcorrencia, setNovaOcorrencia] = useState('');

    // Diretório: pesquisa + estado por colaborador (persistido) + ficha aberta
    const [busca, setBusca] = useState('');
    const [estados, setEstados] = useState<Record<string, string>>({});
    const [fichaId, setFichaId] = useState<string | null>(null);

    useEffect(() => {
        try { setOcorrencias(JSON.parse(localStorage.getItem('rh_ocorrencias') || '[]')); } catch { /* ignore */ }
        try { setEstados(JSON.parse(localStorage.getItem('rh_empregados_estado') || '{}')); } catch { /* ignore */ }
    }, []);

    // Escape fecha a ficha
    useEffect(() => {
        if (!fichaId) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFichaId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [fichaId]);

    const guardarOcorrencias = (lista: string[]) => {
        setOcorrencias(lista);
        localStorage.setItem('rh_ocorrencias', JSON.stringify(lista));
    };

    const adicionarOcorrencia = (texto: string) => {
        const t = texto.trim();
        if (!t) return;
        const registo = `[${new Date().toLocaleString('pt-PT')}] ${t}`;
        guardarOcorrencias([registo, ...ocorrencias]);
        setNovaOcorrencia('');
    };

    // Filtro por nome / id / cargo
    const q = busca.trim().toLowerCase();
    const empregados = EMPREGADOS_BASE.map(e => (estados[e.id] ? { ...e, status: estados[e.id] } : e));
    const filtrados = q
        ? empregados.filter(e =>
            e.nome.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q) ||
            e.cargo.toLowerCase().includes(q))
        : empregados;

    const ficha = fichaId ? empregados.find(e => e.id === fichaId) || null : null;

    // Alterna Ativo ↔ Férias, persistido em rh_empregados_estado
    const alternarEstado = (id: string) => {
        const atual = empregados.find(e => e.id === id)?.status || 'Ativo';
        const novo = atual === 'Ativo' ? 'Férias' : 'Ativo';
        const novos = { ...estados, [id]: novo };
        setEstados(novos);
        try { localStorage.setItem('rh_empregados_estado', JSON.stringify(novos)); } catch { /* ignore */ }
    };

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
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Procurar colaborador..."
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#00F2FF]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <Link
                            href="/cadastro"
                            className="flex items-center gap-2 bg-[#00F2FF] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,242,255,0.3)]"
                        >
                            <Plus className="w-4 h-4" /> Novo
                        </Link>
                    </div>
                </motion.div>

                {/* Ocorrências & Justificações — ditado por voz */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] p-8 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                            <StickyNote className="w-4 h-4 text-[#00F2FF]" /> Ocorrências &amp; Justificações
                        </h2>
                        <VoiceInput
                            language="pt"
                            onText={(t) => setNovaOcorrencia(prev => (prev ? prev + ' ' + t : t))}
                        />
                    </div>
                    <div className="flex gap-3">
                        <textarea
                            value={novaOcorrencia}
                            onChange={(e) => setNovaOcorrencia(e.target.value)}
                            rows={2}
                            placeholder="Ex: falta justificada do João Silva por razões médicas... (ou clique no microfone para ditar)"
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:outline-none focus:border-[#00F2FF]/50 transition-all placeholder:text-white/20 resize-none"
                        />
                        <button
                            onClick={() => adicionarOcorrencia(novaOcorrencia)}
                            disabled={!novaOcorrencia.trim()}
                            className="self-stretch px-6 rounded-2xl bg-[#00F2FF]/10 border border-[#00F2FF]/30 text-[#00F2FF] font-black text-xs uppercase tracking-widest hover:bg-[#00F2FF] hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Registar
                        </button>
                    </div>

                    {ocorrencias.length > 0 && (
                        <ul className="mt-6 space-y-3">
                            {ocorrencias.map((o, i) => (
                                <li key={i} className="flex items-start justify-between gap-4 bg-white/5 border border-white/5 rounded-2xl px-5 py-4">
                                    <p className="text-sm text-white/70 font-medium leading-relaxed">{o}</p>
                                    <button
                                        onClick={() => guardarOcorrencias(ocorrencias.filter((_, j) => j !== i))}
                                        title="Apagar ocorrência"
                                        aria-label="Apagar ocorrência"
                                        className="p-2 text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

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
                                {filtrados.map((emp, i) => (
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
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setFichaId(emp.id); }}
                                                    title="Ver ficha do colaborador"
                                                    aria-label={`Ver ficha de ${emp.nome}`}
                                                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setFichaId(emp.id); }}
                                                    title="Gerir estado do colaborador"
                                                    aria-label={`Gerir ${emp.nome}`}
                                                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-[#00F2FF] transition-colors"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                                {filtrados.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                            Sem colaboradores que correspondam à pesquisa.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal: Ficha do Colaborador */}
            <AnimatePresence>
                {ficha && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setFichaId(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-3xl p-8"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-[#00F2FF]" /> Ficha {ficha.id}
                                </h3>
                                <button
                                    onClick={() => setFichaId(null)}
                                    aria-label="Fechar"
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
                                    <p className="text-lg font-black text-white">{ficha.nome}</p>
                                    <p className="text-xs font-bold text-white/60 mt-1">{ficha.cargo}</p>
                                </div>

                                <dl className="grid grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <dt className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Departamento</dt>
                                        <dd className="font-bold text-white/80">{ficha.departamento}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Data Admissão</dt>
                                        <dd className="font-bold text-white/80">{ficha.data}</dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Estado</dt>
                                        <dd>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                ficha.status === 'Ativo' ? 'bg-[#00F2FF]/10 text-[#00F2FF] border border-[#00F2FF]/20' :
                                                ficha.status === 'Férias' ? 'bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20' :
                                                'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                            }`}>
                                                {ficha.status}
                                            </span>
                                        </dd>
                                    </div>
                                </dl>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => alternarEstado(ficha.id)}
                                        className="flex-1 bg-[#00F2FF]/10 border border-[#00F2FF]/30 text-[#00F2FF] px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-[#00F2FF] hover:text-black transition-all"
                                    >
                                        Alternar Ativo / Férias
                                    </button>
                                    <button
                                        onClick={() => setFichaId(null)}
                                        className="bg-white/5 border border-white/10 text-white/60 hover:text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
}
