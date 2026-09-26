'use client';

import { motion } from 'framer-motion';
import {
    BadgeCheck, Check, Eye, FileCheck2, Receipt, RefreshCw,
    TriangleAlert, X, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import {
    decidePaymentProof,
    listPaymentProofs,
    signedProofUrl,
    type PaymentProof,
    type ProofStatus,
} from '@/lib/adminData';

const STATUS_STYLE: Record<ProofStatus, string> = {
    EM_ANALISE: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
    APROVADO: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
    REJEITADO: 'bg-rose-500/10 border-rose-400/30 text-rose-300',
};

const METHOD_LABEL: Record<PaymentProof['method'], string> = {
    MULTICAIXA_EXPRESS: 'Multicaixa Express',
    TRANSFERENCIA: 'Transferência bancária',
    TPA: 'TPA',
    DINHEIRO: 'Dinheiro',
    CONTA_DO_QUARTO: 'Conta do quarto',
};

function formatKz(value: number): string {
    const [intPart, decPart] = value.toFixed(2).split('.');
    return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart} Kz`;
}

function formatWhen(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ComprovativosPage() {
    const { user } = useAuth();
    const [proofs, setProofs] = useState<PaymentProof[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [filter, setFilter] = useState<ProofStatus | 'TODOS'>('EM_ANALISE');
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const canDecide = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO' || user?.role === 'ACESSO';

    const refresh = useCallback(async () => {
        setLoading(true);
        const result = await listPaymentProofs();
        setLoading(false);
        if (result.error) { setError(result.error); setProofs([]); return; }
        setError(null);
        setProofs(result.data ?? []);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const openProof = async (storagePath: string) => {
        const result = await signedProofUrl(storagePath);
        if (result.error || !result.data) {
            setError(result.error ?? 'Não foi possível abrir o comprovativo.');
            return;
        }
        window.open(result.data, '_blank', 'noopener,noreferrer');
    };

    const decide = async (
        proof: PaymentProof,
        status: Extract<ProofStatus, 'APROVADO' | 'REJEITADO'>,
        confirmReservation: boolean,
    ) => {
        setBusyId(proof.id);
        setError(null);
        setNotice(null);
        const result = await decidePaymentProof(proof.id, status, notes[proof.id] ?? '', confirmReservation);
        setBusyId(null);
        if (result.error) { setError(result.error); return; }
        setNotice(
            status === 'APROVADO'
                ? `Comprovativo aprovado.${confirmReservation ? ' Reserva confirmada.' : ''}`
                : 'Comprovativo rejeitado.',
        );
        await refresh();
    };

    const visible = filter === 'TODOS' ? proofs : proofs.filter(proof => proof.status === filter);
    const pending = proofs.filter(proof => proof.status === 'EM_ANALISE').length;
    const pendingTotal = proofs
        .filter(proof => proof.status === 'EM_ANALISE')
        .reduce((sum, proof) => sum + proof.amount, 0);

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-b border-white/10 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <Receipt className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                Comprovativos
                            </h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                VALIDAÇÃO DE PAGAMENTOS
                            </p>
                        </div>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Por validar</p>
                        <p className="text-4xl font-black text-amber-400 mt-2">{pending}</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Valor em análise</p>
                        <p className="text-3xl font-black text-white mt-2">{formatKz(pendingTotal)}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => void refresh()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                    {(['EM_ANALISE', 'APROVADO', 'REJEITADO', 'TODOS'] as const).map(option => (
                        <button
                            key={option}
                            onClick={() => setFilter(option)}
                            className={`px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                                filter === option
                                    ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                    : 'bg-white/5 border-white/10 text-white/45 hover:text-white'
                            }`}
                        >
                            {option}
                        </button>
                    ))}
                </div>

                {error ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                        <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                        <p className="text-sm text-rose-200">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto" aria-label="Fechar">
                            <X className="w-4 h-4 text-rose-300" />
                        </button>
                    </div>
                ) : null}

                {notice ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                        <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                        <p className="text-sm text-emerald-200">{notice}</p>
                    </div>
                ) : null}

                <div className="space-y-4">
                    {visible.length === 0 ? (
                        <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/50">
                                Nenhum comprovativo com este estado. Os comprovativos chegam quando o
                                cliente envia pela app.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {visible.map(proof => (
                                <motion.div
                                    key={proof.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-base font-black text-white">
                                                {proof.guest_name ?? 'Sem hóspede associado'}
                                            </p>
                                            <p className="text-xs text-white/45 mt-1">
                                                {proof.reservation_reference ? `Reserva ${proof.reservation_reference}` : 'Sem reserva'}
                                                {proof.payment_reference ? ` · Ref. ${proof.payment_reference}` : ''}
                                                {proof.transaction_code ? ` · Op. ${proof.transaction_code}` : ''}
                                            </p>
                                            <p className="text-[10px] text-white/30 mt-1">
                                                {METHOD_LABEL[proof.method]} · recebido {formatWhen(proof.created_at)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl font-black text-[var(--brand-primary)]">
                                                {formatKz(proof.amount)}
                                            </span>
                                            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${STATUS_STYLE[proof.status]}`}>
                                                {proof.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => void openProof(proof.storage_path)}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/55 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                        >
                                            <Eye className="w-3 h-3" /> Ver comprovativo
                                        </button>
                                    </div>

                                    {proof.review_notes ? (
                                        <p className="text-xs text-white/40 italic">Nota: {proof.review_notes}</p>
                                    ) : null}

                                    {canDecide && proof.status === 'EM_ANALISE' ? (
                                        <>
                                            <input
                                                value={notes[proof.id] ?? ''}
                                                onChange={e => setNotes(n => ({ ...n, [proof.id]: e.target.value }))}
                                                placeholder="Observações da validação"
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                                                <button
                                                    disabled={busyId === proof.id}
                                                    onClick={() => void decide(proof, 'APROVADO', true)}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                                                >
                                                    <BadgeCheck className="w-3.5 h-3.5" /> Aprovar e confirmar reserva
                                                </button>
                                                <button
                                                    disabled={busyId === proof.id}
                                                    onClick={() => void decide(proof, 'APROVADO', false)}
                                                    className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/55 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                                                >
                                                    Aprovar sem confirmar
                                                </button>
                                                <button
                                                    disabled={busyId === proof.id}
                                                    onClick={() => void decide(proof, 'REJEITADO', false)}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 ml-auto"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" /> Rejeitar
                                                </button>
                                            </div>
                                        </>
                                    ) : null}
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-2">
                    <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em] flex items-center gap-2">
                        <FileCheck2 className="w-3.5 h-3.5" /> Regra de confirmação
                    </p>
                    <p className="text-sm text-white/60 leading-relaxed">
                        Uma reserva com valor total maior que zero não passa a
                        <span className="text-white"> CONFIRMADA</span> sem um comprovativo aprovado.
                        A regra está num trigger da base de dados, por isso vale para todos os canais —
                        app, site ou consola SQL.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
