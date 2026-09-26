'use client';

import { motion } from 'framer-motion';
import {
    BadgeCheck, BedDouble, Check, Eye, FileText, IdCard, RefreshCw,
    TriangleAlert, UserX, X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import {
    decideKyc,
    listGuestProfiles,
    listOccupancy,
    signedDocumentUrl,
    type GuestProfile,
    type KycStatus,
    type OccupancyRow,
} from '@/lib/adminData';

const STATUS_STYLE: Record<KycStatus, string> = {
    PENDENTE: 'bg-white/5 border-white/15 text-white/50',
    EM_ANALISE: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
    APROVADO: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
    REJEITADO: 'bg-rose-500/10 border-rose-400/30 text-rose-300',
};

const DOCUMENT_LABEL: Record<GuestProfile['document_type'], string> = {
    BI: 'Bilhete de Identidade',
    PASSAPORTE: 'Passaporte',
};

export default function KycPage() {
    const { user } = useAuth();
    const [guests, setGuests] = useState<GuestProfile[]>([]);
    const [occupancy, setOccupancy] = useState<OccupancyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [filter, setFilter] = useState<KycStatus | 'TODOS'>('TODOS');
    const [notes, setNotes] = useState<Record<string, string>>({});

    const canDecide = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO' || user?.role === 'ACESSO';

    const refresh = useCallback(async () => {
        setLoading(true);
        const [guestResult, occupancyResult] = await Promise.all([
            listGuestProfiles(),
            listOccupancy(),
        ]);
        setLoading(false);
        if (guestResult.error) { setError(guestResult.error); setGuests([]); }
        else { setError(null); setGuests(guestResult.data ?? []); }
        if (occupancyResult.data) setOccupancy(occupancyResult.data);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const openDocument = async (storagePath: string) => {
        const result = await signedDocumentUrl(storagePath);
        if (result.error || !result.data) {
            setError(result.error ?? 'Não foi possível abrir o documento.');
            return;
        }
        window.open(result.data, '_blank', 'noopener,noreferrer');
    };

    const decide = async (guest: GuestProfile, status: Extract<KycStatus, 'APROVADO' | 'REJEITADO' | 'EM_ANALISE'>) => {
        setError(null);
        setNotice(null);
        const result = await decideKyc(guest.id, status, notes[guest.id] ?? '');
        if (result.error) { setError(result.error); return; }
        setNotice(`${guest.full_name}: KYC ${status.toLowerCase()}.`);
        await refresh();
    };

    const visible = filter === 'TODOS' ? guests : guests.filter(guest => guest.kyc_status === filter);
    const occupied = occupancy.filter(row => row.guest_name !== null).length;
    const occupancyRate = occupancy.length > 0 ? Math.round((occupied / occupancy.length) * 100) : 0;

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-b border-white/10 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <IdCard className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">KYC</h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                VALIDAÇÃO DE DOCUMENTOS E HÓSPEDES
                            </p>
                        </div>
                    </div>
                </motion.div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => void refresh()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                    <p className="text-xs text-white/35">
                        Sem KYC aprovado, a base de dados recusa o check-in. A validação exige a peça principal
                        e, para estrangeiros, a selfie.
                    </p>
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

                {/* Ocupação */}
                <div className="space-y-4">
                    <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <BedDouble className="w-5 h-5 text-[var(--brand-primary)]" /> Ocupação actual
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Taxa de ocupação</p>
                            <p className="text-4xl font-black text-[var(--brand-primary)] mt-2">{occupancyRate}%</p>
                            <p className="text-xs text-white/40 mt-1">{occupied} de {occupancy.length} quartos com hóspede</p>
                        </div>
                        <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Disponíveis</p>
                            <p className="text-4xl font-black text-emerald-400 mt-2">
                                {occupancy.filter(row => row.status === 'DISPONIVEL').length}
                            </p>
                            <p className="text-xs text-white/40 mt-1">prontos a vender</p>
                        </div>
                        <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Fora de serviço</p>
                            <p className="text-4xl font-black text-white/40 mt-2">
                                {occupancy.filter(row => row.status === 'LIMPEZA' || row.status === 'MANUTENCAO').length}
                            </p>
                            <p className="text-xs text-white/40 mt-1">limpeza ou manutenção</p>
                        </div>
                    </div>

                    <div className="glass-panel rounded-[28px] border border-white/5 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5 text-left">
                                    {['Quarto', 'Hóspede', 'Referência', 'Check-in', 'Check-out', 'Estado'].map(header => (
                                        <th key={header} className="px-5 py-3 text-[10px] font-black text-white/35 uppercase tracking-wider">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {occupancy.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-8 text-center text-white/40 text-sm">
                                            Sem quartos registados.
                                        </td>
                                    </tr>
                                ) : (
                                    occupancy.map(row => (
                                        <tr key={row.room_id} className="border-b border-white/5 last:border-0">
                                            <td className="px-5 py-3">
                                                <span className="font-black text-white">{row.room_number}</span>
                                                <span className="text-white/35 text-xs ml-2">{row.room_type}</span>
                                            </td>
                                            <td className="px-5 py-3 text-white/60">{row.guest_name ?? '—'}</td>
                                            <td className="px-5 py-3 font-mono text-xs text-white/40">{row.reference ?? '—'}</td>
                                            <td className="px-5 py-3 text-white/50">{row.check_in_date ?? '—'}</td>
                                            <td className="px-5 py-3 text-white/50">{row.check_out_date ?? '—'}</td>
                                            <td className="px-5 py-3">
                                                <span className="px-2.5 py-1 rounded-full border text-[10px] font-black uppercase" style={{
                                                    background: 'transparent',
                                                    borderColor: row.status === 'DISPONIVEL' ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.12)',
                                                    color: row.status === 'DISPONIVEL' ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
                                                }}>
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* KYC */}
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[var(--brand-primary)]" /> Hóspedes registados
                        </h2>
                        <div className="flex gap-2">
                            {(['TODOS', 'PENDENTE', 'EM_ANALISE', 'APROVADO', 'REJEITADO'] as const).map(option => (
                                <button
                                    key={option}
                                    onClick={() => setFilter(option)}
                                    className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                        filter === option
                                            ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                            : 'bg-white/5 border-white/10 text-white/45 hover:text-white'
                                    }`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/50">
                                Nenhum hóspede com este estado. Os registos chegam pela app do cliente
                                ou pela recepção.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                            {visible.map(guest => (
                                <motion.div
                                    key={guest.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-base font-black text-white">{guest.full_name}</p>
                                            <p className="text-xs text-white/45 mt-1">
                                                {DOCUMENT_LABEL[guest.document_type]} ·{' '}
                                                <span className="font-mono">{guest.document_number}</span>
                                            </p>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${STATUS_STYLE[guest.kyc_status]}`}>
                                            {guest.kyc_status}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        {guest.phone ? <p className="text-white/50">Tel: <span className="text-white/70">{guest.phone}</span></p> : null}
                                        {guest.email ? <p className="text-white/50 truncate">Email: <span className="text-white/70">{guest.email}</span></p> : null}
                                        {guest.nationality ? <p className="text-white/50">Nacionalidade: <span className="text-white/70">{guest.nationality}</span></p> : null}
                                        {guest.birth_date ? <p className="text-white/50">Nasc.: <span className="text-white/70">{guest.birth_date}</span></p> : null}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {(guest.documents ?? []).map(doc => (
                                            <button
                                                key={doc.id}
                                                onClick={() => void openDocument(doc.storage_path)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/55 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                            >
                                                <Eye className="w-3 h-3" /> {doc.kind}
                                            </button>
                                        ))}
                                        {(guest.documents ?? []).length === 0 ? (
                                            <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase">
                                                Sem documentos
                                            </span>
                                        ) : null}
                                    </div>

                                    {canDecide ? (
                                        <>
                                            <input
                                                value={notes[guest.id] ?? ''}
                                                onChange={e => setNotes(n => ({ ...n, [guest.id]: e.target.value }))}
                                                placeholder="Observações da validação"
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                            <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                                                <button
                                                    onClick={() => void decide(guest, 'EM_ANALISE')}
                                                    className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                >
                                                    Em análise
                                                </button>
                                                <button
                                                    onClick={() => void decide(guest, 'REJEITADO')}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider"
                                                >
                                                    <UserX className="w-3 h-3" /> Rejeitar
                                                </button>
                                                <button
                                                    onClick={() => void decide(guest, 'APROVADO')}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider ml-auto"
                                                >
                                                    <BadgeCheck className="w-3 h-3" /> Aprovar
                                                </button>
                                            </div>
                                        </>
                                    ) : null}
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
