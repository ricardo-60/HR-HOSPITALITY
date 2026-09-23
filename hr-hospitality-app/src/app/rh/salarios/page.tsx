'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { TrendingUp, Search, Download, FileSpreadsheet, ArrowLeft, DollarSign, Percent, Check } from 'lucide-react';
import Link from 'next/link';

type Vencimento = { id: string; nome: string; cargo: string; salario: string; bonus: string; total: string; status: string };

// Prefixo do recibo gerado a partir do mês corrente (evita IDs "REC-06"
// hardcoded a contradizer o mês de referência dinâmico).
const MES_RECIBO = String(new Date().getMonth() + 1).padStart(2, '0');
export const SEED_VENCIMENTOS: Vencimento[] = [
    { id: `REC-${MES_RECIBO}-001`, nome: 'Ricardo Ferreira', cargo: 'Admin', salario: '3,500.00', bonus: '500.00', total: '4,000.00', status: 'Processado' },
    { id: `REC-${MES_RECIBO}-002`, nome: 'Ana Sousa', cargo: 'Rececionista (SPA)', salario: '1,200.00', bonus: '150.00', total: '1,350.00', status: 'Pendente' },
    { id: `REC-${MES_RECIBO}-003`, nome: 'João Silva', cargo: 'Técnico', salario: '1,100.00', bonus: '0.00', total: '1,100.00', status: 'Processado' },
    { id: `REC-${MES_RECIBO}-004`, nome: 'Maria Conceição', cargo: 'Supervisora', salario: '1,400.00', bonus: '200.00', total: '1,600.00', status: 'Pendente' },
    { id: `REC-${MES_RECIBO}-005`, nome: 'Carlos Pereira', cargo: 'Chefe de Sala', salario: '1,800.00', bonus: '450.00', total: '2,250.00', status: 'Pendente' },
];

// '3,500.00' → '3500,00' (formato decimal pt-PT dentro do CSV com separador ';')
const paraCSV = (v: string) => v.replace(/,/g, '').replace('.', ',');

const downloadCSV = (nomeFicheiro: string, linhas: string[][]) => {
    const csv = linhas.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeFicheiro;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export default function SalariosPage() {
    const [vencimentos, setVencimentos] = useState<Vencimento[]>(SEED_VENCIMENTOS);
    const [busca, setBusca] = useState('');
    const [feedback, setFeedback] = useState('');

    // KPIs reais + mês de referência dinâmico (sem valores fixos)
    const paraNum = (s: string) => parseFloat(s.replace(/,/g, '')) || 0;
    const agora = new Date();
    const mesRef = agora.toLocaleString('pt-PT', { month: 'long' });
    const mesRefLabel = `${mesRef.charAt(0).toUpperCase() + mesRef.slice(1)} ${agora.getFullYear()}`;
    const massaSalarial = vencimentos.reduce((acc, v) => acc + paraNum(v.total), 0);
    const comissoesPos = vencimentos.reduce((acc, v) => acc + paraNum(v.bonus), 0);
    const recibosPendentes = vencimentos.filter(v => v.status === 'Pendente').length;
    const fmtKz = (n: number) => `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} Kz`;

    // Hydratação a partir do localStorage (seed com o array atual se vazio)
    useEffect(() => {
        try {
            const raw = localStorage.getItem('rh_salarios');
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed) && parsed.length > 0) setVencimentos(parsed);
            else localStorage.setItem('rh_salarios', JSON.stringify(SEED_VENCIMENTOS));
        } catch { /* ignore */ }
    }, []);

    // O feedback de sucesso desaparece sozinho
    useEffect(() => {
        if (!feedback) return;
        const t = setTimeout(() => setFeedback(''), 4000);
        return () => clearTimeout(t);
    }, [feedback]);

    const guardarVencimentos = (lista: Vencimento[]) => {
        setVencimentos(lista);
        try { localStorage.setItem('rh_salarios', JSON.stringify(lista)); } catch { /* ignore */ }
    };

    // Export SEPA — CSV com separador ';' (pt-PT)
    const exportarSEPA = () => {
        const linhas = [
            ['ID Recibo', 'Colaborador', 'Cargo', 'Salario Base (Kz)', 'Bonus/Comissoes (Kz)', 'Total a Receber (Kz)', 'Status'],
            ...vencimentos.map(v => [v.id, v.nome, v.cargo, paraCSV(v.salario), paraCSV(v.bonus), paraCSV(v.total), v.status]),
        ];
        downloadCSV('ficheiro_sepa.csv', linhas);
        setFeedback(`Ficheiro SEPA exportado (${vencimentos.length} vencimentos).`);
    };

    // Processa todos os Pendentes do mês
    const processarMes = () => {
        const pendentes = vencimentos.filter(v => v.status === 'Pendente').length;
        guardarVencimentos(vencimentos.map(v => (v.status === 'Pendente' ? { ...v, status: 'Processado' } : v)));
        setFeedback(pendentes > 0
            ? `Mês processado — ${pendentes} recibo(s) passaram a Processado.`
            : 'Todos os recibos já estavam processados.');
    };

    // Recibo individual
    const downloadRecibo = (v: Vencimento) => {
        const linhas = [
            ['Recibo Salarial', v.id],
            ['Colaborador', v.nome],
            ['Cargo', v.cargo],
            ['Salario Base (Kz)', paraCSV(v.salario)],
            ['Bonus/Comissoes (Kz)', paraCSV(v.bonus)],
            ['Total a Receber (Kz)', paraCSV(v.total)],
            ['Status', v.status],
            ['Mes de Referencia', mesRefLabel],
        ];
        downloadCSV(`recibo_${v.id}.csv`, linhas);
        setFeedback(`Recibo ${v.id} transferido.`);
    };

    // Filtro por nome
    const q = busca.trim().toLowerCase();
    const visiveis = q ? vencimentos.filter(v => v.nome.toLowerCase().includes(q)) : vencimentos;

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

                    <div className="flex flex-col items-end gap-3">
                        <div className="flex gap-4">
                            <button
                                onClick={exportarSEPA}
                                className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Exportar SEPA
                            </button>
                            <button
                                onClick={processarMes}
                                className="flex items-center gap-2 bg-[#8B5CF6] text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                            >
                                <DollarSign className="w-4 h-4" /> Processar Mês Atual
                            </button>
                        </div>
                        {feedback && (
                            <motion.span
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="inline-flex items-center gap-2 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest"
                            >
                                <Check className="w-3.5 h-3.5" /> {feedback}
                            </motion.span>
                        )}
                    </div>
                </motion.div>

                {/* Status Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#111111] border border-[#8B5CF6]/20 p-8 rounded-3xl">
                        <DollarSign className="w-8 h-8 text-[#8B5CF6] mb-4" />
                        <p className="text-3xl font-black text-white">{fmtKz(massaSalarial)}</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Massa Salarial Estimada</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Percent className="w-8 h-8 text-[#00F2FF] mb-4" />
                        <p className="text-3xl font-black text-white">{fmtKz(comissoesPos)}</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Comissões a Pagar (POS)</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <TrendingUp className="w-8 h-8 text-[#F59E0B] mb-4" />
                        <p className="text-3xl font-black text-white">{recibosPendentes}</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Recibos Pendentes</p>
                    </div>
                    <div className="bg-[#111111] border border-white/5 p-8 rounded-3xl">
                        <Download className="w-8 h-8 text-[#10B981] mb-4" />
                        <p className="text-3xl font-black text-white">{mesRef.charAt(0).toUpperCase() + mesRef.slice(1)}</p>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-2">Mês de Referência</p>
                    </div>
                </div>

                {/* Tabela de Salários */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] overflow-hidden">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Pré-Visualização ({mesRefLabel})</h2>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <input
                                type="text"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
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
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Salário Base (Kz)</th>
                                    <th className="p-6 text-[10px] font-black text-[#00F2FF] uppercase tracking-widest whitespace-nowrap text-right">Bónus/Comissões (Kz)</th>
                                    <th className="p-6 text-[10px] font-black text-[#10B981] uppercase tracking-widest whitespace-nowrap text-right">Total a Receber (Kz)</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Status</th>
                                    <th className="p-6 text-[10px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiveis.map((venc, i) => (
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
                                            <button
                                                onClick={() => downloadRecibo(venc)}
                                                title={`Descarregar recibo de ${venc.nome}`}
                                                aria-label={`Descarregar recibo ${venc.id}`}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-[#8B5CF6]/20 text-white/50 hover:text-[#8B5CF6] transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                                {visiveis.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="p-10 text-center text-xs font-black uppercase tracking-widest text-white/30">
                                            Sem vencimentos que correspondam à pesquisa.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
