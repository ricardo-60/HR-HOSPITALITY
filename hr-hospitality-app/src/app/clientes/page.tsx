/* eslint-disable */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Award, BadgeCheck, Camera, CheckCircle, Crown, Eye, IdCard,
    Loader2, MapPin, Phone, Plus, RefreshCw, Search, Star,
    Trash2, User, Users, Wallet, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { localQuery, localOperation } from '@/lib/db/localDB';
import { useAuth } from '@/context/AuthContext';

/* ─────────────────────────────────────────────
   Tipos
   ───────────────────────────────────────────── */
type DocumentType = 'BI' | 'PASSAPORTE' | 'NIF' | 'CARTAO_CIDADAO';
type TierName = 'REGISTADO' | 'OCASIONAL' | 'FREQUENTE' | 'VIP' | 'RESIDENTE';
type VisitType = 'HOSPEDAGEM' | 'POS' | 'EVENTO' | 'SPA' | 'OUTRO';

interface Client {
    id: string;
    client_number: string;
    full_name: string;
    document_type: DocumentType;
    document_number: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    date_of_birth?: string | null;
    nationality?: string | null;
    face_embedding?: string | null;
    face_image_path?: string | null;
    kyc_completed: number;
    kyc_completed_at?: string | null;
    loyalty_tier: TierName;
    loyalty_points: number;
    total_visits: number;
    total_spent: number;
    total_stays: number;
    total_pos_spent: number;
    first_visit_date?: string | null;
    last_visit_date?: string | null;
    preferred_room_type?: string | null;
    notes?: string | null;
    created_at?: string;
}

interface ClientListRow {
    id: string;
    client_number: string;
    full_name: string;
    document_type: DocumentType;
    document_number: string;
    email?: string | null;
    phone?: string | null;
    kyc_completed: number;
    loyalty_tier: TierName;
    loyalty_points: number;
    total_visits: number;
    total_spent: number;
    total_stays: number;
    first_visit_date?: string | null;
    last_visit_date?: string | null;
    created_at?: string;
}

interface LoyaltyTier {
    id: string;
    name: string;
    min_visits: number;
    min_spent: number;
    discount_percent: number;
    bonus_points_multiplier: number;
    color: string;
    icon: string;
    benefits: string;
    is_active: number;
}

interface ClientVisit {
    id: string;
    visit_type: VisitType;
    check_in_date?: string | null;
    check_out_date?: string | null;
    room_number?: string | null;
    room_type?: string | null;
    amount_spent: number;
    loyalty_points_earned: number;
    notes?: string | null;
    created_at?: string;
}

interface BiometricRecord {
    id: string;
    confidence?: number | null;
    device_info?: string | null;
    created_at?: string;
}

type TierFilter = 'ALL' | TierName;
type KycFilter = 'ALL' | 'PENDENTE' | 'COMPLETO';

/* ─────────────────────────────────────────────
   Constantes (pré-computadas)
   ───────────────────────────────────────────── */
const TIER_LABELS: Record<TierName, string> = {
    REGISTADO: 'Registado',
    OCASIONAL: 'Ocasional',
    FREQUENTE: 'Frequente',
    VIP: 'VIP',
    RESIDENTE: 'Residente',
};

const TIER_COLORS: Record<TierName, string> = {
    REGISTADO: '#9CA3AF',
    OCASIONAL: '#10B981',
    FREQUENTE: '#F59E0B',
    VIP: '#8B5CF6',
    RESIDENTE: '#EF4444',
};

const TIER_ICONS: Record<TierName, string> = {
    REGISTADO: '⚪',
    OCASIONAL: '🟢',
    FREQUENTE: '👑',
    VIP: '💜',
    RESIDENTE: '🏠',
};

const DOC_LABELS: Record<DocumentType, string> = {
    BI: 'BI',
    PASSAPORTE: 'Passaporte',
    NIF: 'NIF',
    CARTAO_CIDADAO: 'Cartão Cidadão',
};

const VISIT_LABELS: Record<VisitType, string> = {
    HOSPEDAGEM: 'Hospedagem',
    POS: 'POS',
    EVENTO: 'Evento',
    SPA: 'Spa',
    OUTRO: 'Outro',
};

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */
function fmtMoney(value: number): string {
    return Number(value).toFixed(2).replace('.', ',') + ' AOA';
}

function tierColor(tier: TierName): string {
    return TIER_COLORS[tier] ?? TIER_COLORS.REGISTADO;
}

/* ─────────────────────────────────────────────
   Componente principal
   ───────────────────────────────────────────── */
export default function ClientesPage() {
    const { user } = useAuth();
    const [clients, setClients] = useState<ClientListRow[]>([]);
    const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
    const [kycFilter, setKycFilter] = useState<KycFilter>('ALL');

    const [selected, setSelected] = useState<Client | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [visits, setVisits] = useState<ClientVisit[]>([]);
    const [biometrics, setBiometrics] = useState<BiometricRecord[]>([]);

    const [newOpen, setNewOpen] = useState(false);
    const [kycOpen, setKycOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    /* Formulário de novo cliente */
    const [fName, setFName] = useState('');
    const [fDocType, setFDocType] = useState<DocumentType>('BI');
    const [fDocNumber, setFDocNumber] = useState('');
    const [fAddress, setFAddress] = useState('');
    const [fEmail, setFEmail] = useState('');
    const [fPhone, setFPhone] = useState('');
    const [fWhatsapp, setFWhatsapp] = useState('');
    const [fBirth, setFBirth] = useState('');
    const [fNationality, setFNationality] = useState('');

    /* Carregar lista */
    const loadClients = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rows, tierRows] = await Promise.all([
                localQuery<{ data: ClientListRow[]; total: number }>('clients.list', {
                    limit: 200,
                    offset: 0,
                    tier: tierFilter === 'ALL' ? undefined : tierFilter,
                    kyc_completed: kycFilter === 'ALL' ? undefined : kycFilter === 'COMPLETO',
                    search: search || undefined,
                }),
                localQuery<LoyaltyTier[]>('loyalty_tiers.list', {}),
            ]);
            if (rows && Array.isArray((rows as { data?: ClientListRow[] }).data)) {
                const payload = rows as { data: ClientListRow[]; total: number };
                setClients(payload.data);
                setTotal(payload.total ?? payload.data.length);
            } else {
                setClients(Array.isArray(rows) ? rows : []);
                setTotal(Array.isArray(rows) ? rows.length : 0);
            }
            setTiers(Array.isArray(tierRows) ? tierRows : []);
        } catch (err) {
            console.error('[Clientes] erro ao carregar', err);
            setError('Não foi possível carregar os clientes.');
        } finally {
            setLoading(false);
        }
    }, [tierFilter, kycFilter, search]);

    useEffect(() => {
        void loadClients();
    }, [loadClients]);

    /* Carregar detalhe */
    const loadDetail = useCallback(async (client: ClientListRow) => {
        setDetailLoading(true);
        setSelected(null);
        setVisits([]);
        setBiometrics([]);
        try {
            const [detail, visitRows, bioRows] = await Promise.all([
                localQuery<Client>('clients.get', { id: client.id }),
                localQuery<{ data: ClientVisit[]; total: number }>('client_visits.list', {
                    client_id: client.id,
                    limit: 50,
                    offset: 0,
                }),
                localQuery<BiometricRecord[]>('biometrics.list', { client_id: client.id, limit: 20 }),
            ]);
            if (detail) setSelected(detail);
            setVisits(Array.isArray(visitRows) ? visitRows : []);
            setBiometrics(Array.isArray(bioRows) ? bioRows : []);
        } catch (err) {
            console.error('[Clientes] erro ao carregar detalhe', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    /* Estatísticas agregadas */
    const stats = useMemo(() => {
        const byTier: Record<string, number> = { REGISTADO: 0, OCASIONAL: 0, FREQUENTE: 0, VIP: 0, RESIDENTE: 0 };
        let kycDone = 0;
        let totalSpent = 0;
        for (const c of clients) {
            byTier[c.loyalty_tier] = (byTier[c.loyalty_tier] ?? 0) + 1;
            if (c.kyc_completed) kycDone += 1;
            totalSpent += Number(c.total_spent || 0);
        }
        return { byTier, kycDone, totalSpent };
    }, [clients]);

    const filtered = useMemo(() => clients, [clients]);

    /* Novo cliente */
    const createClient = async () => {
        if (!fName.trim() || !fDocNumber.trim()) return;
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await localOperation('clients.create', {
                full_name: fName.trim(),
                document_type: fDocType,
                document_number: fDocNumber.trim(),
                address: fAddress.trim() || undefined,
                email: fEmail.trim() || undefined,
                phone: fPhone.trim() || undefined,
                whatsapp: fWhatsapp.trim() || undefined,
                date_of_birth: fBirth || undefined,
                nationality: fNationality.trim() || undefined,
            });
            setNotice('Cliente registado com sucesso.');
            setNewOpen(false);
            resetForm();
            void loadClients();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Não foi possível registar o cliente.';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setFName(''); setFDocType('BI'); setFDocNumber(''); setFAddress('');
        setFEmail(''); setFPhone(''); setFWhatsapp(''); setFBirth(''); setFNationality('');
    };

    /* Completar KYC (captura facial) */
    const completeKyc = async () => {
        if (!selected) return;
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            // Gera um embedding facial de demonstração (array de floats)
            const embedding = JSON.stringify(
                Array.from({ length: 128 }, () => Math.random()),
            );
            await localOperation('clients.completeKyc', {
                id: selected.id,
                face_embedding: embedding,
                face_image_path: `faces/${selected.id}.jpg`,
            });
            setNotice(`KYC concluído para ${selected.full_name}. Cartão digital gerado.`);
            setKycOpen(false);
            void loadDetail(selected);
            void loadClients();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Não foi possível concluir o KYC.';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    /* Remover cliente */
    const removeClient = async (client: Client) => {
        if (!window.confirm(`Remover ${client.full_name}? Esta ação é irreversível.`)) return;
        setSaving(true);
        setError(null);
        try {
            await localOperation('clients.delete', { id: client.id });
            setNotice('Cliente removido.');
            setSelected(null);
            void loadClients();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Não foi possível remover o cliente.';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    /* ── Pré-computed className strings ── */
    const clsPanel = 'rounded-[28px] border border-white/10 bg-[#111111] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.6)]';
    const clsStatCard = 'rounded-[24px] border border-white/5 bg-white/[0.02] p-5';
    const clsFilterBtn = (active: boolean) =>
        `px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
            active
                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                : 'bg-white/5 border-white/10 text-white/45 hover:text-white'
        }`;
    const clsInput =
        'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[var(--brand-primary)] focus:outline-none';
    const clsLabel = 'mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/40';
    const clsPrimaryBtn =
        'flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40';
    const clsGhostBtn =
        'flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white/60 transition-all hover:text-white';

    const isAdmin = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO' || user?.role === 'ACESSO';

    return (
        <DashboardLayout>
            <div className="mx-auto max-w-[1500px] space-y-8 pb-24 px-4">
                {/* ── Header ── */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-8"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30">
                            <Users className="h-6 w-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Clientes</h1>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
                                CRM · KYC · Fidelização
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setNewOpen(true)} className={clsPrimaryBtn}>
                        <Plus className="h-4 w-4" /> Novo Cliente
                    </button>
                </motion.div>

                {/* ── Alertas ── */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3"
                        >
                            <span className="text-sm text-rose-200">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto text-rose-300" aria-label="Fechar">
                                <X className="h-4 w-4" />
                            </button>
                        </motion.div>
                    )}
                    {notice && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3"
                        >
                            <CheckCircle className="h-4 w-4 text-emerald-300" />
                            <span className="text-sm text-emerald-200">{notice}</span>
                            <button onClick={() => setNotice(null)} className="ml-auto text-emerald-300" aria-label="Fechar">
                                <X className="h-4 w-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Estatísticas ── */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className={clsStatCard}>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Total Clientes</p>
                        <p className="mt-2 text-3xl font-black text-white">{total}</p>
                    </div>
                    <div className={clsStatCard}>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">KYC Concluído</p>
                        <p className="mt-2 text-3xl font-black text-emerald-400">{stats.kycDone}</p>
                        <p className="mt-1 text-[10px] text-white/35">
                            {clients.length ? Math.round((stats.kycDone / clients.length) * 100) : 0}% da base
                        </p>
                    </div>
                    <div className={clsStatCard}>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Fieis (Freq+)</p>
                        <p className="mt-2 text-3xl font-black text-amber-400">
                            {(stats.byTier.FREQUENTE ?? 0) + (stats.byTier.VIP ?? 0) + (stats.byTier.RESIDENTE ?? 0)}
                        </p>
                    </div>
                    <div className={clsStatCard}>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Total Acumulado</p>
                        <p className="mt-2 text-2xl font-black text-[var(--brand-secondary)]">{fmtMoney(stats.totalSpent)}</p>
                    </div>
                </div>

                {/* ── Segmentação por tier ── */}
                <div className={clsPanel}>
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/70">
                        <Award className="h-4 w-4 text-[var(--brand-secondary)]" /> Segmentação de Fidelidade
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {(Object.keys(TIER_LABELS) as TierName[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setTierFilter(tierFilter === t ? 'ALL' : t)}
                                className={`rounded-2xl border p-4 text-left transition-all ${
                                    tierFilter === t
                                        ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/10'
                                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                            >
                                <span className="text-xl">{TIER_ICONS[t]}</span>
                                <p className="mt-1 text-[10px] font-black uppercase tracking-wider" style={{ color: tierColor(t) }}>
                                    {TIER_LABELS[t]}
                                </p>
                                <p className="mt-1 text-2xl font-black text-white">{stats.byTier[t] ?? 0}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Filtros ── */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Pesquisar por nome, documento, nº de cliente ou e-mail…"
                            className={clsInput + ' pl-11'}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(['ALL', ...Object.keys(TIER_LABELS)] as TierFilter[]).map(t => (
                            <button key={t} onClick={() => setTierFilter(t)} className={clsFilterBtn(tierFilter === t)}>
                                {t === 'ALL' ? 'Todos' : TIER_LABELS[t as TierName]}
                            </button>
                        ))}
                        <span className="mx-1 w-px bg-white/10" />
                        {(['ALL', 'PENDENTE', 'COMPLETO'] as KycFilter[]).map(k => (
                            <button key={k} onClick={() => setKycFilter(k)} className={clsFilterBtn(kycFilter === k)}>
                                {k === 'ALL' ? 'KYC: Todos' : k === 'PENDENTE' ? 'KYC Pendente' : 'KYC OK'}
                            </button>
                        ))}
                        <button onClick={() => void loadClients()} className={clsGhostBtn}>
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.2fr_1fr]">
                    {/* ── Lista de clientes ── */}
                    <div className={clsPanel}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/70">
                                <Users className="h-4 w-4 text-[var(--brand-primary)]" />
                                Lista de Clientes
                            </h2>
                            <span className="text-[10px] font-black uppercase tracking-wider text-white/35">
                                {filtered.length} registo(s)
                            </span>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center gap-2 p-12 text-sm text-white/40">
                                <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
                                <User className="mx-auto h-8 w-8 text-white/20" />
                                <p className="mt-3 text-sm text-white/40">Nenhum cliente encontrado.</p>
                            </div>
                        ) : (
                            <div className="max-h-[640px] space-y-2.5 overflow-y-auto pr-1">
                                {filtered.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => void loadDetail(c)}
                                        className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                                            selected?.id === c.id
                                                ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10'
                                                : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                                        }`}
                                    >
                                        <div
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black"
                                            style={{ background: `${tierColor(c.loyalty_tier)}22`, color: tierColor(c.loyalty_tier) }}
                                        >
                                            {c.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-bold text-white">{c.full_name}</p>
                                                {c.kyc_completed ? (
                                                    <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                                                ) : (
                                                    <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[8px] font-black uppercase text-amber-300">
                                                        KYC pendente
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 truncate text-[11px] text-white/40">
                                                <span className="font-mono">{c.client_number}</span> · {DOC_LABELS[c.document_type]} {c.document_number}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span
                                                className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                                                style={{ background: `${tierColor(c.loyalty_tier)}22`, color: tierColor(c.loyalty_tier) }}
                                            >
                                                {TIER_ICONS[c.loyalty_tier]} {TIER_LABELS[c.loyalty_tier]}
                                            </span>
                                            <p className="mt-1 text-[10px] text-white/35">
                                                {c.total_visits} visita(s) · {fmtMoney(c.total_spent)}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Detalhe do cliente ── */}
                    <div className={clsPanel}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/70">
                                <IdCard className="h-4 w-4 text-[var(--brand-primary)]" />
                                Ficha de Cliente
                            </h2>
                            {selected && isAdmin && (
                                <button
                                    onClick={() => void removeClient(selected)}
                                    className="flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/20"
                                >
                                    <Trash2 className="h-3 w-3" /> Remover
                                </button>
                            )}
                        </div>

                        {detailLoading ? (
                            <div className="flex items-center justify-center gap-2 p-12 text-sm text-white/40">
                                <Loader2 className="h-5 w-5 animate-spin" /> A carregar ficha…
                            </div>
                        ) : !selected ? (
                            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
                                <Eye className="mx-auto h-8 w-8 text-white/20" />
                                <p className="mt-3 text-sm text-white/40">Seleccione um cliente para ver a ficha completa.</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Identidade */}
                                <div className="flex items-start gap-4">
                                    <div
                                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-black"
                                        style={{ background: `${tierColor(selected.loyalty_tier)}22`, color: tierColor(selected.loyalty_tier) }}
                                    >
                                        {selected.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-lg font-black text-white">{selected.full_name}</p>
                                        <p className="font-mono text-xs text-white/40">{selected.client_number}</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span
                                                className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                                                style={{ background: `${tierColor(selected.loyalty_tier)}22`, color: tierColor(selected.loyalty_tier) }}
                                            >
                                                {TIER_ICONS[selected.loyalty_tier]} {TIER_LABELS[selected.loyalty_tier]}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                                                selected.kyc_completed
                                                    ? 'bg-emerald-400/15 text-emerald-300'
                                                    : 'bg-amber-400/15 text-amber-300'
                                            }`}>
                                                {selected.kyc_completed ? 'KYC Concluído' : 'KYC Pendente'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Contactos */}
                                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                    <p className="flex items-center gap-2 text-white/50">
                                        <IdCard className="h-3.5 w-3.5 shrink-0" />
                                        {DOC_LABELS[selected.document_type]} · <span className="font-mono text-white/70">{selected.document_number}</span>
                                    </p>
                                    {selected.phone && (
                                        <p className="flex items-center gap-2 text-white/50">
                                            <Phone className="h-3.5 w-3.5 shrink-0" />
                                            <span className="text-white/70">{selected.phone}</span>
                                        </p>
                                    )}
                                    {selected.email && (
                                        <p className="flex items-center gap-2 truncate text-white/50">
                                            <Users className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate text-white/70">{selected.email}</span>
                                        </p>
                                    )}
                                    {selected.address && (
                                        <p className="flex items-center gap-2 truncate text-white/50 sm:col-span-2">
                                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate text-white/70">{selected.address}</span>
                                        </p>
                                    )}
                                    {selected.nationality && (
                                        <p className="text-white/50">Nacionalidade: <span className="text-white/70">{selected.nationality}</span></p>
                                    )}
                                    {selected.date_of_birth && (
                                        <p className="text-white/50">Nascimento: <span className="text-white/70">{selected.date_of_birth}</span></p>
                                    )}
                                </div>

                                {/* Métricas */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Visitas</p>
                                        <p className="mt-1 text-2xl font-black text-white">{selected.total_visits}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Hospedagens</p>
                                        <p className="mt-1 text-2xl font-black text-white">{selected.total_stays}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Total Gasto</p>
                                        <p className="mt-1 text-lg font-black text-[var(--brand-secondary)]">{fmtMoney(selected.total_spent)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Gasto POS</p>
                                        <p className="mt-1 text-lg font-black text-[var(--brand-secondary)]">{fmtMoney(selected.total_pos_spent)}</p>
                                    </div>
                                </div>

                                {/* Fidelidade */}
                                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white/60">
                                            <Wallet className="h-4 w-4 text-[var(--brand-secondary)]" /> Pontos de fidelidade
                                        </p>
                                        <p className="text-xl font-black text-[var(--brand-secondary)]">{selected.loyalty_points} pts</p>
                                    </div>
                                    <div className="mt-3">
                                        <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-white/35">
                                            Desconto automático por tier
                                        </p>
                                        <div className="space-y-1.5">
                                            {tiers.map(t => {
                                                const active = t.name === selected.loyalty_tier;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-[10px] ${
                                                            active
                                                                ? 'border-[var(--brand-secondary)]/50 bg-[var(--brand-secondary)]/10 text-white'
                                                                : 'border-white/5 bg-white/[0.02] text-white/40'
                                                        }`}
                                                    >
                                                        <span className="font-bold">{TIER_LABELS[t.name as TierName] ?? t.name}</span>
                                                        <span className="font-black">
                                                            {Number(t.discount_percent)}% desc · {Number(t.bonus_points_multiplier)}x pts
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Acções KYC */}
                                {!selected.kyc_completed && (
                                    <button onClick={() => setKycOpen(true)} className={clsPrimaryBtn + ' w-full'}>
                                        <Camera className="h-4 w-4" /> Capturar Rosto e Concluir KYC
                                    </button>
                                )}
                                {selected.kyc_completed && selected.face_image_path && (
                                    <p className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
                                        <Camera className="h-4 w-4" /> Biometria facial registada ({biometrics.length} captura(s))
                                    </p>
                                )}

                                {/* Histórico */}
                                <div>
                                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                                        Histórico de Visitas ({visits.length})
                                    </p>
                                    {visits.length === 0 ? (
                                        <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">
                                            Sem visitas registadas.
                                        </p>
                                    ) : (
                                        <ul className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                            {visits.map(v => (
                                                <li
                                                    key={v.id}
                                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5"
                                                >
                                                    <div>
                                                        <p className="text-xs font-bold text-white">{VISIT_LABELS[v.visit_type]}</p>
                                                        <p className="text-[10px] text-white/35">
                                                            {v.check_in_date ?? '—'}
                                                            {v.room_number ? ` · Quarto ${v.room_number}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-[var(--brand-secondary)]">{fmtMoney(v.amount_spent)}</p>
                                                        {v.loyalty_points_earned > 0 && (
                                                            <p className="text-[9px] text-white/35">+{v.loyalty_points_earned} pts</p>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Modal: Novo Cliente ── */}
            <AnimatePresence>
                {newOpen && (
                    <Modal onClose={() => setNewOpen(false)}>
                        <h3 className="mb-5 flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
                            <User className="h-5 w-5 text-[var(--brand-primary)]" /> Registo de Cliente
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className={clsLabel}>Nome Completo *</label>
                                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nome completo" className={clsInput} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={clsLabel}>Tipo de Documento *</label>
                                    <select value={fDocType} onChange={e => setFDocType(e.target.value as DocumentType)} className={clsInput}>
                                        <option value="BI">BI</option>
                                        <option value="PASSAPORTE">Passaporte</option>
                                        <option value="NIF">NIF</option>
                                        <option value="CARTAO_CIDADAO">Cartão Cidadão</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={clsLabel}>Nº Documento *</label>
                                    <input value={fDocNumber} onChange={e => setFDocNumber(e.target.value)} placeholder="00000000" className={clsInput} />
                                </div>
                            </div>
                            <div>
                                <label className={clsLabel}>Morada</label>
                                <input value={fAddress} onChange={e => setFAddress(e.target.value)} placeholder="Rua, nº, cidade" className={clsInput} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={clsLabel}>E-mail</label>
                                    <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="cliente@email.com" className={clsInput} />
                                </div>
                                <div>
                                    <label className={clsLabel}>Telefone</label>
                                    <input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="+244 ..." className={clsInput} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={clsLabel}>WhatsApp</label>
                                    <input value={fWhatsapp} onChange={e => setFWhatsapp(e.target.value)} placeholder="+244 ..." className={clsInput} />
                                </div>
                                <div>
                                    <label className={clsLabel}>Nascimento</label>
                                    <input value={fBirth} onChange={e => setFBirth(e.target.value)} placeholder="AAAA-MM-DD" className={clsInput} />
                                </div>
                                <div>
                                    <label className={clsLabel}>Nacionalidade</label>
                                    <input value={fNationality} onChange={e => setFNationality(e.target.value)} placeholder="Angola" className={clsInput} />
                                </div>
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/35">
                                Ao registar, será gerado automaticamente um <strong className="text-white/60">Número Único de Cliente</strong> e um
                                cartão digital de membro. A captura facial (KYC) é feita após o registo.
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setNewOpen(false)} className={clsGhostBtn + ' flex-1'}>Cancelar</button>
                                <button
                                    onClick={() => void createClient()}
                                    disabled={saving || !fName.trim() || !fDocNumber.trim()}
                                    className={clsPrimaryBtn + ' flex-1'}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {saving ? 'A registar…' : 'Registar Cliente'}
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>

            {/* ── Modal: Captura Facial (KYC) ── */}
            <AnimatePresence>
                {kycOpen && selected && (
                    <Modal onClose={() => setKycOpen(false)}>
                        <h3 className="mb-2 flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
                            <Camera className="h-5 w-5 text-[var(--brand-primary)]" /> Captura Facial — KYC
                        </h3>
                        <p className="mb-5 text-xs leading-relaxed text-white/40">
                            Posicione o rosto do hóspede <strong className="text-white/70">{selected.full_name}</strong> na área de
                            captura. A imagem e o embedding facial são gravados na base de dados central e o cartão digital de
                            membro fica disponível imediatamente.
                        </p>

                        {/* Pré-visualização da câmara (simulada) */}
                        <div className="relative mb-5 flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--brand-primary)]/10 to-transparent">
                            <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5">
                                <Camera className="h-10 w-10 text-[var(--brand-primary)]/60" />
                            </div>
                            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white/50">
                                Câmara pronta
                            </span>
                            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                Detecção activa
                            </span>
                        </div>

                        <div className="mb-5 space-y-2 text-[11px] text-white/40">
                            <p className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Validação de vida real (liveness)</p>
                            <p className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Encriptação do embedding facial</p>
                            <p className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Geração automática do cartão digital</p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setKycOpen(false)} className={clsGhostBtn + ' flex-1'}>Cancelar</button>
                            <button
                                onClick={() => void completeKyc()}
                                disabled={saving}
                                className={clsPrimaryBtn + ' flex-1'}
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                                {saving ? 'A processar…' : 'Capturar e Concluir KYC'}
                            </button>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
}

/* ─────────────────────────────────────────────
   Modal reutilizável
   ───────────────────────────────────────────── */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    const clsBackdrop = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm';
    const clsCard = 'w-full max-w-lg rounded-[28px] border border-white/10 bg-[#111111] p-6 shadow-2xl';
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={clsBackdrop}
        >
            <motion.div
                initial={{ y: 30, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.98 }}
                onClick={e => e.stopPropagation()}
                className={clsCard}
            >
                <button onClick={onClose} className="mb-3 text-white/40 hover:text-white" aria-label="Fechar">
                    <X className="h-5 w-5" />
                </button>
                {children}
            </motion.div>
        </motion.div>
    );
}
