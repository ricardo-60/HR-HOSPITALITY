'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { DoorOpen, Search, FileX, ArrowLeft, AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';

type Desligamento = { id: string; nome: string; data: string; motivo: string; avisoPrevi: string; equipamentos: string; status: string };

export const SEED_DESLIGAMENTOS: Desligamento[] = [
    { id: 'OFF-001', nome: 'António Costa', data: '15/06/2026', motivo: 'Término de Contrato', avisoPrevi: 'Sim', equipamentos: 'Pendente', status: 'Em Processamento' },
    { id: 'OFF-002', nome: 'Sandra Dias', data: '01/05/2026', motivo: 'Demissão Voluntária', avisoPrevi: 'Sim', equipamentos: 'Devolvidos', status: 'Concluído' },
];

const MOTIVOS = ['Término de Contrato', 'Demissão Voluntária', 'Despedimento por Iniciativa da Empresa'];

export default function SaidasPage() {
    const [desligamentos, setDesligamentos] = useState<Desligamento[]>(SEED_DESLIGAMENTOS);
    const [busca, setBusca] = useState('');
    const [modal, setModal] = useState(false);
    const [erro, setErro] = useState('');
    const [form, setForm] = useState({ nome: '', data: '', motivo: MOTIVOS[0], avisoPrevi: 'Sim', equipamentos: 'Pendente' });

    // Hydratação a partir do localStorage (seed com o array atual se vazio)
    useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                const raw = localStorage.getItem('rh_saidas');
                const parsed = raw ? JSON.parse(raw) : null;
                if (Array.isArray(parsed) && parsed.length > 0) setDesligamentos(parsed);
                else localStorage.setItem('rh_saidas', JSON.stringify(SEED_DESLIGAMENTOS));
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

    const guardarDesligamentos = (lista: Desligamento[]) => {
        setDesligamentos(lista);
        try { localStorage.setItem('rh_saidas', JSON.stringify(lista)); } catch { /* ignore */ }
    };

    const criarProcesso = () => {
        if (!form.nome.trim()) { setErro('Indique o colaborador.'); return; }
        if (!form.data.trim()) { setErro('Indique a data efetiva (dd/mm/aaaa).'); return; }
        const novo: Desligamento = {
            id: `OFF-${Date.now().toString().slice(-5)}`,
            nome: form.nome.trim(),
            data: form.data.trim(),
            motivo: form.motivo,
            avisoPrevi: form.avisoPrevi,
            equipamentos: form.equipamentos,
            status: 'Em Processamento',
        };
        guardarDesligamentos([novo, ...desligamentos]);
        setForm({ nome: '', data: '', motivo: MOTIVOS[0], avisoPrevi: 'Sim', equipamentos: 'Pendente' });
        setErro('');
        setModal(false);
    };

    // Avança/alterna o status do processo
    const avancarStatus = (id: string) => {
        guardarDesligamentos(desligamentos.map(d => (
            d.id === id ? { ...d, status: d.status === 'Concluído' ? 'Em Processamento' : 'Concluído' } : d
        )));
    };

    // Filtro por nome / processo
    const q = busca.trim().toLowerCase();
    const visiveis = q
        ? desligamentos.filter(d => d.nome.toLowerCase().includes(q) || d.id.toLowerCase().includes(q))
        : desligamentos;

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:outline-none focus:border-[#EC4899]/50 transition-all placeholder:text-white/20';
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
                            <DoorOpen className="text-[#EC4899]" /> Saídas &amp; Desligamentos
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
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Procurar registo..."
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#EC4899]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button
                            onClick={() => { setErro(''); setModal(true); }}
                            className="flex items-center gap-2 bg-[#EC4899] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                        >
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
                            <li className="flex items-center gap-2 text-white">⭕ Devolução Farda &amp; Chaves</li>
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
                                {visiveis.map((off, i) => (
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
                                        <td className="p-6 text-xs font-bold text-white/70">
                                            {off.motivo}
                                            <span className="block text-[9px] text-white/30 mt-1">Aviso prévio: {off.avisoPrevi}</span>
                                        </td>
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
                                            <button
                                                onClick={(e) => { e.stopPropagation(); avancarStatus(off.id); }}
                                                title={off.status === 'Concluído' ? 'Reabrir processo' : 'Concluir processo'}
                                                aria-label={`Avançar status do processo ${off.id}`}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <ArrowLeft className="w-4 h-4 rotate-180" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                                {visiveis.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                            Sem processos que correspondam à pesquisa.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal: Novo Processo de Saída */}
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
                                    <FileX className="w-5 h-5 text-[#EC4899]" /> Novo Processo
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
                                    <input
                                        type="text"
                                        value={form.nome}
                                        onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                                        placeholder="Nome do colaborador"
                                        className={inputCls}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Data Efetiva</label>
                                        <input
                                            type="text"
                                            value={form.data}
                                            onChange={(e) => setForm(f => ({ ...f, data: e.target.value }))}
                                            placeholder="15/06/2026"
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Aviso Prévio</label>
                                        <select
                                            value={form.avisoPrevi}
                                            onChange={(e) => setForm(f => ({ ...f, avisoPrevi: e.target.value }))}
                                            className={inputCls}
                                        >
                                            <option value="Sim">Sim</option>
                                            <option value="Não">Não</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className={labelCls}>Motivo</label>
                                    <select
                                        value={form.motivo}
                                        onChange={(e) => setForm(f => ({ ...f, motivo: e.target.value }))}
                                        className={inputCls}
                                    >
                                        {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className={labelCls}>Equipamentos</label>
                                    <select
                                        value={form.equipamentos}
                                        onChange={(e) => setForm(f => ({ ...f, equipamentos: e.target.value }))}
                                        className={inputCls}
                                    >
                                        <option value="Pendente">Pendente</option>
                                        <option value="Devolvidos">Devolvidos</option>
                                    </select>
                                </div>

                                {erro && (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20 rounded-2xl px-4 py-3">
                                        {erro}
                                    </p>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={criarProcesso}
                                        className="flex-1 bg-[#EC4899] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all"
                                    >
                                        Criar Processo
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
