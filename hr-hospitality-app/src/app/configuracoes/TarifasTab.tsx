'use client';

import { Check, Pencil, Plus, RefreshCw, Tag, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
    canWriteAlojamento,
    createRoomRate,
    deleteRoomRate,
    formatAmount,
    isAdministrator,
    listRoomRates,
    MIGRATION_011_HINT,
    resolveRoomRate,
    updateRoomRate,
    type BillingMode,
    type BlockHours,
    type RateScope,
    type RoomRate,
    type RoomRateWrite,
} from '@/lib/roomRates';
import { supabase } from '@/lib/supabase';

/* ── Tipos e constantes locais ────────────────────────────────────────────── */

interface RoomOption {
    id: string;
    room_number: string | null;
    room_type: string | null;
}

interface RateForm {
    scope: RateScope;
    room_id: string;
    room_type: string;
    billing_mode: BillingMode;
    /** `0` = por escolher (tarifa por hora) ou não aplicável (diária). */
    block_hours: number;
    price: string;
    extra_hour_price: string;
    label: string;
    is_default: boolean;
    is_active: boolean;
    valid_from: string;
    valid_to: string;
}

const EMPTY_FORM: RateForm = {
    scope: 'PROPERTY',
    room_id: '',
    room_type: '',
    billing_mode: 'PER_DAY',
    block_hours: 0,
    price: '',
    extra_hour_price: '',
    label: '',
    is_default: true,
    is_active: true,
    valid_from: '',
    valid_to: '',
};

const SCOPE_OPTIONS: { value: RateScope; label: string }[] = [
    { value: 'PROPERTY', label: 'Propriedade' },
    { value: 'TYPE', label: 'Tipo de quarto' },
    { value: 'ROOM', label: 'Quarto específico' },
];

const MODE_OPTIONS: { value: BillingMode; label: string; hint: string }[] = [
    { value: 'PER_DAY', label: 'Diária', hint: 'Preço por noite' },
    { value: 'PER_HOUR', label: 'Por hora', hint: 'Bloco de 1h, 2h ou 3h' },
];

async function fetchRooms(): Promise<{ rooms: RoomOption[]; error: string | null }> {
    const { data, error } = await supabase
        .from('hotel_rooms')
        .select('id, room_number, room_type')
        .order('room_number', { ascending: true });
    if (error || !data) {
        return { rooms: [], error: error?.message || 'Não foi possível carregar os quartos.' };
    }
    return { rooms: data as RoomOption[], error: null };
}

function parseAmount(raw: string): number {
    return Number(raw.trim().replace(/\s/g, '').replace(',', '.'));
}

function isBlockHours(value: number): value is BlockHours {
    return value === 0 || value === 1 || value === 2 || value === 3;
}

function scopeMatches(rate: RoomRate, form: RateForm): boolean {
    if (form.scope === 'ROOM') return rate.room_id !== null && rate.room_id === form.room_id;
    if (form.scope === 'TYPE') {
        return rate.room_id === null && (rate.room_type ?? '').trim() === form.room_type.trim();
    }
    return rate.room_id === null && (rate.room_type ?? '').trim() === '';
}

function scopeOf(rate: RoomRate): string {
    if (rate.room_id) return 'Quarto';
    if (rate.room_type) return `Tipo: ${rate.room_type}`;
    return 'Propriedade';
}

/* ── Componente ───────────────────────────────────────────────────────────── */

export function TarifasTab() {
    const { user, hasPermission } = useAuth();
    const canWrite = canWriteAlojamento(user) && hasPermission('reception');
    const canDelete = canWrite && isAdministrator(user);

    const [rates, setRates] = useState<RoomRate[]>([]);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [form, setForm] = useState<RateForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const [refRoomId, setRefRoomId] = useState('');
    const [preview, setPreview] = useState<{ loading: boolean; price: number | null; error: string | null }>({
        loading: false,
        price: null,
        error: null,
    });

    const queryBlock: BlockHours =
        form.billing_mode === 'PER_DAY' ? 0 : (isBlockHours(form.block_hours) ? form.block_hours : 0);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [ratesResult, roomsResult] = await Promise.all([listRoomRates(), fetchRooms()]);
        setLoading(false);

        setMissing(ratesResult.missing);
        if (ratesResult.error) {
            setError(ratesResult.error);
            setRates([]);
        } else {
            setError(null);
            setRates(ratesResult.data ?? []);
        }

        if (roomsResult.error) {
            setError(previous => previous ?? roomsResult.error);
            setRooms([]);
        } else {
            setRooms(roomsResult.rooms);
            setRefRoomId(previous => previous || roomsResult.rooms[0]?.id || '');
        }
    }, []);

    // Carregamento diferido (padrão das páginas do painel): o estado inicial é
    // sempre o vazio, o que mantém a marcação do servidor e do cliente igual.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const loadPreview = useCallback(async (roomId: string, mode: BillingMode, block: BlockHours) => {
        if (!roomId) {
            setPreview({ loading: false, price: null, error: null });
            return;
        }
        setPreview({ loading: true, price: null, error: null });
        const result = await resolveRoomRate(roomId, mode, block);
        if (result.error && result.data == null) {
            setPreview({ loading: false, price: null, error: result.error });
            return;
        }
        setPreview({ loading: false, price: result.data ?? 0, error: null });
    }, []);

    // Preço efectivo (hr_room_rate): recalcula quando o quarto de referência
    // ou o modo/bloco do formulário mudam.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadPreview(refRoomId, form.billing_mode, queryBlock);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refRoomId, form.billing_mode, queryBlock, loadPreview]);

    const patchForm = (patch: Partial<RateForm>) => {
        setForm(previous => ({ ...previous, ...patch }));
        setFormError(null);
    };

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setFormError(null);
    };

    const startEdit = (rate: RoomRate) => {
        setEditingId(rate.id);
        setForm({
            scope: rate.room_id ? 'ROOM' : rate.room_type ? 'TYPE' : 'PROPERTY',
            room_id: rate.room_id ?? '',
            room_type: rate.room_type ?? '',
            billing_mode: rate.billing_mode,
            block_hours: rate.block_hours,
            price: String(rate.price ?? ''),
            extra_hour_price: rate.extra_hour_price == null ? '' : String(rate.extra_hour_price),
            label: rate.label ?? '',
            is_default: rate.is_default,
            is_active: rate.is_active,
            valid_from: rate.valid_from ?? '',
            valid_to: rate.valid_to ?? '',
        });
        setFormError(null);
        setNotice(null);
        if (rate.room_id) setRefRoomId(rate.room_id);
    };

    /** Validações do formulário: preço ≥ 0, bloco obrigatório e duplicados. */
    const validate = (): string | null => {
        if (!form.price.trim() || !Number.isFinite(parseAmount(form.price))) {
            return 'Indique um preço válido (número igual ou superior a 0).';
        }
        if (parseAmount(form.price) < 0) return 'O preço não pode ser negativo.';
        if (form.billing_mode === 'PER_HOUR' && ![1, 2, 3].includes(form.block_hours)) {
            return 'A tarifa por hora exige um bloco: escolha 1h, 2h ou 3h.';
        }
        if (form.extra_hour_price.trim()) {
            const extra = parseAmount(form.extra_hour_price);
            if (!Number.isFinite(extra) || extra < 0) {
                return 'A hora extra tem de ser um valor igual ou superior a 0.';
            }
        }
        if (form.scope === 'ROOM' && !form.room_id) return 'Escolha o quarto a que a tarifa se aplica.';
        if (form.scope === 'TYPE' && !form.room_type.trim()) return 'Indique o tipo de quarto.';
        if (form.valid_from && form.valid_to && form.valid_to < form.valid_from) {
            return 'A data final tem de ser igual ou posterior à data inicial.';
        }
        const block = form.billing_mode === 'PER_DAY' ? 0 : form.block_hours;
        const duplicate = rates.find(rate =>
            rate.id !== editingId &&
            rate.billing_mode === form.billing_mode &&
            rate.block_hours === block &&
            scopeMatches(rate, form)
        );
        if (duplicate) {
            return `Já existe uma tarifa para este âmbito, modo de cobrança e bloco («${duplicate.label}»). Edite a existente em vez de criar outra.`;
        }
        return null;
    };

    const submit = async () => {
        const problem = validate();
        if (problem) {
            setFormError(problem);
            return;
        }
        if (!user?.tenantId) {
            setFormError('Sessão sem instância activa. Volte a entrar para gravar tarifas.');
            return;
        }

        const block = form.billing_mode === 'PER_DAY' ? 0 : form.block_hours;
        const payload: RoomRateWrite = {
            room_id: form.scope === 'ROOM' ? form.room_id : null,
            room_type: form.scope === 'TYPE' ? form.room_type.trim() : null,
            label: form.label.trim() || 'Tarifa',
            billing_mode: form.billing_mode,
            block_hours: isBlockHours(block) ? block : 0,
            price: parseAmount(form.price),
            extra_hour_price: form.extra_hour_price.trim() ? parseAmount(form.extra_hour_price) : null,
            is_default: form.is_default,
            is_active: form.is_active,
            valid_from: form.valid_from || null,
            valid_to: form.valid_to || null,
        };

        setSaving(true);
        setFormError(null);
        setNotice(null);
        const result = editingId
            ? await updateRoomRate(editingId, payload)
            : await createRoomRate(payload, user.tenantId);
        setSaving(false);

        if (result.error) {
            setFormError(result.error);
            return;
        }
        setNotice(editingId ? 'Tarifa actualizada com sucesso.' : 'Tarifa criada e já activa na resolução de preços.');
        resetForm();
        await refresh();
    };

    const removeRate = async (id: string) => {
        setError(null);
        setNotice(null);
        const result = await deleteRoomRate(id);
        if (result.error) {
            setPendingDeleteId(null);
            setError(result.error);
            return;
        }
        setPendingDeleteId(null);
        setNotice('Tarifa removida.');
        if (editingId === id) resetForm();
        await refresh();
    };

    const modeLabel = (mode: BillingMode) => (mode === 'PER_HOUR' ? 'Por hora' : 'Diária');
    const blockLabel = (rate: { billing_mode: BillingMode; block_hours: number }) =>
        rate.billing_mode === 'PER_DAY' ? '—' : `${rate.block_hours}h`;

    if (missing) {
        return (
            <div className="space-y-6">
                <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center space-y-4">
                    <Tag className="w-10 h-10 text-white/15 mx-auto" />
                    <p className="text-sm text-white/60 leading-relaxed max-w-xl mx-auto">
                        {MIGRATION_011_HINT} Até lá, as tarifas por hora e as sessões horárias continuam
                        inacessíveis e o restante painel funciona com normalidade.
                    </p>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider hover:text-white"
                    >
                        <RefreshCw className="w-4 h-4" /> Tentar novamente
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
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
                    <button onClick={() => setNotice(null)} className="ml-auto text-emerald-300" aria-label="Fechar">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : null}

            <p className="text-sm text-white/45 leading-relaxed max-w-3xl">
                As tarifas são resolvidas por ordem de especificidade — quarto → tipo de quarto → propriedade —
                e alimentam tanto as diárias como as sessões horárias do quadro de quartos.
            </p>

            {/* ── Preço efectivo (hr_room_rate) ──────────────────────────── */}
            <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <Tag className="w-5 h-5 text-[var(--brand-primary)]" />
                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Preço efectivo</h3>
                </div>
                <p className="text-xs text-white/45 leading-relaxed max-w-3xl">
                    Escolha um quarto de referência para ver o valor que o sistema cobra de facto,
                    depois de a resolução aplicar o âmbito e a validade das tarifas.
                </p>
                <div className="flex flex-wrap items-end gap-4">
                    <label className="block space-y-2 min-w-[240px]">
                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                            Quarto de referência
                        </span>
                        <select
                            value={refRoomId}
                            onChange={event => setRefRoomId(event.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                        >
                            <option value="">Selecionar quarto…</option>
                            {rooms.map(room => (
                                <option key={room.id} value={room.id}>
                                    {room.room_number || room.id.slice(0, 6)}
                                    {room.room_type ? ` — ${room.room_type}` : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                            Consulta
                        </span>
                        <span className="text-sm text-white/70">
                            {modeLabel(form.billing_mode)}
                            {form.billing_mode === 'PER_HOUR' && [1, 2, 3].includes(form.block_hours)
                                ? ` • ${form.block_hours}h`
                                : ''}
                        </span>
                    </div>
                </div>

                {!refRoomId ? (
                    <p className="text-xs text-white/40">Seleccione um quarto para calcular o preço.</p>
                ) : form.billing_mode === 'PER_HOUR' && ![1, 2, 3].includes(form.block_hours) ? (
                    <p className="text-xs text-white/40">Escolha o bloco horário no formulário para ver o preço.</p>
                ) : preview.loading ? (
                    <p className="text-xs text-white/45">A calcular…</p>
                ) : preview.error ? (
                    <p className="text-xs text-rose-300">{preview.error}</p>
                ) : preview.price != null ? (
                    <div className="flex flex-wrap items-baseline gap-4">
                        <span className="text-4xl font-black text-white tracking-tight">
                            {formatAmount(preview.price)}
                        </span>
                        <span className="text-xs text-white/40">
                            valor resolvido por <span className="font-mono text-white/60">hr_room_rate</span>
                        </span>
                    </div>
                ) : null}
            </div>

            {/* ── Formulário ─────────────────────────────────────────────── */}
            {canWrite ? (
                <div className="glass-panel rounded-[28px] border border-white/5 p-6 md:p-8 space-y-5">
                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                        {editingId ? 'Editar tarifa' : 'Nova tarifa'}
                    </h3>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                            Âmbito de aplicação
                        </span>
                        <div className="flex flex-wrap gap-3">
                            {SCOPE_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => patchForm({ scope: option.value, room_id: '', room_type: '' })}
                                    className={`px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors ${
                                        form.scope === option.value
                                            ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {form.scope === 'ROOM' ? (
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Quarto</span>
                            <select
                                value={form.room_id}
                                onChange={event => patchForm({ room_id: event.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            >
                                <option value="">Selecionar quarto…</option>
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>
                                        {room.room_number || room.id.slice(0, 6)}
                                        {room.room_type ? ` — ${room.room_type}` : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}

                    {form.scope === 'TYPE' ? (
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tipo de quarto</span>
                            <input
                                list="room-rate-types"
                                value={form.room_type}
                                onChange={event => patchForm({ room_type: event.target.value })}
                                placeholder="Standard, Suite, Deluxe…"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            />
                            <datalist id="room-rate-types">
                                {rooms
                                    .map(room => room.room_type)
                                    .filter((type, index, all): type is string => Boolean(type) && all.indexOf(type) === index)
                                    .map(type => (
                                        <option key={type} value={type} />
                                    ))}
                            </datalist>
                        </label>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                Modo de cobrança
                            </span>
                            <div className="flex gap-3">
                                {MODE_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() =>
                                            patchForm({
                                                billing_mode: option.value,
                                                block_hours: option.value === 'PER_DAY' ? 0 : form.block_hours,
                                            })
                                        }
                                        className={`flex-1 px-4 py-3 rounded-xl border text-left transition-colors ${
                                            form.billing_mode === option.value
                                                ? 'bg-[var(--brand-primary)]/10 border-[var(--brand-primary)] text-white'
                                                : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                                        }`}
                                    >
                                        <span className="block text-xs font-black uppercase tracking-wider">{option.label}</span>
                                        <span className="block text-[10px] text-white/40 mt-0.5">{option.hint}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {form.billing_mode === 'PER_HOUR' ? (
                            <div className="space-y-2">
                                <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                    Bloco horário
                                </span>
                                <div className="flex gap-3">
                                    {([1, 2, 3] as const).map(hours => (
                                        <button
                                            key={hours}
                                            type="button"
                                            onClick={() => patchForm({ block_hours: hours })}
                                            className={`flex-1 px-4 py-3 rounded-xl border text-center transition-colors ${
                                                form.block_hours === hours
                                                    ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                                            }`}
                                        >
                                            <span className="block text-lg font-black">{hours}h</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                Preço (Kz) {form.billing_mode === 'PER_HOUR' ? 'do bloco' : 'por noite'}
                            </span>
                            <input
                                value={form.price}
                                onChange={event => patchForm({ price: event.target.value })}
                                inputMode="decimal"
                                placeholder="25000"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                Hora extra (Kz) — opcional
                            </span>
                            <input
                                value={form.extra_hour_price}
                                onChange={event => patchForm({ extra_hour_price: event.target.value })}
                                inputMode="decimal"
                                placeholder="Vazio = preço do bloco ÷ horas"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Designação</span>
                            <input
                                value={form.label}
                                onChange={event => patchForm({ label: event.target.value })}
                                placeholder="Tarifa padrão, Alta temporada…"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Válida de</span>
                            <input
                                type="date"
                                value={form.valid_from}
                                onChange={event => patchForm({ valid_from: event.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Válida até</span>
                            <input
                                type="date"
                                value={form.valid_to}
                                onChange={event => patchForm({ valid_to: event.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap gap-5">
                        <label className="flex items-center gap-2 text-sm text-white/70">
                            <input
                                type="checkbox"
                                checked={form.is_default}
                                onChange={event => patchForm({ is_default: event.target.checked })}
                                className="w-4 h-4"
                            />
                            Padrão do âmbito
                        </label>
                        <label className="flex items-center gap-2 text-sm text-white/70">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={event => patchForm({ is_active: event.target.checked })}
                                className="w-4 h-4"
                            />
                            Activa
                        </label>
                    </div>

                    {formError ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                            <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                            <p className="text-sm text-rose-200">{formError}</p>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => void submit()}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                        >
                            <Plus className="w-4 h-4" />
                            {saving ? 'A guardar…' : editingId ? 'Guardar alterações' : 'Criar tarifa'}
                        </button>
                        {editingId ? (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider"
                            >
                                Cancelar
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="glass-panel rounded-[28px] border border-white/5 p-8 text-sm text-white/50">
                    Este perfil é de leitura. A gestão de tarifas exige escrita no módulo de Alojamento.
                </div>
            )}

            {/* ── Lista ──────────────────────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Tarifas registadas</h3>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                {loading ? (
                    <p className="text-sm text-white/40">A carregar…</p>
                ) : rates.length === 0 ? (
                    <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                        <p className="text-sm text-white/50">
                            Ainda não existem tarifas registadas. Sem uma tarifa própria, o sistema usa o preço
                            diário do quarto como referência.
                        </p>
                    </div>
                ) : (
                    <div className="glass-panel rounded-[28px] border border-white/5 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead>
                                    <tr className="border-b border-white/10 text-left">
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Âmbito</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Designação</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Cobrança</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Bloco</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Preço</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Hora extra</th>
                                        <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Estado</th>
                                        {canWrite ? (
                                            <th className="px-5 py-3.5 text-[10px] font-black text-white/40 uppercase tracking-[0.3em] text-right">Acções</th>
                                        ) : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rates.map(rate => (
                                        <tr key={rate.id} className="border-b border-white/5 last:border-0">
                                            <td className="px-5 py-4">
                                                <span className="flex items-center gap-2 font-bold text-white">
                                                    <Tag className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
                                                    {scopeOf(rate)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-white/60">{rate.label}</td>
                                            <td className="px-5 py-4 text-white/60">{modeLabel(rate.billing_mode)}</td>
                                            <td className="px-5 py-4 font-mono text-white/60">{blockLabel(rate)}</td>
                                            <td className="px-5 py-4 font-mono text-white">{formatAmount(rate.price)}</td>
                                            <td className="px-5 py-4 font-mono text-white/60">
                                                {rate.extra_hour_price == null ? '—' : formatAmount(rate.extra_hour_price)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {!rate.is_active ? (
                                                        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase text-white/40">
                                                            Inactiva
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[10px] font-black uppercase text-emerald-300">
                                                            Activa
                                                        </span>
                                                    )}
                                                    {rate.is_default ? (
                                                        <span className="px-2.5 py-1 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/40 text-[10px] font-black uppercase text-[var(--brand-primary)]">
                                                            Padrão
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            {canWrite ? (
                                                <td className="px-5 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(rate)}
                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                                                        >
                                                            <Pencil className="w-3 h-3" /> Editar
                                                        </button>
                                                        {pendingDeleteId === rate.id ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void removeRate(rate.id)}
                                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[10px] font-black uppercase tracking-wider"
                                                                >
                                                                    <Check className="w-3 h-3" /> Confirmar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPendingDeleteId(null)}
                                                                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-wider"
                                                                >
                                                                    Não
                                                                </button>
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={!canDelete}
                                                                title={canDelete ? 'Remover tarifa' : 'A remoção de tarifas é restrita a administradores.'}
                                                                onClick={() => setPendingDeleteId(rate.id)}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                                                            >
                                                                <Trash2 className="w-3 h-3" /> Remover
                                                            </button>
                                                        )}
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
    );
}
