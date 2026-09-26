'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { HeartPulse, Search, Calendar, Check, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Pedido = { id: string; nome: string; tipo: string; datas: string; status: string };

export const SEED_PEDIDOS: Pedido[] = [
    { id: 'REQ-101', nome: 'João Silva', tipo: 'Férias Anuais', datas: '05/03 - 19/03 (15 dias)', status: 'Aprovado' },
    { id: 'REQ-102', nome: 'Carlos Pereira', tipo: 'Baixa Médica', datas: '12/03 - 14/03 (3 dias)', status: 'Pendente' },
    { id: 'REQ-103', nome: 'Ana Sousa', tipo: 'Férias Anuais', datas: '01/08 - 15/08 (15 dias)', status: 'Pendente' },
    { id: 'REQ-104', nome: 'Maria Conceição', tipo: 'Folga Extra', datas: '20/03 (1 dia)', status: 'Rejeitado' },
];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Extrai o intervalo dd/mm - dd/mm (ou dia único) do campo `datas`
const intervaloDe = (datas: string) => {
    const m = datas.match(/(\d{2})\/(\d{2})(?:\s*-\s*(\d{2})\/(\d{2}))?/);
    if (!m) return null;
    const ano = new Date().getFullYear();
    const ini = new Date(ano, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    const fim = m[3] ? new Date(ano, parseInt(m[4], 10) - 1, parseInt(m[3], 10)) : ini;
    return { ini, fim };
};

export default function FeriasPage() {
    const [pedidos, setPedidos] = useState<Pedido[]>(SEED_PEDIDOS);
    const [busca, setBusca] = useState('');
    const [historico, setHistorico] = useState(false); // false = só pendentes, true = todos
    const [vistaMapa, setVistaMapa] = useState(false);
    const [aviso, setAviso] = useState('');

    // Hydratação a partir do localStorage (seed com o array atual se vazio)
    useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                const raw = localStorage.getItem('rh_ferias');
                const parsed = raw ? JSON.parse(raw) : null;
                if (Array.isArray(parsed) && parsed.length > 0) setPedidos(parsed);
                else localStorage.setItem('rh_ferias', JSON.stringify(SEED_PEDIDOS));
            } catch { /* ignore */ }
        }, 0);
        return () => window.clearTimeout(t);
    }, []);

    // O aviso de feedback desaparece sozinho
    useEffect(() => {
        if (!aviso) return;
        const t = setTimeout(() => setAviso(''), 4000);
        return () => clearTimeout(t);
    }, [aviso]);

    const guardarPedidos = (lista: Pedido[]) => {
        setPedidos(lista);
        try { localStorage.setItem('rh_ferias', JSON.stringify(lista)); } catch { /* ignore */ }
    };

    const responder = (id: string, status: 'Aprovado' | 'Rejeitado') => {
        guardarPedidos(pedidos.map(p => (p.id === id ? { ...p, status } : p)));
        setAviso(`${id} ${status.toLowerCase()} — movido para o histórico.`);
    };

    // Filtro por nome + alternância pendentes/histórico
    const q = busca.trim().toLowerCase();
    const filtrados = pedidos.filter(p => (q ? p.nome.toLowerCase().includes(q) : true));
    const visiveis = historico ? filtrados : filtrados.filter(p => p.status === 'Pendente');

    // Vista de mapa: meses envolvidos nos pedidos visíveis
    const anoAtual = new Date().getFullYear();
    const meses = Array.from(new Set(
        visiveis.map(p => { const iv = intervaloDe(p.datas); return iv ? iv.ini.getMonth() : new Date().getMonth(); })
    )).sort((a, b) => a - b);

    const corStatus = (status: string) =>
        status === 'Aprovado' ? 'bg-[#10B981]/20 border-[#10B981]/40 text-[#10B981]' :
        status === 'Rejeitado' ? 'bg-[#F43F5E]/20 border-[#F43F5E]/40 text-[#F43F5E]' :
        'bg-[#F59E0B]/20 border-[#F59E0B]/40 text-[#F59E0B]';

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
                            <HeartPulse className="text-[#F43F5E]" /> Férias &amp; Ausências
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
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Procurar pedido..."
                                className="bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-[#F43F5E]/50 w-72 transition-all font-bold placeholder:text-white/20"
                            />
                        </div>
                        <button
                            onClick={() => setVistaMapa(v => !v)}
                            className="flex items-center gap-2 bg-[#F43F5E] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                        >
                            <Calendar className="w-4 h-4" /> {vistaMapa ? 'Ver Lista' : 'Ver Mapa'}
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

                {/* Vista de Mapa (calendário com marcadores por pedido) */}
                {vistaMapa ? (
                    <div className="space-y-8">
                        <div className="flex flex-wrap items-center gap-4">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Legenda:</span>
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">Aprovado</span>
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">Pendente</span>
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20">Rejeitado</span>
                        </div>

                        {meses.map(mes => {
                            const primeiro = new Date(anoAtual, mes, 1);
                            const totalDias = new Date(anoAtual, mes + 1, 0).getDate();
                            const lider = (primeiro.getDay() + 6) % 7;
                            const doMes = visiveis.filter(p => { const iv = intervaloDe(p.datas); return iv && iv.ini.getMonth() === mes; });
                            return (
                                <div key={mes} className="bg-[#111111] border border-white/5 rounded-[40px] p-8">
                                    <h3 className="text-lg font-black text-white uppercase tracking-widest mb-6">
                                        {MESES[mes]} {anoAtual}
                                    </h3>
                                    <div className="grid grid-cols-7 gap-2 mb-3">
                                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
                                            <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${i > 4 ? 'text-[#F43F5E]' : 'text-white/40'}`}>{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-2">
                                        {Array.from({ length: lider }, (_, i) => <div key={`e-${i}`} />)}
                                        {Array.from({ length: totalDias }, (_, i) => i + 1).map(d => {
                                            const date = new Date(anoAtual, mes, d);
                                            const marcados = visiveis.filter(p => {
                                                const iv = intervaloDe(p.datas);
                                                return iv && date >= iv.ini && date <= iv.fim;
                                            });
                                            const cor = marcados.length ? corStatus(marcados[0].status) : '';
                                            return (
                                                <div
                                                    key={d}
                                                    title={marcados.map(x => `${x.nome} — ${x.tipo} (${x.status})`).join(', ')}
                                                    className={`min-h-[72px] rounded-2xl border p-2 flex flex-col items-center justify-center gap-1 ${cor || 'bg-white/[0.02] border-white/5'}`}
                                                >
                                                    <span className={`text-xs font-black ${marcados.length ? 'text-white' : 'text-white/30'}`}>{d}</span>
                                                    {marcados.map(x => (
                                                        <span key={x.id} className="text-[8px] font-bold text-white/70 truncate max-w-full">{x.nome.split(' ')[0]}</span>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {doMes.length > 0 && (
                                        <ul className="mt-6 space-y-2">
                                            {doMes.map(p => (
                                                <li key={p.id} className="flex items-center justify-between gap-4 bg-white/5 border border-white/5 rounded-2xl px-5 py-3">
                                                    <span className="text-xs font-bold text-white/70"><span className="text-white/40">{p.id}</span> — {p.nome} · {p.datas}</span>
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${corStatus(p.status)}`}>{p.status}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}

                        {meses.length === 0 && (
                            <div className="bg-[#111111] border border-white/5 rounded-[40px] p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                Sem pedidos para mostrar no mapa.
                            </div>
                        )}
                    </div>
                ) : (
                    /* Table */
                    <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5 flex-wrap gap-4">
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">
                                {historico ? 'Histórico Completo' : 'Pedidos Recentes'}
                            </h2>
                            <div className="flex items-center gap-4">
                                {aviso && (
                                    <span className="inline-flex items-center gap-2 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">
                                        <Check className="w-3.5 h-3.5" /> {aviso}
                                    </span>
                                )}
                                <button
                                    onClick={() => setHistorico(h => !h)}
                                    className="text-[10px] font-black text-[#F43F5E] uppercase tracking-widest border border-[#F43F5E]/20 px-4 py-2 rounded-full hover:bg-[#F43F5E]/10 transition-colors"
                                >
                                    {historico ? 'Ocultar Histórico' : 'Ver Histórico'}
                                </button>
                            </div>
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
                                    {visiveis.map((req, i) => (
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
                                                        <button
                                                            onClick={() => responder(req.id, 'Aprovado')}
                                                            title="Aprovar pedido"
                                                            aria-label={`Aprovar ${req.id}`}
                                                            className="p-2 bg-[#10B981]/10 rounded-lg hover:bg-[#10B981]/20 text-[#10B981] transition-colors"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => responder(req.id, 'Rejeitado')}
                                                            title="Rejeitar pedido"
                                                            aria-label={`Rejeitar ${req.id}`}
                                                            className="p-2 bg-[#F43F5E]/10 rounded-lg hover:bg-[#F43F5E]/20 text-[#F43F5E] transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                    {visiveis.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                                Sem pedidos que correspondam aos filtros atuais.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
