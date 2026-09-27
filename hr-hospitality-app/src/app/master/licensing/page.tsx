'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CheckCircle2,
    Clock,
    Crown,
    KeyRound,
    Plus,
    RefreshCw,
    ShieldAlert,
    TriangleAlert,
    XCircle,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { supabaseClient } from '@/lib/supabaseClient';

/**
 * Painel Master Global — `/master/licensing`.
 *
 * Só o Utilizador Master Global (`is_master_global`) entra aqui: a rota está
 * em `MASTER_ONLY_PATHS` no AuthContext e a RLS de `system_licenses` só
 * permite escrita a este perfil. É aqui que se emite, suspende, reativa e
 * redefine o prazo das licenças de todas as instâncias instaladas.
 */

type PropertyType = 'HOTEL' | 'HOSPEDARIA' | 'RESORT' | 'COMPLEXO';

interface TenantRow {
    id: string;
    name: string;
    slug: string;
    company_name: string | null;
    property_type: PropertyType | null;
    is_active: boolean;
}

interface LicenseRow {
    id: string;
    tenant_id: string;
    license_key: string;
    license_type: string;
    status: string;
    starts_at: string;
    expires_at: string;
    grace_period_days: number;
    is_paid: boolean;
    notes: string | null;
    created_at: string;
}

const LICENSE_TYPES = [
    { value: 'TRAINING_GRACE', label: 'Formação / Carência Gratuita', days: 60, grace: 60, paid: false },
    { value: 'MONTHLY', label: 'Mensal', days: 30, grace: 0, paid: true },
    { value: 'QUARTERLY', label: 'Trimestral', days: 90, grace: 0, paid: true },
    { value: 'SEMI_ANNUAL', label: 'Semestral', days: 180, grace: 0, paid: true },
    { value: 'ANNUAL', label: 'Anual', days: 365, grace: 0, paid: true },
] as const;

const PROPERTY_LABELS: Record<PropertyType, string> = {
    HOTEL: 'Hotel',
    HOSPEDARIA: 'Hospedaria',
    RESORT: 'Resort',
    COMPLEXO: 'Complexo',
};

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
    LICENSE_TYPES.map(entry => [entry.value, entry.label])
);

const STATUS_STYLES: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    GRACE_PERIOD: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    EXPIRED: 'bg-red-500/15 text-red-400 border-red-500/30',
    SUSPENDED: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

function daysUntil(iso: string): number {
    return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** A licença "actual" é a que expira mais tarde — a mesma regra de `hr_license_state()`. */
function currentLicense(licenses: LicenseRow[]): LicenseRow | null {
    if (licenses.length === 0) return null;
    return [...licenses].sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-PT');
}

export default function MasterLicensingPage() {
    const { user, refreshLicense } = useAuth();

    const [tenants, setTenants] = useState<TenantRow[]>([]);
    const [licenses, setLicenses] = useState<LicenseRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Emissão de licença
    const [targetTenant, setTargetTenant] = useState('');
    const [licenseType, setLicenseType] = useState<string>('TRAINING_GRACE');
    const [graceDays, setGraceDays] = useState(60);
    const [notes, setNotes] = useState('');
    const [issuing, setIssuing] = useState(false);

    // Registo de nova instância
    const [showNewTenant, setShowNewTenant] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [newType, setNewType] = useState<PropertyType>('HOSPEDARIA');
    const [creating, setCreating] = useState(false);

    const refresh = useCallback(async () => {
        if (!supabaseClient) return;
        setLoading(true);
        const [{ data: tenantData, error: tenantError }, { data: licenseData, error: licenseError }] =
            await Promise.all([
                supabaseClient.from('tenants').select('*').order('name', { ascending: true }),
                supabaseClient.from('system_licenses').select('*').order('expires_at', { ascending: false }),
            ]);
        setLoading(false);
        if (tenantError) {
            setError(tenantError.message);
            return;
        }
        if (licenseError) {
            setError(licenseError.message);
            return;
        }
        setError(null);
        setTenants((tenantData ?? []) as TenantRow[]);
        setLicenses((licenseData ?? []) as LicenseRow[]);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const licensesByTenant = useMemo(() => {
        const map = new Map<string, LicenseRow[]>();
        for (const license of licenses) {
            const list = map.get(license.tenant_id) ?? [];
            list.push(license);
            map.set(license.tenant_id, list);
        }
        return map;
    }, [licenses]);

    const summary = useMemo(() => {
        const current = tenants.map(tenant => currentLicense(licensesByTenant.get(tenant.id) ?? []));
        return {
            instances: tenants.length,
            active: current.filter(item => item?.status === 'ACTIVE').length,
            grace: current.filter(item => item?.status === 'GRACE_PERIOD').length,
            blocked: current.filter(item => item?.status === 'EXPIRED' || item?.status === 'SUSPENDED').length,
        };
    }, [tenants, licensesByTenant]);

    const run = useCallback(async (action: () => Promise<void>, successMessage: string) => {
        setError(null);
        setNotice(null);
        try {
            await action();
            setNotice(successMessage);
            await refresh();
            await refreshLicense();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Operação falhada.');
        }
    }, [refresh, refreshLicense]);

    const issueLicense = async () => {
        if (!supabaseClient) return;
        if (!targetTenant) {
            setError('Selecione a instância.');
            return;
        }
        const spec = LICENSE_TYPES.find(entry => entry.value === licenseType);
        if (!spec) {
            setError('Tipo de licença inválido.');
            return;
        }
        setIssuing(true);
        try {
            const { data, error: rpcError } = await supabaseClient.rpc('hr_issue_license', {
                p_tenant_id: targetTenant,
                p_license_type: licenseType,
                p_days: licenseType === 'TRAINING_GRACE' ? graceDays : spec.days,
                p_grace_days: licenseType === 'TRAINING_GRACE' ? graceDays : spec.grace,
                p_is_paid: spec.paid,
                p_notes: notes.trim() || null,
            });
            if (rpcError) throw new Error(rpcError.message);
            const issued = data as { license_key?: string; license_type?: string; expires_at?: string } | null;
            await run(async () => undefined, `Licença ${issued?.license_key ?? ''} emitida.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível emitir a licença.');
        } finally {
            setIssuing(false);
        }
    };

    const setLicenseStatus = (license: LicenseRow, status: 'ACTIVE' | 'SUSPENDED') => {
        const client = supabaseClient;
        if (!client) return;
        void run(async () => {
            const { error: updateError } = await client
                .from('system_licenses')
                .update({ status })
                .eq('id', license.id);
            if (updateError) throw new Error(updateError.message);
        }, `Licença ${license.license_key} ${status === 'ACTIVE' ? 'activada' : 'suspensa'}.`);
    };

    const resetLicenseWindow = (license: LicenseRow, days: number) => {
        const client = supabaseClient;
        if (!client) return;
        void run(async () => {
            const { error: updateError } = await client
                .from('system_licenses')
                .update({
                    starts_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
                    status: 'ACTIVE',
                })
                .eq('id', license.id);
            if (updateError) throw new Error(updateError.message);
        }, `Prazo da licença ${license.license_key} redefinido para ${days} dias.`);
    };

    const createTenant = async () => {
        if (!supabaseClient) return;
        const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!newName.trim() || !slug) {
            setError('Indique a designação e a sigla da nova instância.');
            return;
        }
        setCreating(true);
        try {
            const { data, error: insertError } = await supabaseClient
                .from('tenants')
                .insert({ name: newName.trim(), slug, property_type: newType })
                .select('*')
                .single();
            if (insertError) throw new Error(insertError.message);
            const created = data as TenantRow;
            setTargetTenant(created.id);
            await run(async () => undefined, `Instância "${created.name}" registada.`);
            setShowNewTenant(false);
            setNewName('');
            setNewSlug('');
            setNewType('HOSPEDARIA');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível registar a instância.');
        } finally {
            setCreating(false);
        }
    };

    if (!user?.isMasterGlobal) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-6">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full">
                        <ShieldAlert className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h2>
                    <p className="text-white/40 max-w-md uppercase tracking-wider text-xs font-black">
                        Esta secção é exclusiva do Utilizador Master Global.
                    </p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-[1600px] mx-auto space-y-10 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                <Crown className="w-6 h-6 text-amber-400" />
                            </div>
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                    Master <span className="text-amber-400">Global</span>
                                </h1>
                                <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                    Licenciamento das Instâncias Instaladas
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => { setShowNewTenant(value => !value); setNewSlug(''); }}
                        className="px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/70 hover:text-white transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Registar Instância
                    </button>
                </motion.div>

                {/* Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Instâncias', value: summary.instances, icon: Building2, tone: 'text-[var(--brand-accent)]' },
                        { label: 'Licenças Activas', value: summary.active, icon: CheckCircle2, tone: 'text-emerald-400' },
                        { label: 'Em Carência', value: summary.grace, icon: Clock, tone: 'text-amber-400' },
                        { label: 'Expiradas / Suspensas', value: summary.blocked, icon: XCircle, tone: 'text-red-400' },
                    ].map(card => (
                        <div key={card.label} className="glass-panel rounded-2xl border border-white/5 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">{card.label}</span>
                                <card.icon className={`w-4 h-4 ${card.tone}`} />
                            </div>
                            <p className="text-4xl font-black text-white">{card.value}</p>
                        </div>
                    ))}
                </div>

                {/* New instance */}
                {showNewTenant && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel rounded-3xl border border-amber-500/20 p-6 space-y-5"
                    >
                        <h3 className="text-sm font-black uppercase tracking-widest text-amber-400">Nova Instância</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Designação</label>
                                <input
                                    value={newName}
                                    onChange={event => setNewName(event.target.value)}
                                    placeholder="Ex: Hospedaria Kilamba"
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-amber-500/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Sigla (slug)</label>
                                <input
                                    value={newSlug}
                                    onChange={event => setNewSlug(event.target.value)}
                                    placeholder="Ex: hospedaria-kilamba"
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-amber-500/50 font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Tipologia</label>
                                <select
                                    value={newType}
                                    onChange={event => setNewType(event.target.value as PropertyType)}
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-amber-500/50 text-white/80"
                                >
                                    {(Object.keys(PROPERTY_LABELS) as PropertyType[]).map(key => (
                                        <option key={key} value={key}>{PROPERTY_LABELS[key]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => void createTenant()}
                                disabled={creating}
                                className="px-6 py-3 bg-amber-500 text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {creating ? 'A registar…' : 'Registar'}
                            </button>
                            <button
                                onClick={() => setShowNewTenant(false)}
                                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/60"
                            >
                                Cancelar
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Issue licence */}
                <div className="glass-panel rounded-3xl border border-white/5 p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <KeyRound className="w-5 h-5 text-[var(--brand-accent)]" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-white">Emitir Licença</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Instância</label>
                            <select
                                value={targetTenant}
                                onChange={event => setTargetTenant(event.target.value)}
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[var(--brand-accent)] text-white/80"
                            >
                                <option value="">Selecionar…</option>
                                {tenants.map(tenant => (
                                    <option key={tenant.id} value={tenant.id}>
                                        {tenant.company_name || tenant.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Tipo de Licença</label>
                            <select
                                value={licenseType}
                                onChange={event => {
                                    setLicenseType(event.target.value);
                                    const spec = LICENSE_TYPES.find(entry => entry.value === event.target.value);
                                    if (spec) setGraceDays(spec.grace);
                                }}
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[var(--brand-accent)] text-white/80"
                            >
                                {LICENSE_TYPES.map(entry => (
                                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                                ))}
                            </select>
                        </div>
                        {licenseType === 'TRAINING_GRACE' && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Dias de Carência</label>
                                <select
                                    value={graceDays}
                                    onChange={event => setGraceDays(Number(event.target.value))}
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[var(--brand-accent)] text-white/80"
                                >
                                    <option value={30}>30 dias</option>
                                    <option value={60}>60 dias</option>
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Nota (opcional)</label>
                            <input
                                value={notes}
                                onChange={event => setNotes(event.target.value)}
                                placeholder="Ex: Renovação anual 2026"
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[var(--brand-accent)]"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={() => void issueLicense()}
                                disabled={issuing || !targetTenant}
                                className="w-full px-6 py-3 bg-[var(--brand-primary)] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {issuing ? 'A emitir…' : 'Emitir Licença'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Instances table */}
                <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-[var(--brand-accent)]" />
                            Instâncias e Licenças
                        </h3>
                        <button
                            onClick={() => { void refresh(); }}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>

                    {error && (
                        <div className="mx-6 mt-6 flex items-start gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {notice && (
                        <div className="mx-6 mt-6 flex items-start gap-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{notice}</span>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5 text-left text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                                    <th className="p-5">Instância</th>
                                    <th className="p-5">Tipologia</th>
                                    <th className="p-5">Licença Actual</th>
                                    <th className="p-5">Estado</th>
                                    <th className="p-5">Expira</th>
                                    <th className="p-5 text-right">Acções</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-10 text-center text-white/30 text-xs font-black uppercase tracking-widest">
                                            A carregar instâncias…
                                        </td>
                                    </tr>
                                ) : tenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-10 text-center text-white/30 text-xs font-black uppercase tracking-widest">
                                            Sem instâncias registadas.
                                        </td>
                                    </tr>
                                ) : (
                                    tenants.map(tenant => {
                                        const tenantLicenses = licensesByTenant.get(tenant.id) ?? [];
                                        const current = currentLicense(tenantLicenses);
                                        const remaining = current ? daysUntil(current.expires_at) : null;
                                        return (
                                            <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors align-top">
                                                <td className="p-5">
                                                    <p className="font-bold text-white">{tenant.company_name || tenant.name}</p>
                                                    <p className="text-[10px] font-mono text-white/30 mt-1">{tenant.slug}</p>
                                                </td>
                                                <td className="p-5 text-xs text-white/60">
                                                    {tenant.property_type ? PROPERTY_LABELS[tenant.property_type] : '—'}
                                                </td>
                                                <td className="p-5">
                                                    {current ? (
                                                        <>
                                                            <p className="text-xs font-bold text-white">
                                                                {TYPE_LABELS[current.license_type] ?? current.license_type}
                                                            </p>
                                                            <p className="text-[10px] font-mono text-white/30 mt-1">{current.license_key}</p>
                                                            <p className="text-[10px] text-white/30 mt-1">
                                                                {tenantLicenses.length} registo(s)
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-white/30">Sem licença</span>
                                                    )}
                                                </td>
                                                <td className="p-5">
                                                    {current ? (
                                                        <span className={`inline-block px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${STATUS_STYLES[current.status] ?? 'bg-white/10 text-white/60 border-white/10'}`}>
                                                            {current.status}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-white/30">—</span>
                                                    )}
                                                </td>
                                                <td className="p-5 text-xs text-white/60">
                                                    {current ? (
                                                        <>
                                                            <p>{formatDate(current.expires_at)}</p>
                                                            <p className={`text-[10px] font-black mt-1 ${remaining !== null && remaining < 0 ? 'text-red-400' : 'text-white/30'}`}>
                                                                {remaining === null ? '—' : remaining < 0 ? `há ${Math.abs(remaining)} dias` : `${remaining} dias`}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="p-5">
                                                    {current && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {current.status !== 'ACTIVE' && (
                                                                <button
                                                                    onClick={() => setLicenseStatus(current, 'ACTIVE')}
                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500/20"
                                                                >
                                                                    Activar
                                                                </button>
                                                            )}
                                                            {current.status !== 'SUSPENDED' && (
                                                                <button
                                                                    onClick={() => setLicenseStatus(current, 'SUSPENDED')}
                                                                    className="px-3 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 text-[9px] font-black uppercase tracking-widest hover:bg-fuchsia-500/20"
                                                                >
                                                                    Suspender
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => resetLicenseWindow(current, 30)}
                                                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-white/10"
                                                                title="Redefinir starts_at/expires_at para 30 dias a partir de agora"
                                                            >
                                                                +30 dias
                                                            </button>
                                                            <button
                                                                onClick={() => resetLicenseWindow(current, 365)}
                                                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-white/10"
                                                                title="Redefinir starts_at/expires_at para 365 dias a partir de agora"
                                                            >
                                                                +365 dias
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25 text-center">
                    O Master Global nunca é afectado pela expiração de licença, bloqueio de empresa ou restrição de módulo.
                </p>
            </div>
        </DashboardLayout>
    );
}
