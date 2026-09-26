'use client';

import { motion } from 'framer-motion';
import { Banknote, Building2, Check, Plus, Save, Star, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
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

export default function FinanceiroPage() {
    const { user } = useAuth();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [form, setForm] = useState<BankAccountInput>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const canManage = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO';

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
                                CONTAS BANCÁRIAS E IBAN
                            </p>
                        </div>
                    </div>
                </motion.div>

                <p className="text-sm text-white/45 leading-relaxed max-w-3xl">
                    Estes IBANs são o que a app do cliente mostra no ecrã de pagamento. Só os IBANs
                    activos deste hotel são visíveis, e cada hóspede vê apenas os do hotel onde está
                    a reservar.
                </p>

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
        </DashboardLayout>
    );
}
