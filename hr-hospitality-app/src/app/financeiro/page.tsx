'use client';

import { motion } from 'framer-motion';
import { Banknote, Building2, Check, Pencil, Plus, Receipt, Save, Star, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { supabaseClient } from '@/lib/supabaseClient';
import {
    createBankAccount,
    deleteBankAccount,
    listBankAccounts,
    updateBankAccount,
    type BankAccount,
    type BankAccountInput,
} from '@/lib/adminData';

const EMPTY_FORM: BankAccountInput = {
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

/* ── Despesas diárias ────────────────────────────────────────────────────── */

type ExpenseCategory =
    | 'FORNECEDOR'
    | 'MANUTENCAO'
    | 'COMPRA'
    | 'SANGRIA'
    | 'SERVICOS'
    | 'SALARIOS'
    | 'IMPOSTOS'
    | 'TRANSPORTE'
    | 'ENERGIA'
    | 'OUTRO';

type ExpensePaymentMethod = 'NUMERARIO' | 'TPA' | 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA' | 'IBAN';

interface DailyExpense {
    id: string;
    category: ExpenseCategory;
    description: string;
    amount: number;
    expense_date: string;
    payment_method: ExpensePaymentMethod;
    supplier: string | null;
    receipt_url: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
    { value: 'FORNECEDOR', label: 'Fornecedor' },
    { value: 'MANUTENCAO', label: 'Manutenção' },
    { value: 'COMPRA', label: 'Compra' },
    { value: 'SANGRIA', label: 'Sangria' },
    { value: 'SERVICOS', label: 'Serviços' },
    { value: 'SALARIOS', label: 'Salários' },
    { value: 'IMPOSTOS', label: 'Impostos' },
    { value: 'TRANSPORTE', label: 'Transporte' },
    { value: 'ENERGIA', label: 'Energia' },
    { value: 'OUTRO', label: 'Outro' },
];

const PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
    { value: 'NUMERARIO', label: 'Numerário' },
    { value: 'TPA', label: 'TPA' },
    { value: 'MULTICAIXA_EXPRESS', label: 'Multicaixa Express' },
    { value: 'TRANSFERENCIA', label: 'Transferência' },
    { value: 'IBAN', label: 'IBAN' },
];

const EXPENSE_COLUMNS =
    'id,category,description,amount,expense_date,payment_method,supplier,receipt_url,created_by,created_at,updated_at';

const categoryLabel = (value: string): string =>
    EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value;

const paymentLabel = (value: string): string =>
    PAYMENT_METHODS.find(p => p.value === value)?.label ?? value;

const currencyFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'AOA' });

function todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function currentMonthStr(): string {
    return todayStr().slice(0, 7);
}

/** 'YYYY-MM' → 'Setembro 2026' (para legendas). */
function monthLabel(monthStr: string): string {
    const [y, m] = monthStr.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/** 'YYYY-MM' → 'DD/MM/YYYY' em hora local (sem desfasamento de fuso). */
function formatDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-PT');
}

interface ExpenseForm {
    category: ExpenseCategory;
    description: string;
    amount: string;
    expense_date: string;
    payment_method: ExpensePaymentMethod;
    supplier: string;
}

function emptyExpenseForm(): ExpenseForm {
    return {
        category: 'FORNECEDOR',
        description: '',
        amount: '',
        expense_date: todayStr(),
        payment_method: 'NUMERARIO',
        supplier: '',
    };
}

export default function FinanceiroPage() {
    const { user, hasPermission } = useAuth();
    const [activeTab, setActiveTab] = useState<'ibans' | 'despesas'>('ibans');

    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [form, setForm] = useState<BankAccountInput>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const canManage = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO';

    /* ── Despesas diárias ── */

    const [expenses, setExpenses] = useState<DailyExpense[]>([]);
    const [expensesLoading, setExpensesLoading] = useState(true);
    const [expensesError, setExpensesError] = useState<string | null>(null);
    const [expensesNotice, setExpensesNotice] = useState<string | null>(null);
    const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [savingExpense, setSavingExpense] = useState(false);
    // '' = mês actual (por omissão; só definido no cliente para manter a
    // marcação do servidor e do cliente idêntica). 'all' = sem filtro de mês.
    const [month, setMonth] = useState<string>('');

    const canManageExpenses = hasPermission('financial');

    const refreshExpenses = useCallback(async () => {
        setExpensesLoading(true);
        if (!supabaseClient) {
            setExpensesError('Supabase não configurado neste ambiente.');
            setExpenses([]);
            setExpensesLoading(false);
            return;
        }
        const filterMonth = month === 'all' ? null : (month || currentMonthStr());
        let query = supabaseClient
            .from('daily_expenses')
            .select(EXPENSE_COLUMNS)
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100);
        if (filterMonth) {
            const [y, m] = filterMonth.split('-').map(Number);
            const start = `${filterMonth}-01`;
            const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
            query = query.gte('expense_date', start).lt('expense_date', end);
        }
        const { data, error: fetchError } = await query;
        setExpensesLoading(false);
        if (fetchError) {
            setExpensesError(fetchError.message || 'Falha ao carregar as despesas.');
            setExpenses([]);
            return;
        }
        setExpensesError(null);
        setExpenses((data ?? []) as DailyExpense[]);
    }, [month]);

    // Carregamento diferido: o estado inicial é sempre a lista vazia, o que
    // mantém a marcação do servidor e do cliente idêntica.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refreshExpenses(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshExpenses]);

    // Realtime: qualquer mudança na tabela dispara um refrescamento.
    useEffect(() => {
        if (!supabaseClient) return;
        const client = supabaseClient;
        // Sufixo próprio: o supabase-js reutiliza o canal do mesmo tópico e,
        // se o anterior ainda está a fechar, o `.on()` lança e parte a página.
        const channel = client
            .channel(`daily_expenses#${Date.now().toString(36)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_expenses' }, () => {
                void refreshExpenses();
            });
        void channel.subscribe();
        return () => { void client.removeChannel(channel); };
    }, [refreshExpenses]);

    const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
    const averageExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;
    const mostRecentDate = expenses.length > 0 ? expenses[0].expense_date : null;

    const submitExpense = async () => {
        if (!supabaseClient) { setExpensesError('Supabase não configurado neste ambiente.'); return; }
        const description = expenseForm.description.trim();
        const amount = Number.parseFloat(expenseForm.amount.replace(',', '.'));
        if (description.length < 2) { setExpensesError('Indique a descrição (mínimo 2 caracteres).'); return; }
        if (!Number.isFinite(amount) || amount <= 0) { setExpensesError('Indique um valor válido maior que zero.'); return; }
        if (!expenseForm.expense_date) { setExpensesError('Indique a data da despesa.'); return; }

        setSavingExpense(true);
        setExpensesError(null);
        setExpensesNotice(null);

        const payload: {
            category: ExpenseCategory;
            description: string;
            amount: number;
            expense_date: string;
            payment_method: ExpensePaymentMethod;
            supplier: string | null;
            created_by?: string | null;
        } = {
            category: expenseForm.category,
            description,
            amount: Math.round(amount * 100) / 100,
            expense_date: expenseForm.expense_date,
            payment_method: expenseForm.payment_method,
            supplier: expenseForm.supplier.trim() || null,
        };
        if (!editingExpenseId) payload.created_by = user?.authUserId ?? null;

        const { error: writeError } = editingExpenseId
            ? await supabaseClient.from('daily_expenses').update(payload).eq('id', editingExpenseId)
            : await supabaseClient.from('daily_expenses').insert(payload);

        setSavingExpense(false);
        if (writeError) { setExpensesError(writeError.message || 'Falha ao guardar a despesa.'); return; }

        setExpensesNotice(editingExpenseId ? 'Despesa actualizada.' : 'Despesa registada.');
        setExpenseForm(emptyExpenseForm());
        setEditingExpenseId(null);
        await refreshExpenses();
        // Opcional: reconstrói o razão para refletir a despesa de imediato.
        const { error: syncError } = await supabaseClient.rpc('hr_sync_financial_entries', {
            p_tenant_id: user?.tenantId,
        });
        if (syncError) {
            // Não bloqueante: o razão é reconstruído noutro ciclo de sincronização.
        }
    };

    const editExpense = (row: DailyExpense) => {
        setEditingExpenseId(row.id);
        setExpenseForm({
            category: row.category,
            description: row.description,
            amount: String(row.amount),
            expense_date: row.expense_date,
            payment_method: row.payment_method,
            supplier: row.supplier ?? '',
        });
        setExpensesNotice(null);
    };

    const resetExpenseForm = () => {
        setExpenseForm(emptyExpenseForm());
        setEditingExpenseId(null);
        setExpensesNotice(null);
    };

    const removeExpense = async (id: string) => {
        if (!supabaseClient) { setExpensesError('Supabase não configurado neste ambiente.'); return; }
        if (!window.confirm('Tem a certeza que quer apagar esta despesa?')) return;
        setExpensesError(null);
        const { error: deleteError } = await supabaseClient.from('daily_expenses').delete().eq('id', id);
        if (deleteError) { setExpensesError(deleteError.message || 'Falha ao apagar a despesa.'); return; }
        setExpensesNotice('Despesa apagada.');
        await refreshExpenses();
    };

    /* ── IBANs (existente) ── */

    const refresh = useCallback(async () => {
        setLoading(true);
        const result = await listBankAccounts();
        setLoading(false);
        if (result.error) {
            setError(result.error);
            setAccounts([]);
            return;
        }
        setError(null);
        setAccounts(result.data ?? []);
    }, []);

    // Carregamento diferido: o estado inicial é sempre a lista vazia, o que
    // mantém a marcação do servidor e do cliente idêntica.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const reset = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setNotice(null);
    };

    const submit = async () => {
        const iban = normaliseIban(form.iban);
        if (!form.bank_name.trim()) { setError('Indique o nome do banco.'); return; }
        if (!form.account_holder.trim()) { setError('Indique o titular da conta.'); return; }
        if (!isPlausibleIban(iban)) { setError('IBAN inválido: verifique o formato e os dígitos de controlo.'); return; }

        setSaving(true);
        setError(null);
        setNotice(null);

        const result = editingId
            ? await updateBankAccount(editingId, { ...form, iban })
            : await createBankAccount({ ...form, iban });

        setSaving(false);
        if (result.error) { setError(result.error); return; }

        setNotice(editingId ? 'IBAN actualizado.' : 'IBAN registado e já visível na app do cliente.');
        await refresh();
        reset();
    };

    const remove = async (id: string) => {
        setError(null);
        const result = await deleteBankAccount(id);
        if (result.error) { setError(result.error); return; }
        setNotice('IBAN removido.');
        await refresh();
    };

    const promote = async (account: BankAccount) => {
        setError(null);
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
        if (result.error) { setError(result.error); return; }
        setNotice(`${account.bank_name} é agora a conta principal.`);
        await refresh();
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-b border-white/10 pb-8"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <Banknote className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                Financeiro
                            </h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                Contas bancárias e IBAN
                            </p>
                        </div>
                    </div>
                </motion.div>

                <p className="text-sm text-white/45 leading-relaxed max-w-3xl">
                    Estes IBANs são o que a app do cliente mostra no ecrã de pagamento. Só os IBANs
                    activos deste hotel são visíveis, e cada hóspede vê apenas os do hotel onde está
                    a reservar.
                </p>

                {/* Tab switcher */}
                <div className="flex gap-3 overflow-x-auto pb-2">
                    <button
                        onClick={() => setActiveTab('ibans')}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all whitespace-nowrap ${
                            activeTab === 'ibans'
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <Building2 className="w-4 h-4" />
                        IBANs / Contas
                    </button>
                    <button
                        onClick={() => setActiveTab('despesas')}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all whitespace-nowrap ${
                            activeTab === 'despesas'
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <Receipt className="w-4 h-4" />
                        Despesas Diárias
                    </button>
                </div>

                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'ibans' && (
                        <div className="space-y-10">
                            {error ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                                    <p className="text-sm text-rose-200">{error}</p>
                                    <button onClick={() => setError(null)} className="ml-auto text-rose-300" aria-label="Fechar">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : null}

                            {notice ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                                    <p className="text-sm text-emerald-200">{notice}</p>
                                </div>
                            ) : null}

                            {canManage ? (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-8 space-y-5">
                                    <h2 className="text-lg font-black text-white uppercase tracking-wider">
                                        {editingId ? 'Editar conta' : 'Nova conta bancária'}
                                    </h2>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Banco</span>
                                            <input
                                                value={form.bank_name}
                                                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                                                placeholder="Banco de Angola, BAI, Millennium…"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">IBAN</span>
                                            <input
                                                value={form.iban}
                                                onChange={e => setForm(f => ({ ...f, iban: e.target.value }))}
                                                placeholder="AO06 0000 0000 0000 0000 0000 0"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Titular</span>
                                            <input
                                                value={form.account_holder}
                                                onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
                                                placeholder="Hotel Lukweku, Lda."
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tipo</span>
                                            <select
                                                value={form.account_type}
                                                onChange={e => setForm(f => ({ ...f, account_type: e.target.value as BankAccountInput['account_type'] }))}
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
                                            value={form.instructions}
                                            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                                            rows={2}
                                            placeholder="Use o número da reserva como descritivo."
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm resize-none"
                                        />
                                    </label>

                                    <div className="flex flex-wrap gap-5">
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={form.supports_multicaixa_express}
                                                onChange={e => setForm(f => ({ ...f, supports_multicaixa_express: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Aceita Multicaixa Express
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={form.is_primary}
                                                onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Conta principal
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-white/70">
                                            <input
                                                type="checkbox"
                                                checked={form.is_active}
                                                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                                                className="w-4 h-4"
                                            />
                                            Activa
                                        </label>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={submit}
                                            disabled={saving}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                                        >
                                            <Save className="w-4 h-4" />
                                            {editingId ? 'Guardar' : 'Registar conta'}
                                        </button>
                                        {editingId ? (
                                            <button
                                                onClick={reset}
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
                                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                                    Contas registadas
                                </h2>

                                {loading ? (
                                    <p className="text-sm text-white/40">A carregar…</p>
                                ) : accounts.length === 0 ? (
                                    <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                                        <p className="text-sm text-white/50">
                                            Ainda não há contas bancárias registadas. Sem um IBAN activo, os
                                            clientes não conseguem pagar.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {accounts.map(account => (
                                            <motion.div
                                                key={account.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-base font-black text-white flex items-center gap-2">
                                                            <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
                                                            {account.bank_name}
                                                        </p>
                                                        <p className="font-mono text-sm text-[var(--brand-primary)] mt-2 break-all">
                                                            {prettyIban(account.iban)}
                                                        </p>
                                                        <p className="text-xs text-white/40 mt-1">{account.account_holder}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-2 items-end">
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
                                                </div>

                                                {account.instructions ? (
                                                    <p className="text-xs text-white/45 leading-relaxed">{account.instructions}</p>
                                                ) : null}

                                                {canManage ? (
                                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                                        <button
                                                            onClick={() => {
                                                                setEditingId(account.id);
                                                                setForm({
                                                                    bank_name: account.bank_name,
                                                                    iban: account.iban,
                                                                    account_holder: account.account_holder,
                                                                    account_type: account.account_type,
                                                                    supports_multicaixa_express: account.supports_multicaixa_express,
                                                                    is_primary: account.is_primary,
                                                                    is_active: account.is_active,
                                                                    instructions: account.instructions ?? '',
                                                                });
                                                                setNotice(null);
                                                            }}
                                                            className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                        >
                                                            Editar
                                                        </button>
                                                        {!account.is_primary ? (
                                                            <button
                                                                onClick={() => void promote(account)}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                            >
                                                                <Star className="w-3 h-3" /> Principal
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            onClick={() => void remove(account.id)}
                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider ml-auto"
                                                        >
                                                            <Trash2 className="w-3 h-3" /> Remover
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-2">
                                <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <Plus className="w-3.5 h-3.5" /> Como funciona no cliente
                                </p>
                                <p className="text-sm text-white/60 leading-relaxed">
                                    A app do cliente lista estes IBANs, permite copiá-los para a área de
                                    transferência do telemóvel e envia o comprovativo para validação. A reserva só
                                    passa a <span className="text-white">CONFIRMADA</span> depois de um comprovativo
                                    aprovado — regra aplicada na base de dados, não no ecrã.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'despesas' && (
                        <div className="space-y-6">
                            {/* KPIs */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="glass-panel rounded-[28px] border border-white/5 p-5">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Total de Despesas</p>
                                    <p className="text-2xl font-black text-white mt-2">{currencyFmt.format(totalExpenses)}</p>
                                </div>
                                <div className="glass-panel rounded-[28px] border border-white/5 p-5">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Nº de Lançamentos</p>
                                    <p className="text-2xl font-black text-white mt-2">{expenses.length}</p>
                                </div>
                                <div className="glass-panel rounded-[28px] border border-white/5 p-5">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Despesa Média</p>
                                    <p className="text-2xl font-black text-white mt-2">{currencyFmt.format(averageExpense)}</p>
                                </div>
                                <div className="glass-panel rounded-[28px] border border-white/5 p-5">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Mais Recente</p>
                                    <p className="text-2xl font-black text-white mt-2">
                                        {mostRecentDate ? formatDate(mostRecentDate) : '—'}
                                    </p>
                                </div>
                            </div>

                            {/* Filtro de mês */}
                            <div className="flex flex-wrap items-end gap-3">
                                <label className="block space-y-2">
                                    <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Mês</span>
                                    <input
                                        type="month"
                                        value={month === 'all' ? '' : month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                    />
                                </label>
                                <button
                                    onClick={() => setMonth('all')}
                                    className={`px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                                        month === 'all'
                                            ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    Todas
                                </button>
                                {month !== 'all' && month !== '' ? (
                                    <button
                                        onClick={() => setMonth('')}
                                        className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-black uppercase tracking-wider hover:bg-white/10 hover:text-white"
                                    >
                                        Mês actual
                                    </button>
                                ) : null}
                                <p className="text-xs text-white/40 pb-3">
                                    {month === 'all'
                                        ? 'Filtro: todas as despesas'
                                        : month === ''
                                            ? `Filtro: mês actual (${monthLabel(currentMonthStr())})`
                                            : `Filtro: ${monthLabel(month)}`}
                                </p>
                            </div>

                            {expensesError ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                                    <p className="text-sm text-rose-200">{expensesError}</p>
                                    <button onClick={() => setExpensesError(null)} className="ml-auto text-rose-300" aria-label="Fechar">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : null}

                            {expensesNotice ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                                    <p className="text-sm text-emerald-200">{expensesNotice}</p>
                                </div>
                            ) : null}

                            {!canManageExpenses ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-sky-300 shrink-0" />
                                    <p className="text-sm text-sky-200">
                                        O seu perfil não inclui a permissão &apos;Financeiro / Despesas&apos;. Pode
                                        consultar os lançamentos, mas não criar, editar ou apagar.
                                    </p>
                                </div>
                            ) : null}

                            {canManageExpenses ? (
                                <div className="glass-panel rounded-[28px] border border-white/5 p-8 space-y-5">
                                    <h2 className="text-lg font-black text-white uppercase tracking-wider">
                                        {editingExpenseId ? 'Editar despesa' : 'Nova despesa'}
                                    </h2>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Categoria</span>
                                            <select
                                                value={expenseForm.category}
                                                onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            >
                                                {EXPENSE_CATEGORIES.map(c => (
                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Pagamento</span>
                                            <select
                                                value={expenseForm.payment_method}
                                                onChange={e => setExpenseForm(f => ({ ...f, payment_method: e.target.value as ExpensePaymentMethod }))}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            >
                                                {PAYMENT_METHODS.map(p => (
                                                    <option key={p.value} value={p.value}>{p.label}</option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block space-y-2 md:col-span-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Descrição</span>
                                            <input
                                                value={expenseForm.description}
                                                onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                                                placeholder="Ex.: Compra de produtos de limpeza"
                                                maxLength={300}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Valor (AOA)</span>
                                            <input
                                                value={expenseForm.amount}
                                                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                                                placeholder="0,00"
                                                inputMode="decimal"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Data</span>
                                            <input
                                                type="date"
                                                value={expenseForm.expense_date}
                                                onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>

                                        <label className="block space-y-2 md:col-span-2">
                                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                                Fornecedor (opcional)
                                            </span>
                                            <input
                                                value={expenseForm.supplier}
                                                onChange={e => setExpenseForm(f => ({ ...f, supplier: e.target.value }))}
                                                placeholder="Nome do fornecedor"
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            />
                                        </label>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={submitExpense}
                                            disabled={savingExpense}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                                        >
                                            <Save className="w-4 h-4" />
                                            {editingExpenseId ? 'Guardar' : 'Registar despesa'}
                                        </button>
                                        {editingExpenseId ? (
                                            <button
                                                onClick={resetExpenseForm}
                                                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider"
                                            >
                                                Cancelar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            <div className="space-y-4">
                                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                                    Lançamentos
                                </h2>

                                {expensesLoading ? (
                                    <p className="text-sm text-white/40">A carregar…</p>
                                ) : expenses.length === 0 ? (
                                    <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                                        <p className="text-sm text-white/50">Sem despesas registadas.</p>
                                    </div>
                                ) : (
                                    <div className="glass-panel rounded-[28px] border border-white/5 overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[900px] text-sm">
                                                <thead>
                                                    <tr className="border-b border-white/10 text-left">
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Data</th>
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Categoria</th>
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Descrição</th>
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Fornecedor</th>
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Pagamento</th>
                                                        <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Valor</th>
                                                        {canManageExpenses ? (
                                                            <th className="px-4 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Acções</th>
                                                        ) : null}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {expenses.map(row => (
                                                        <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                                            <td className="px-4 py-3 text-white/70 whitespace-nowrap">{formatDate(row.expense_date)}</td>
                                                            <td className="px-4 py-3">
                                                                <span className="px-2.5 py-1 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/40 text-[10px] font-black uppercase text-[var(--brand-primary)] whitespace-nowrap">
                                                                    {categoryLabel(row.category)}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-white/80">{row.description}</td>
                                                            <td className="px-4 py-3 text-white/50">{row.supplier ?? '—'}</td>
                                                            <td className="px-4 py-3 text-white/60 whitespace-nowrap">{paymentLabel(row.payment_method)}</td>
                                                            <td className="px-4 py-3 text-white font-black text-right whitespace-nowrap">
                                                                {currencyFmt.format(Number(row.amount))}
                                                            </td>
                                                            {canManageExpenses ? (
                                                                <td className="px-4 py-3">
                                                                    <div className="flex gap-2 justify-end">
                                                                        <button
                                                                            onClick={() => editExpense(row)}
                                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                                        >
                                                                            <Pencil className="w-3 h-3" /> Editar
                                                                        </button>
                                                                        <button
                                                                            onClick={() => void removeExpense(row.id)}
                                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" /> Apagar
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
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
