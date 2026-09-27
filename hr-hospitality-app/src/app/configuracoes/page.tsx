'use client';

import { motion } from 'framer-motion';
import {
    Building2,
    Check,
    KeyRound,
    Landmark,
    LayoutGrid,
    Save,
    Server,
    Settings,
    ShieldCheck,
    Star,
    Trash2,
    TriangleAlert,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PERMISSION_MODULES, useAuth } from '@/context/AuthContext';
import {
    createBankAccount,
    deleteBankAccount,
    listBankAccounts,
    updateBankAccount,
    type BankAccount,
    type BankAccountInput,
} from '@/lib/adminData';
import { supabaseClient } from '@/lib/supabaseClient';

/* ── Tipologia e catálogo de serviços (migração 010) ─────────────────── */

type PropertyType = 'HOTEL' | 'HOSPEDARIA' | 'RESORT' | 'COMPLEXO';

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
    { value: 'HOTEL', label: 'Hotel' },
    { value: 'HOSPEDARIA', label: 'Hospedaria' },
    { value: 'RESORT', label: 'Resort' },
    { value: 'COMPLEXO', label: 'Complexo' },
];

const SERVICE_CATALOGUE: { value: string; label: string }[] = [
    { value: 'ROOMS', label: 'Quartos' },
    { value: 'BAR', label: 'Bar' },
    { value: 'RESTAURANT', label: 'Restaurante' },
    { value: 'POOL', label: 'Piscina' },
    { value: 'GYM', label: 'Ginásio' },
    { value: 'LAUNDRY', label: 'Lavandaria' },
    { value: 'EVENTS', label: 'Eventos' },
];

/** Linha da tabela `tenants` (migrações 001 + 010). */
interface TenantRow {
    id: string;
    name: string;
    slug: string;
    currency: string;
    company_name: string | null;
    tax_id: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    property_type: string | null;
    active_services: unknown;
    is_active: boolean | null;
    created_at: string | null;
}

interface CompanyForm {
    company_name: string;
    tax_id: string;
    address: string;
    phone: string;
    email: string;
    logo_url: string;
    property_type: string;
    active_services: string[];
}

const EMPTY_COMPANY_FORM: CompanyForm = {
    company_name: '',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    logo_url: '',
    property_type: '',
    active_services: [],
};

/** JSONB → string[] tolerante (mesma semântica do AuthContext). */
function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

/* ── IBAN: validação ISO 13616 (espelhada de /financeiro) ─────────────── */

const EMPTY_IBAN_FORM: BankAccountInput = {
    bank_name: '',
    iban: '',
    account_holder: '',
    account_type: 'CORRENTE',
    supports_multicaixa_express: true,
    is_primary: false,
    is_active: true,
    instructions: '',
};

/** Remove espaços e valida comprimento. O IBAN angolano tem 25 caracteres. */
function normaliseIban(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isPlausibleIban(iban: string): boolean {
    if (iban.length < 20 || iban.length > 34) return false;
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;
    // Verificação de dígito de controlo ISO 13616 (módulo 97), que apanha
    // transpositiones antes de a conta ser gravada.
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
}

function prettyIban(iban: string): string {
    const clean = normaliseIban(iban);
    return clean.replace(/(.{4})/g, '$1 ').trim();
}

function formatPtDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-PT');
}

function licenseStatusClass(status: string | null): string {
    switch (status) {
        case 'ACTIVE': return 'text-emerald-400';
        case 'GRACE_PERIOD': return 'text-amber-400';
        case 'SEM_LICENCA': return 'text-white/50';
        default: return 'text-rose-400';
    }
}

export default function ConfiguracoesPage() {
    const { user, license } = useAuth();
    const tenantId = user?.tenantId ?? null;
    const [activeTab, setActiveTab] = useState<'empresa' | 'ibans' | 'sistema' | 'modulos'>('empresa');

    const tabs = [
        { id: 'empresa' as const, label: 'Empresa', icon: Building2 },
        { id: 'ibans' as const, label: 'IBANs', icon: Landmark },
        { id: 'sistema' as const, label: 'Sistema', icon: Server },
        { id: 'modulos' as const, label: 'Módulos', icon: LayoutGrid },
    ];

    /* ── EMPRESA ─────────────────────────────────────────────────────── */

    const [tenant, setTenant] = useState<TenantRow | null>(null);
    const [tenantLoading, setTenantLoading] = useState(true);
    const [tenantError, setTenantError] = useState<string | null>(null);
    const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM);
    const [savingCompany, setSavingCompany] = useState(false);
    const [companyNotice, setCompanyNotice] = useState<string | null>(null);

    const refreshTenant = useCallback(async () => {
        setTenantLoading(true);
        if (!supabaseClient || !tenantId) {
            setTenantError('Supabase não configurado neste ambiente.');
            setTenant(null);
            setTenantLoading(false);
            return;
        }
        const { data, error: fetchError } = await supabaseClient
            .from('tenants')
            .select('*')
            .eq('id', tenantId)
            .maybeSingle();
        setTenantLoading(false);
        if (fetchError) {
            setTenantError(fetchError.message);
            setTenant(null);
            return;
        }
        setTenantError(null);
        const row = (data ?? null) as TenantRow | null;
        setTenant(row);
        if (row) {
            setCompanyForm({
                company_name: row.company_name ?? '',
                tax_id: row.tax_id ?? '',
                address: row.address ?? '',
                phone: row.phone ?? '',
                email: row.email ?? '',
                logo_url: row.logo_url ?? '',
                property_type: row.property_type ?? '',
                active_services: stringArray(row.active_services),
            });
        }
    }, [tenantId]);

    // Carregamento diferido: o estado inicial é sempre a linha vazia, o que
    // mantém a marcação do servidor e do cliente idêntica (output: 'export').
    useEffect(() => {
        const timer = window.setTimeout(() => { void refreshTenant(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshTenant]);

    const toggleService = (value: string) => {
        setCompanyForm(form => ({
            ...form,
            active_services: form.active_services.includes(value)
                ? form.active_services.filter(item => item !== value)
                : [...form.active_services, value],
        }));
    };

    const saveCompany = async () => {
        if (!supabaseClient || !tenantId) {
            setTenantError('Supabase não configurado neste ambiente.');
            return;
        }
        setSavingCompany(true);
        setTenantError(null);
        setCompanyNotice(null);

        const { error: updateError } = await supabaseClient
            .from('tenants')
            .update({
                company_name: companyForm.company_name.trim(),
                tax_id: companyForm.tax_id.trim(),
                address: companyForm.address.trim(),
                phone: companyForm.phone.trim(),
                email: companyForm.email.trim(),
                logo_url: companyForm.logo_url.trim(),
                property_type: (companyForm.property_type || null) as PropertyType | null,
                active_services: companyForm.active_services,
            })
            .eq('id', tenantId);

        setSavingCompany(false);
        if (updateError) {
            setTenantError(updateError.message);
            return;
        }
        setCompanyNotice('Parâmetros da empresa guardados com sucesso.');
        await refreshTenant();
    };

    /* ── IBANs ───────────────────────────────────────────────────────── */

    const [ibanAccounts, setIbanAccounts] = useState<BankAccount[]>([]);
    const [ibanLoading, setIbanLoading] = useState(true);
    const [ibanError, setIbanError] = useState<string | null>(null);
    const [ibanNotice, setIbanNotice] = useState<string | null>(null);
    const [ibanForm, setIbanForm] = useState<BankAccountInput>(EMPTY_IBAN_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingIban, setSavingIban] = useState(false);

    const canManage = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO';

    const refreshIbans = useCallback(async () => {
        setIbanLoading(true);
        const result = await listBankAccounts();
        setIbanLoading(false);
        if (result.error) {
            setIbanError(result.error);
            setIbanAccounts([]);
            return;
        }
        setIbanError(null);
        setIbanAccounts(result.data ?? []);
    }, []);

    // Carregamento diferido: o estado inicial é sempre a lista vazia, o que
    // mantém a marcação do servidor e do cliente idêntica.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refreshIbans(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshIbans]);

    const resetIbanForm = () => {
        setIbanForm(EMPTY_IBAN_FORM);
        setEditingId(null);
        setIbanNotice(null);
    };

    const submitIban = async () => {
        const iban = normaliseIban(ibanForm.iban);
        if (!ibanForm.bank_name.trim()) { setIbanError('Indique o nome do banco.'); return; }
        if (!ibanForm.account_holder.trim()) { setIbanError('Indique o titular da conta.'); return; }
        if (!isPlausibleIban(iban)) { setIbanError('IBAN inválido: verifique o formato e os dígitos de controlo.'); return; }

        setSavingIban(true);
        setIbanError(null);
        setIbanNotice(null);

        const result = editingId
            ? await updateBankAccount(editingId, { ...ibanForm, iban })
            : await createBankAccount({ ...ibanForm, iban });

        setSavingIban(false);
        if (result.error) { setIbanError(result.error); return; }

        setIbanNotice(editingId ? 'IBAN actualizado.' : 'IBAN registado e já visível na app do cliente.');
        await refreshIbans();
        resetIbanForm();
    };

    const removeIban = async (id: string) => {
        setIbanError(null);
        const result = await deleteBankAccount(id);
        if (result.error) { setIbanError(result.error); return; }
        setIbanNotice('IBAN removido.');
        await refreshIbans();
    };

    const promoteIban = async (account: BankAccount) => {
        setIbanError(null);
        const result = await updateBankAccount(account.id, {
            bank_name: account.bank_name,
            iban: account.iban,
            account_holder: account.account_holder,
            account_type: account.account_type,
            supports_multicaixa_express: account.supports_multicaixa_express,
            is_primary: true,
            is_active: account.is_active,
            instructions: account.instructions ?? '',
        });
        if (result.error) { setIbanError(result.error); return; }
        setIbanNotice(`${account.bank_name} é agora a conta principal.`);
        await refreshIbans();
    };

    /* ── Valores derivados do estado da licença ──────────────────────── */

    const daysLeft = license?.days_left ?? null;
    const daysLeftClass = daysLeft === null
        ? 'text-white/70'
        : daysLeft < 0 ? 'text-rose-400' : daysLeft <= 30 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-b border-white/10 pb-8"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <Settings className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                Parâmetros da Empresa
                            </h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                Configurações
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Tabs */}
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* ── EMPRESA ─────────────────────────────────────────── */}
                    {activeTab === 'empresa' && (
                        <div className="space-y-6">
                            {tenantError ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                                    <p className="text-sm text-rose-200">{tenantError}</p>
                                    <button onClick={() => setTenantError(null)} className="ml-auto text-rose-300" aria-label="Fechar">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : null}

                            {companyNotice ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                                    <p className="text-sm text-emerald-200">{companyNotice}</p>
                                </div>
                            ) : null}

                            {tenantLoading ? (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                                    <p className="text-sm text-white/40">A carregar os parâmetros…</p>
                                </div>
                            ) : !tenant ? (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                                    <p className="text-sm text-white/50">
                                        Não foi possível carregar os parâmetros desta instância. Verifique a ligação à base de dados.
                                    </p>
                                </div>
                            ) : (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-8 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <Building2 className="w-5 h-5 text-[var(--brand-primary)]" />
                                        <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                            Identidade da Empresa
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Razão Social</span>
                                            <input
                                                value={companyForm.company_name}
                                                onChange={e => setCompanyForm(f => ({ ...f, company_name: e.target.value }))}
                                                placeholder="Hotel Lukweku, Lda."
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">NIF</span>
                                            <input
                                                value={companyForm.tax_id}
                                                onChange={e => setCompanyForm(f => ({ ...f, tax_id: e.target.value }))}
                                                placeholder="5484045614"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Morada</span>
                                            <input
                                                value={companyForm.address}
                                                onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))}
                                                placeholder="Avenida 21 de Janeiro, Benfica, Luanda"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Telefone</span>
                                            <input
                                                value={companyForm.phone}
                                                onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))}
                                                placeholder="+244 923 000 000"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Email</span>
                                            <input
                                                type="email"
                                                value={companyForm.email}
                                                onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))}
                                                placeholder="gerencia@hotel.co.ao"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Logótipo (URL)</span>
                                            <input
                                                value={companyForm.logo_url}
                                                onChange={e => setCompanyForm(f => ({ ...f, logo_url: e.target.value }))}
                                                placeholder="https://…/logo.png"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                            />
                                        </label>

                                        <label className="block space-y-2 md:col-span-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tipologia</span>
                                            <select
                                                value={companyForm.property_type}
                                                onChange={e => setCompanyForm(f => ({ ...f, property_type: e.target.value }))}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            >
                                                <option value="">Selecionar…</option>
                                                {PROPERTY_TYPES.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="space-y-3">
                                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                            Serviços Activos
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {SERVICE_CATALOGUE.map(service => (
                                                <label
                                                    key={service.value}
                                                    className="flex items-center gap-2.5 px-3.5 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 cursor-pointer hover:border-[var(--brand-primary)]/40 transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={companyForm.active_services.includes(service.value)}
                                                        onChange={() => toggleService(service.value)}
                                                        className="w-4 h-4"
                                                    />
                                                    {service.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <button
                                            onClick={saveCompany}
                                            disabled={savingCompany}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                                        >
                                            <Save className="w-4 h-4" />
                                            {savingCompany ? 'A guardar…' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── IBANs ───────────────────────────────────────────── */}
                    {activeTab === 'ibans' && (
                        <div className="space-y-6">
                            <p className="text-sm text-white/45 leading-relaxed max-w-3xl">
                                Estes IBANs são o que a app do cliente mostra no ecrã de pagamento. Cada banco tem a sua
                                linha, e a conta principal é destacada na tabela.
                            </p>

                            {ibanError ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                                    <p className="text-sm text-rose-200">{ibanError}</p>
                                    <button onClick={() => setIbanError(null)} className="ml-auto text-rose-300" aria-label="Fechar">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : null}

                            {ibanNotice ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                                    <p className="text-sm text-emerald-200">{ibanNotice}</p>
                                </div>
                            ) : null}

                            {canManage ? (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-8 space-y-5">
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        {editingId ? 'Editar conta' : 'Nova conta bancária'}
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Banco</span>
                                            <input
                                                value={ibanForm.bank_name}
                                                onChange={e => setIbanForm(f => ({ ...f, bank_name: e.target.value }))}
                                                placeholder="Banco de Angola, BAI, Millennium…"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">IBAN</span>
                                            <input
                                                value={ibanForm.iban}
                                                onChange={e => setIbanForm(f => ({ ...f, iban: e.target.value }))}
                                                placeholder="AO06 0000 0000 0000 0000 0000 0"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Titular</span>
                                            <input
                                                value={ibanForm.account_holder}
                                                onChange={e => setIbanForm(f => ({ ...f, account_holder: e.target.value }))}
                                                placeholder="Hotel Lukweku, Lda."
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tipo</span>
                                            <select
                                                value={ibanForm.account_type}
                                                onChange={e => setIbanForm(f => ({ ...f, account_type: e.target.value as BankAccountInput['account_type'] }))}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            >
                                                <option value="CORRENTE">Corrente</option>
                                                <option value="POUPANCA">Poupança</option>
                                            </select>
                                        </label>
                                    </div>

                                    <label className="block space-y-2">
                                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                            Instruções mostradas ao cliente
                                        </span>
                                        <textarea
                                            value={ibanForm.instructions}
                                            onChange={e => setIbanForm(f => ({ ...f, instructions: e.target.value }))}
                                            rows={2}
                                            placeholder="Use o número da reserva como descritivo."
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm resize-none"
                                        />
                                    </label>

                                    <div className="flex flex-wrap gap-5">
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={ibanForm.supports_multicaixa_express}
                                                onChange={e => setIbanForm(f => ({ ...f, supports_multicaixa_express: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Aceita Multicaixa Express
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={ibanForm.is_primary}
                                                onChange={e => setIbanForm(f => ({ ...f, is_primary: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Conta principal
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={ibanForm.is_active}
                                                onChange={e => setIbanForm(f => ({ ...f, is_active: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Activa
                                        </label>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={submitIban}
                                            disabled={savingIban}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                                        >
                                            <Save className="w-4 h-4" />
                                            {editingId ? 'Guardar' : 'Registar conta'}
                                        </button>
                                        {editingId ? (
                                            <button
                                                onClick={resetIbanForm}
                                                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider"
                                            >
                                                Cancelar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-8 text-sm text-white/50">
                                    Este perfil é de leitura. A gestão de IBANs é exclusiva de administradores.
                                </div>
                            )}

                            <div className="space-y-4">
                                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                    Contas registadas
                                </h3>

                                {ibanLoading ? (
                                    <p className="text-sm text-white/40">A carregar…</p>
                                ) : ibanAccounts.length === 0 ? (
                                    <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                                        <p className="text-sm text-white/50">
                                            Ainda não há contas bancárias registadas. Sem um IBAN activo, os
                                            clientes não conseguem pagar.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="glass-panel rounded-[28px] border border-white/5 overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm min-w-[760px]">
                                                <thead>
                                                    <tr className="border-b border-white/10 text-left">
                                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Banco</th>
                                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">IBAN</th>
                                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Titular</th>
                                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tipo</th>
                                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Estado</th>
                                                        {canManage ? (
                                                            <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em] text-right">Acções</th>
                                                        ) : null}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ibanAccounts.map(account => (
                                                        <tr key={account.id} className="border-b border-white/5 last:border-0">
                                                            <td className="px-5 py-4">
                                                                <span className="flex items-center gap-2 font-bold text-white">
                                                                    <Building2 className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
                                                                    {account.bank_name}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-4 font-mono text-[var(--brand-primary)] break-all">
                                                                {prettyIban(account.iban)}
                                                            </td>
                                                            <td className="px-5 py-4 text-white/60">{account.account_holder}</td>
                                                            <td className="px-5 py-4 text-white/60">
                                                                {account.account_type === 'CORRENTE' ? 'Corrente' : 'Poupança'}
                                                            </td>
                                                            <td className="px-5 py-4">
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {account.is_primary ? (
                                                                        <span className="px-2.5 py-1 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/40 text-[10px] font-black uppercase text-[var(--brand-primary)]">
                                                                            Principal
                                                                        </span>
                                                                    ) : null}
                                                                    {!account.is_active ? (
                                                                        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase text-white/40">
                                                                            Inactiva
                                                                        </span>
                                                                    ) : null}
                                                                    {account.supports_multicaixa_express ? (
                                                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[10px] font-black uppercase text-emerald-300">
                                                                            Express
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </td>
                                                            {canManage ? (
                                                                <td className="px-5 py-4">
                                                                    <div className="flex justify-end gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditingId(account.id);
                                                                                setIbanForm({
                                                                                    bank_name: account.bank_name,
                                                                                    iban: account.iban,
                                                                                    account_holder: account.account_holder,
                                                                                    account_type: account.account_type,
                                                                                    supports_multicaixa_express: account.supports_multicaixa_express,
                                                                                    is_primary: account.is_primary,
                                                                                    is_active: account.is_active,
                                                                                    instructions: account.instructions ?? '',
                                                                                });
                                                                                setIbanNotice(null);
                                                                            }}
                                                                            className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                                        >
                                                                            Editar
                                                                        </button>
                                                                        {!account.is_primary ? (
                                                                            <button
                                                                                onClick={() => void promoteIban(account)}
                                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                                            >
                                                                                <Star className="w-3 h-3" /> Principal
                                                                            </button>
                                                                        ) : null}
                                                                        <button
                                                                            onClick={() => void removeIban(account.id)}
                                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" /> Remover
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            ) : null}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── SISTEMA ─────────────────────────────────────────── */}
                    {activeTab === 'sistema' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Building2 className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Instância</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">ID da Instância</span>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/80 text-sm font-mono break-all">
                                            {user?.tenantId ?? '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Designação Comercial</span>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                            {tenant?.company_name ?? '—'}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Moeda</span>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                                {tenant?.currency ?? '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Registo</span>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                                {tenant ? (tenant.is_active ? 'Activo' : 'Inactivo') : '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <KeyRound className="w-5 h-5 text-[var(--brand-secondary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Licença</h3>
                                </div>

                                {license === null ? (
                                    <p className="text-sm text-white/50 leading-relaxed">
                                        Ainda não foi possível determinar o estado da licença desta instância. Se a
                                        migração de licenciamento ainda não foi aplicada, o acesso não é bloqueado.
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Tipo de Licença</span>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                                {license.license_type ?? '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Estado Efectivo</span>
                                            <div className={`w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-black uppercase tracking-wider ${licenseStatusClass(license.effective_status)}`}>
                                                {license.effective_status ?? '—'}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Expira em</span>
                                                <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                                    {formatPtDate(license.expires_at)}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Dias Restantes</span>
                                                <div className={`w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-black ${daysLeftClass}`}>
                                                    {daysLeft ?? '—'}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Licença Paga</span>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                                {license.is_paid == null ? '—' : license.is_paid ? 'Sim' : 'Não'}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-start gap-3">
                                    <KeyRound className="w-4 h-4 text-[var(--brand-secondary)] shrink-0 mt-0.5" />
                                    <p className="text-xs text-white/50 leading-relaxed">
                                        A renovação da licença é efectuada pelo Utilizador Master Global em{' '}
                                        <span className="font-mono text-white/80">/master/licensing</span>.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── MÓDULOS ─────────────────────────────────────────── */}
                    {activeTab === 'modulos' && (
                        <div className="space-y-6">
                            <div className="glass-panel p-6 rounded-[28px] border border-white/5 flex items-start gap-3">
                                <ShieldCheck className="w-5 h-5 text-[var(--brand-accent)] shrink-0 mt-0.5" />
                                <p className="text-sm text-white/55 leading-relaxed">
                                    {user?.isMasterGlobal
                                        ? 'O Utilizador Master Global tem acesso vitalício a todos os módulos.'
                                        : user && user.permissions.length === 0
                                            ? 'Sem permissões granulares atribuídas — o acesso deste perfil segue as regras do papel, sem restrições por módulo.'
                                            : `Este perfil tem ${user?.permissions.length ?? 0} permissão(ões) granular(es) atribuída(s), assinaladas a seguir.`}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {PERMISSION_MODULES.map(mod => {
                                    const granted = Boolean(user && user.permissions.includes(mod.key));
                                    return (
                                        <div
                                            key={mod.key}
                                            className={`glass-panel p-6 rounded-[24px] border transition-all ${
                                                granted
                                                    ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5'
                                                    : 'border-white/5 opacity-70'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                                    {mod.name}
                                                </h4>
                                                {granted ? (
                                                    <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/40 text-[var(--brand-primary)]">
                                                        <Check className="w-3 h-3" /> Atribuída
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-xs text-white/40 leading-relaxed">{mod.description}</p>
                                            <p className="mt-3 font-mono text-[10px] text-white/30">{mod.key}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
