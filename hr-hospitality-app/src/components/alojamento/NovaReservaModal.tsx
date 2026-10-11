'use client';

/**
 * Reserva manual — atendimento por telefone / balcão / WhatsApp / portal.
 *
 * · Cliente KYC: autocomplete (nome, telefone ou nº HR-2026-XXXXX) com
 *   atalho de cadastro rápido inline para clientes novos;
 * · Quarto: selector com disponibilidade real na data pretendida (cruzada
 *   com as reservas activas — PENDENTE_PAGAMENTO / CONFIRMADA / CHECKED_IN);
 * · Datas previstas: entrada e saída com hora (14:00 / 12:00 por omissão);
 * · Sinal / Garantia: valor adiantado registado nas notas e saldo pendente
 *   calculado (total estimado = noites × tarifa do quarto, editável);
 * · Origem: Telefone, Balcão, WhatsApp ou Portal.
 *
 * A reserva nasce CONFIRMADA (estado "reservado" do registo fechado de
 * estados) e pode ser convertida em check-in activo com um clique no painel
 * de reservas no dia da chegada.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Ban, BedDouble, Calendar, Loader2, Phone, Plus, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { money } from '@/lib/fatura';
import { localOperation, localQuery } from '@/lib/db/localDB';
import { emitRoomEvent } from '@/lib/roomEvents';
import { ClientSearch } from './ClientSearch';
import type { ClientSearchResult } from './ClientSearch';

interface QuartoRow {
    id: string;
    room_number: string;
    room_type: string | null;
    status: string;
    price_per_night: number | string | null;
}

interface ReservaActiva {
    room_id: string;
    check_in_date: string | null;
    check_out_date: string | null;
}

interface NovaReservaModalProps {
    open: boolean;
    onClose: () => void;
    /** Chamado depois de a reserva ser criada (o painel recarrega a lista). */
    onCreated: () => void;
}

const ORIGENS = ['Telefone', 'Balcão', 'WhatsApp', 'Portal'] as const;
type Origem = (typeof ORIGENS)[number];

const DOC_TYPES = ['BI', 'PASSAPORTE', 'NIF', 'CARTAO_CIDADAO'] as const;

/** [in, out) sobrepostos — as datas ISO comparam-se lexicograficamente. */
function sobrepoe(aIn: string, aOut: string, bIn: string | null, bOut: string | null): boolean {
    if (!bIn || !bOut) return false;
    return aIn < bOut && aOut > bIn;
}

function noites(entrada: string, saida: string): number {
    const diff = (Date.parse(saida) - Date.parse(entrada)) / 86_400_000;
    return Number.isFinite(diff) && diff > 0 ? Math.ceil(diff) : 1;
}

export function NovaReservaModal({ open, onClose, onCreated }: NovaReservaModalProps) {
    /* ── Cliente KYC ── */
    const [clientQuery, setClientQuery] = useState('');
    const [client, setClient] = useState<ClientSearchResult | null>(null);

    /* ── Cadastro rápido inline ── */
    const [quickOpen, setQuickOpen] = useState(false);
    const [quickNome, setQuickNome] = useState('');
    const [quickDocTipo, setQuickDocTipo] = useState<(typeof DOC_TYPES)[number]>('BI');
    const [quickDoc, setQuickDoc] = useState('');
    const [quickTelefone, setQuickTelefone] = useState('');
    const [quickBusy, setQuickBusy] = useState(false);

    /* ── Quartos e disponibilidade ── */
    const [rooms, setRooms] = useState<QuartoRow[]>([]);
    const [taken, setTaken] = useState<ReservaActiva[]>([]);
    const [roomId, setRoomId] = useState<string | null>(null);

    /* ── Datas previstas ── */
    const hojeIso = new Date().toISOString().split('T')[0];
    const amanhaIso = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    const [checkInDate, setCheckInDate] = useState(hojeIso);
    const [checkInTime, setCheckInTime] = useState('14:00');
    const [checkOutDate, setCheckOutDate] = useState(amanhaIso);
    const [checkOutTime, setCheckOutTime] = useState('12:00');

    /* ── Financeiro e origem ── */
    const [total, setTotal] = useState('');
    const [totalTouched, setTotalTouched] = useState(false);
    const [sinal, setSinal] = useState('');
    const [origem, setOrigem] = useState<Origem>('Telefone');
    const [contacto, setContacto] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* Reset do formulário sempre que o modal abre. */
    useEffect(() => {
        if (!open) return;
        const hoje = new Date().toISOString().split('T')[0];
        const amanha = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
        setClientQuery('');
        setClient(null);
        setQuickOpen(false);
        setQuickNome('');
        setQuickDocTipo('BI');
        setQuickDoc('');
        setQuickTelefone('');
        setRoomId(null);
        setCheckInDate(hoje);
        setCheckInTime('14:00');
        setCheckOutDate(amanha);
        setCheckOutTime('12:00');
        setTotal('');
        setTotalTouched(false);
        setSinal('');
        setOrigem('Telefone');
        setContacto('');
        setError(null);
    }, [open]);

    /* Carrega quartos + reservas activas (disponibilidade na data). */
    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        (async () => {
            try {
                const [quartosRes, reservasRes] = await Promise.all([
                    localQuery('data.select', {
                        resource: 'hotel_rooms',
                        columns: ['id', 'room_number', 'room_type', 'status', 'price_per_night'],
                        orderBy: [{ column: 'room_number', ascending: true }],
                    }),
                    localQuery('data.select', {
                        resource: 'hotel_reservations',
                        columns: ['room_id', 'check_in_date', 'check_out_date'],
                        filters: [{ column: 'status', op: 'in', value: ['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN'] }],
                        limit: 500,
                    }),
                ]);
                if (cancelado) return;
                setRooms((quartosRes?.data ?? quartosRes ?? []) as QuartoRow[]);
                setTaken(((reservasRes?.data ?? reservasRes ?? []) as ReservaActiva[]).filter(r => !!r.room_id));
            } catch {
                if (!cancelado) setError('Não foi possível carregar os quartos.');
            }
        })();
        return () => { cancelado = true; };
    }, [open]);

    const quarto = rooms.find(r => r.id === roomId) ?? null;

    const indisponiveis = useMemo(() => {
        const set = new Set<string>();
        for (const r of taken) {
            if (sobrepoe(checkInDate, checkOutDate, r.check_in_date, r.check_out_date)) set.add(r.room_id);
        }
        return set;
    }, [taken, checkInDate, checkOutDate]);

    const totalCalculado = quarto
        ? noites(checkInDate, checkOutDate) * Number(quarto.price_per_night ?? 0)
        : 0;

    /* Preenche o total estimado automaticamente (noites × tarifa) até o
       operador o editar à mão. */
    useEffect(() => {
        if (!totalTouched) setTotal(totalCalculado > 0 ? totalCalculado.toFixed(2) : '');
    }, [totalCalculado, totalTouched]);

    const totalNum = parseFloat(total.replace(',', '.')) || 0;
    const sinalNum = parseFloat(sinal.replace(',', '.')) || 0;
    const pendente = Math.max(0, totalNum - sinalNum);

    const datasValidas = checkInDate && checkOutDate && checkOutDate > checkInDate;

    /* ── Cadastro rápido de cliente novo ── */
    const criarClienteRapido = async () => {
        if (!quickNome.trim() || !quickDoc.trim()) {
            setError('Preencha o nome e o nº de documento do novo cliente.');
            return;
        }
        setQuickBusy(true);
        setError(null);
        try {
            const novo = await localOperation<{ data?: Record<string, unknown> } | Record<string, unknown>>('clients.create', {
                full_name: quickNome.trim(),
                document_type: quickDocTipo,
                document_number: quickDoc.trim(),
                ...(quickTelefone.trim() ? { phone: quickTelefone.trim() } : {}),
            });
            const c = (novo?.data ?? novo) as unknown as ClientSearchResult;
            setClient(c);
            setClientQuery(c.full_name);
            if (c.phone && !contacto) setContacto(c.phone);
            setQuickOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível criar o cliente.');
        } finally {
            setQuickBusy(false);
        }
    };

    /* ── Criar reserva ── */
    const criar = async () => {
        if (!client || !quarto) return;
        if (!datasValidas) {
            setError('A data de saída tem de ser posterior à data de entrada.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const notas = [
                'Reserva manual',
                `origem=${origem}`,
                `entrada=${checkInTime}`,
                `saida=${checkOutTime}`,
                ...(sinalNum > 0 ? [`sinal=${sinalNum.toFixed(2)}`] : []),
                ...(contacto.trim() ? [`telefone=${contacto.trim()}`] : []),
            ].join(' | ');

            await localOperation('hotel_reservations.create', {
                guest_name: client.full_name,
                email: client.email || 'sem-email@lukweku.local',
                service_type: 'quarto',
                room_id: quarto.id,
                room_number: quarto.room_number,
                check_in_date: checkInDate,
                check_out_date: checkOutDate,
                status: 'CONFIRMADA',
                total_amount: totalNum,
                notes: notas,
                client_id: client.id,
                client_number: client.client_number,
            });

            emitRoomEvent({ type: 'reservation', roomId: quarto.id, roomNumber: quarto.room_number });
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível criar a reserva.');
        } finally {
            setBusy(false);
        }
    };

    /* ── Fechamento (Esc + fundo) ── */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    /* ── Classes pré-computadas ── */
    const clsCampo = 'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-white/25 focus:border-[var(--brand-secondary)] focus:outline-none';
    const clsLabel = 'mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/40';
    const clsQuarto = (estado: 'livre' | 'ocupada' | 'manutencao', activo: boolean) =>
        `flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all ${
            estado !== 'livre'
                ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-40'
                : activo
                    ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.06]'
        }`;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[210] flex justify-center items-center px-4 print:hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/90 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ scale: 0.94, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.94, opacity: 0, y: 16 }}
                        className="relative flex w-full max-w-[720px] max-h-[88vh] flex-col overflow-hidden rounded-[28px] border border-t-2 border-white/15 border-t-[#00F2FF] bg-[#0d0d0d] shadow-[0_40px_90px_rgba(0,0,0,0.95)]"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Nova reserva manual"
                    >
                        {/* Cabeçalho */}
                        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-1 bg-[#00F2FF] shadow-[0_0_16px_rgba(0,242,255,0.4)]" />
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-wider text-white">Nova Reserva — {origem}</h3>
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                                        Atendimento por telefone / balcão • estado: confirmada
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Fechar"
                                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Corpo scrollável */}
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                            {/* 1 — Cliente KYC */}
                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">1 · Cliente KYC</span>
                                    <button
                                        type="button"
                                        onClick={() => setQuickOpen(v => !v)}
                                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/60 transition-all hover:border-[var(--brand-accent)]/50 hover:text-white"
                                    >
                                        <Plus className="h-3 w-3" /> Cadastro rápido
                                    </button>
                                </div>
                                <ClientSearch
                                    value={clientQuery}
                                    onChange={setClientQuery}
                                    onSelect={setClient}
                                    placeholder="Nome, telefone ou nº HR-2026-XXXXX…"
                                    label="Cliente"
                                    required
                                />
                                {client && (
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-2.5">
                                        <span className="flex items-center gap-2 text-xs font-black text-emerald-300">
                                            <User className="h-3.5 w-3.5" /> {client.full_name}
                                        </span>
                                        <span className="font-mono text-[10px] tracking-widest text-cyan-300/80">{client.client_number}</span>
                                        <span className="text-[10px] text-white/40">{client.document_type} {client.document_number}</span>
                                        {client.phone && <span className="text-[10px] text-white/40">☎ {client.phone}</span>}
                                    </div>
                                )}
                                {quickOpen && (
                                    <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Cadastro rápido (mínimo KYC)</p>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className={clsLabel}>Nome completo</label>
                                                <input value={quickNome} onChange={e => setQuickNome(e.target.value)} className={clsCampo} placeholder="Ex: Ana Fernandes" />
                                            </div>
                                            <div className="grid grid-cols-[110px_1fr] gap-2">
                                                <div>
                                                    <label className={clsLabel}>Tipo</label>
                                                    <select value={quickDocTipo} onChange={e => setQuickDocTipo(e.target.value as (typeof DOC_TYPES)[number])} className={clsCampo}>
                                                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={clsLabel}>Nº Documento</label>
                                                    <input value={quickDoc} onChange={e => setQuickDoc(e.target.value)} className={clsCampo} placeholder="004812345LA042" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                                            <div>
                                                <label className={clsLabel}>Telefone (opcional)</label>
                                                <input value={quickTelefone} onChange={e => setQuickTelefone(e.target.value)} className={clsCampo} placeholder="9XX XXX XXX" />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void criarClienteRapido()}
                                                disabled={quickBusy}
                                                className="flex items-center gap-2 rounded-xl bg-[var(--brand-accent)] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-black transition-all hover:scale-[1.02] disabled:opacity-40"
                                            >
                                                {quickBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                                Criar cliente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* 2 — Datas previstas */}
                            <section>
                                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">2 · Datas previstas</span>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                        <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40"><Calendar className="h-3 w-3" /> Entrada prevista</p>
                                        <div className="grid grid-cols-[1fr_92px] gap-2">
                                            <input type="date" value={checkInDate} onChange={e => setCheckInDate(e.target.value)} className={clsCampo} aria-label="Data de entrada prevista" />
                                            <input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} className={clsCampo} aria-label="Hora de entrada prevista" />
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                        <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40"><Calendar className="h-3 w-3" /> Saída prevista</p>
                                        <div className="grid grid-cols-[1fr_92px] gap-2">
                                            <input type="date" value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} className={clsCampo} aria-label="Data de saída prevista" />
                                            <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} className={clsCampo} aria-label="Hora de saída prevista" />
                                        </div>
                                    </div>
                                </div>
                                {!datasValidas && (
                                    <p className="mt-2 text-[10px] font-bold text-rose-300">A saída tem de ser posterior à entrada.</p>
                                )}
                            </section>

                            {/* 3 — Quarto */}
                            <section>
                                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">3 · Quarto (disponibilidade nas datas)</span>
                                {rooms.length === 0 ? (
                                    <p className="text-[11px] text-white/30">A carregar quartos…</p>
                                ) : (
                                    <div className="grid max-h-[190px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                                        {rooms.map(r => {
                                            const manutencao = r.status === 'MANUTENCAO';
                                            const ocupada = indisponiveis.has(r.id);
                                            const estado: 'livre' | 'ocupada' | 'manutencao' = manutencao ? 'manutencao' : ocupada ? 'ocupada' : 'livre';
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    disabled={estado !== 'livre'}
                                                    onClick={() => setRoomId(r.id)}
                                                    className={clsQuarto(estado, roomId === r.id)}
                                                >
                                                    <span className="flex items-center gap-2 text-sm font-black">
                                                        <BedDouble className="h-3.5 w-3.5" /> {r.room_number}
                                                    </span>
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                                                        {money(Number(r.price_per_night ?? 0))}/noite
                                                    </span>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${estado === 'livre' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                        {estado === 'livre' ? 'Livre' : estado === 'ocupada' ? 'Ocupado' : 'Manutenção'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* 4 — Sinal / Garantia + origem */}
                            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-3">
                                    <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">4 · Sinal / Garantia</span>
                                    <div>
                                        <label className={clsLabel}>Total estimado (Kz)</label>
                                        <input
                                            value={total}
                                            onChange={e => { setTotal(e.target.value); setTotalTouched(true); }}
                                            inputMode="decimal"
                                            className={clsCampo}
                                            placeholder={totalCalculado > 0 ? totalCalculado.toFixed(2) : '0.00'}
                                        />
                                        {quarto && (
                                            <p className="mt-1 text-[9px] text-white/30">
                                                {noites(checkInDate, checkOutDate)} noite(s) × {money(Number(quarto.price_per_night ?? 0))}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className={clsLabel}>Sinal adiantado (Kz, opcional)</label>
                                        <input value={sinal} onChange={e => setSinal(e.target.value)} inputMode="decimal" className={clsCampo} placeholder="0.00" />
                                    </div>
                                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[10px] font-bold text-white/50">
                                        Pendente no check-in: <span className="text-amber-300">{money(pendente)}</span>
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">5 · Origem da reserva</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {ORIGENS.map(o => (
                                            <button
                                                key={o}
                                                type="button"
                                                onClick={() => setOrigem(o)}
                                                className={`rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    origem === o
                                                        ? 'border-[#00F2FF] bg-[#00F2FF]/15 text-[#00F2FF]'
                                                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25'
                                                }`}
                                            >
                                                {o === 'Telefone' ? <Phone className="mb-1 mx-auto h-3.5 w-3.5" /> : null}
                                                {o}
                                            </button>
                                        ))}
                                    </div>
                                    <div>
                                        <label className={clsLabel}>Contacto telefónico da reserva (opcional)</label>
                                        <input value={contacto} onChange={e => setContacto(e.target.value)} className={clsCampo} placeholder="9XX XXX XXX" />
                                    </div>
                                </div>
                            </section>

                            {error && (
                                <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300">
                                    <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}
                        </div>

                        {/* Rodapé fixo */}
                        <div className="flex shrink-0 gap-3 border-t border-white/10 px-6 py-4">
                            <button
                                onClick={onClose}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-xs font-black uppercase tracking-widest text-white/70 transition-all hover:border-white/30"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => void criar()}
                                disabled={busy || !client || !quarto || !datasValidas}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00F2FF] px-4 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_25px_rgba(0,242,255,0.35)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {busy ? 'A criar…' : 'Criar Reserva'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
