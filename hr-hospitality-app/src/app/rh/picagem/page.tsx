'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Search, Clock, Fingerprint, ArrowLeft, Activity, X } from 'lucide-react';
import Link from 'next/link';

type Picagem = { id: string; nome: string; data: string; entrada: string; saida: string; horas: string; status: string };

export const SEED_PICAGENS: Picagem[] = [
    { id: 'PIC-001', nome: 'Ricardo Ferreira', data: 'Hoje', entrada: '08:00', saida: '---', horas: '4h 30m', status: 'Em Turno' },
    { id: 'PIC-002', nome: 'Ana Sousa', data: 'Hoje', entrada: '07:45', saida: '16:30', horas: '8h 45m', status: 'Turno Fechado' },
    { id: 'PIC-003', nome: 'Maria Conceição', data: 'Hoje', entrada: '09:15', saida: '---', horas: '3h 15m', status: 'Atraso' },
    { id: 'PIC-004', nome: 'Carlos Pereira', data: 'Ontem', entrada: '16:00', saida: '00:30', horas: '8h 30m', status: 'Turno Fechado' },
];

const agoraHHMM = () => new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

export default function PicagemPage() {
    const [picagens, setPicagens] = useState<Picagem[]>(SEED_PICAGENS);
    const [busca, setBusca] = useState('');
    const [modal, setModal] = useState(false);
    const [erro, setErro] = useState('');
    const [form, setForm] = useState({ nome: '', tipo: 'Entrada', hora: agoraHHMM() });

    // Hydratação a partir do localStorage (seed com o array atual se vazio)
    useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                const raw = localStorage.getItem('rh_picagens');
                const parsed = raw ? JSON.parse(raw) : null;
                if (Array.isArray(parsed) && parsed.length > 0) setPicagens(parsed);
                else localStorage.setItem('rh_picagens', JSON.stringify(SEED_PICAGENS));
            } catch { /* ignore */ }
        }, 0);
        return () => window.clearTimeout(t);
    }, []);

    // Escape fecha o modal
    useEffect(() => {
        if (!modal) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modal]);

    const guardarPicagens = (lista: Picagem[]) => {
        setPicagens(lista);
        try { localStorage.setItem('rh_picagens', JSON.stringify(lista)); } catch { /* ignore */ }
    };

    const colaboradores = Array.from(new Set(picagens.map(p => p.nome)));

    const abrirModal = () => {
        setErro('');
        setForm({ nome: colaboradores[0] || '', tipo: 'Entrada', hora: agoraHHMM() });
        setModal(true);
    };

    const registarPicagem = () => {
        if (!form.nome) { setErro('Selecione um colaborador.'); return; }
        if (!form.hora) { setErro('Indique a hora da picagem.'); return; }
        const nova: Picagem = {
            id: `PIC-${Date.now().toString().slice(-5)}`,
            nome: form.nome,
            data: 'Hoje',
            entrada: form.tipo === 'Entrada' ? form.hora : '---',
            saida: form.tipo === 'Saída' ? form.hora : '---',
            horas: '---',
            status: form.tipo === 'Entrada' ? 'Em Turno' : 'Turno Fechado',
        };
        guardarPicagens([nova, ...picagens]);
        setErro('');
        setModal(false);
    };

    // Filtro por nome / id
    const q = busca.trim().toLowerCase();
    const visiveis = q
        ? picagens.filter(p => p.nome.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
        : picagens;

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:outline-none focus:border-[#10B981]/50 transition-all placeholder:text-white/20';
    const labelCls = 'block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2';

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
                            <Timer className="text-[#10B981]" /> Tempo &amp; Presença
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
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Procurar registo..."
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#10B981]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button
                            onClick={abrirModal}
                            className="flex items-center gap-2 bg-[#10B981] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                        >
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
                                {visiveis.map((pic, i) => (
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
                                {visiveis.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                            Sem registos que correspondam à pesquisa.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal: Picagem Manual */}
            <AnimatePresence>
                {modal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setModal(false)}
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
                                    <Fingerprint className="w-5 h-5 text-[#10B981]" /> Picagem Manual
                                </h3>
                                <button
                                    onClick={() => setModal(false)}
                                    aria-label="Fechar"
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className={labelCls}>Colaborador</label>
                                    <select
                                        value={form.nome}
                                        onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                                        className={inputCls}
                                    >
                                        <option value="">Selecione...</option>
                                        {colaboradores.map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Tipo</label>
                                        <select
                                            value={form.tipo}
                                            onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
                                            className={inputCls}
                                        >
                                            <option value="Entrada">Entrada</option>
                                            <option value="Saída">Saída</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Hora (por omissão: agora)</label>
                                        <input
                                            type="time"
                                            value={form.hora}
                                            onChange={(e) => setForm(f => ({ ...f, hora: e.target.value }))}
                                            className={inputCls}
                                        />
                                    </div>
                                </div>

                                {erro && (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20 rounded-2xl px-4 py-3">
                                        {erro}
                                    </p>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={registarPicagem}
                                        className="flex-1 bg-[#10B981] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all"
                                    >
                                        Registar Picagem
                                    </button>
                                    <button
                                        onClick={() => setModal(false)}
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
