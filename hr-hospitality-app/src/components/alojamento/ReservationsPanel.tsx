'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    Ban,
    Calendar,
    CheckCircle2,
    Home,
    Loader2,
    LogIn,
    Plus,
    RefreshCw,
    RotateCcw,
    User,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { localQuery } from '@/lib/db/localDB';
import { emitRoomEvent, useRoomSync } from '@/lib/roomEvents';
import { supabase } from '@/lib/supabase';
import { NovaReservaModal } from './NovaReservaModal';

interface ReservationRow {
    id: string;
    guest_name: string;
    room_id: string | null;
    room_number: string | null;
    client_number: string | null;
    service_type: string;
    status: string;
    check_in_date: string | null;
    check_out_date: string | null;
    reservation_date: string | null;
    total_amount: number | string | null;
    notes: string | null;
    created_at: string;
}

type Filter = 'ACTIVAS' | 'TODAS' | 'CANCELADAS';

const ACTIVE_STATUSES = ['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN'];

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
    PENDENTE_PAGAMENTO: {
        label: 'Pendente de pagamento',
        className: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
    },
    CONFIRMADA: {
        label: 'Confirmada',
        className: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10',
    },
    CHECKED_IN: {
        label: 'Check-in activo',
        className: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    },
    CHECKED_OUT: {
        label: 'Check-out efectuado',
        className: 'text-white/50 border-white/15 bg-white/5',
    },
    CANCELADA: {
        label: 'Cancelada',
        className: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
    },
};

function statusStyle(status: string) {
    return STATUS_STYLE[status] ?? { label: status, className: 'text-white/50 border-white/15 bg-white/5' };
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
}

/** Extrai origem e sinal das notas da reserva manual (formato `chave=valor | …`). */
function parseNotasReserva(notes: string | null): { origem: string | null; sinal: string | null } {
    if (!notes) return { origem: null, sinal: null };
    const origem = /origem=([^|\n]+)/.exec(notes)?.[1]?.trim() ?? null;
    const sinal = /sinal=([^|\n]+)/.exec(notes)?.[1]?.trim() ?? null;
    return { origem, sinal };
}

interface ReservationsPanelProps {
    /** Título alternativo (usado quando o painel é a página principal). */
    title?: string;
}

/**
 * Ecrã de reservas: lista consolidada, cancelamento ("Desmarcar") e reativação.
 * Qualquer acção emite um evento de estado — o Mapa de Quartos e o Dashboard
 * reagem no mesmo instante, sem recarregar a página.
 */
export function ReservationsPanel({ title = 'Reservas & Marcações' }: ReservationsPanelProps) {
    const { hasPermission } = useAuth();
    const canWrite = hasPermission('reception');

    const [rows, setRows] = useState<ReservationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('ACTIVAS');
    const [showNova, setShowNova] = useState(false);

    const load = useCallback(async () => {
        try {
            const result = await supabase
                .from('hotel_reservations')
                .select(
                    'id, guest_name, room_id, room_number, client_number, service_type, status, check_in_date, check_out_date, reservation_date, total_amount, notes, created_at'
                )
                .order('created_at', { ascending: false })
                .limit(300);

            if (result.error || !result.data) {
                setError(result.error?.message || 'Não foi possível carregar as reservas.');
            } else {
                setError(null);
                setRows(result.data as ReservationRow[]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha de ligação ao servidor local.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Reactividade instantânea (evento local + foco + polling de segurança).
    useRoomSync(load, { intervalMs: 20000 });

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const cancelar = async (reservation: ReservationRow) => {
        setBusyId(reservation.id);
        setError(null);
        try {
            await localQuery('hotel_reservations.cancel', { id: reservation.id });
            setNotice(`Reserva de ${reservation.guest_name} cancelada${reservation.room_number ? ` — quarto ${reservation.room_number} libertado` : ''}.`);
            emitRoomEvent({
                type: 'reservation',
                reservationId: reservation.id,
                ...(reservation.room_id ? { roomId: reservation.room_id } : {}),
                ...(reservation.room_number ? { roomNumber: reservation.room_number } : {}),
            });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível cancelar a reserva.');
        } finally {
            setBusyId(null);
        }
    };

    const reativar = async (reservation: ReservationRow) => {
        setBusyId(reservation.id);
        setError(null);
        try {
            await localQuery('hotel_reservations.restore', { id: reservation.id });
            setNotice(`Reserva de ${reservation.guest_name} reativada como CONFIRMADA.`);
            emitRoomEvent({
                type: 'reservation',
                reservationId: reservation.id,
                ...(reservation.room_id ? { roomId: reservation.room_id } : {}),
                ...(reservation.room_number ? { roomNumber: reservation.room_number } : {}),
            });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível reativar a reserva.');
        } finally {
            setBusyId(null);
        }
    };

    /** Converter reserva agendada (telefone/balcão/portal) em estadia activa. */
    const converterEmCheckIn = async (reservation: ReservationRow) => {
        setBusyId(reservation.id);
        setError(null);
        try {
            await localQuery('hotel_reservations.checkIn', { id: reservation.id });
            setNotice(`Check-in activo: ${reservation.guest_name} no quarto ${reservation.room_number}.`);
            // O mapa, os KPIs e o Dashboard reagem no mesmo instante.
            emitRoomEvent({
                type: 'check-in',
                reservationId: reservation.id,
                ...(reservation.room_id ? { roomId: reservation.room_id } : {}),
                ...(reservation.room_number ? { roomNumber: reservation.room_number } : {}),
            });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível converter a reserva em check-in.');
        } finally {
            setBusyId(null);
        }
    };

    const visible = rows.filter(row => {
        if (filter === 'ACTIVAS') return ACTIVE_STATUSES.includes(row.status);
        if (filter === 'CANCELADAS') return row.status === 'CANCELADA';
        return true;
    });

    const counts = {
        activas: rows.filter(row => ACTIVE_STATUSES.includes(row.status)).length,
        canceladas: rows.filter(row => row.status === 'CANCELADA').length,
        total: rows.length,
    };

    const filterTabs: { key: Filter; label: string; count: number }[] = [
        { key: 'ACTIVAS', label: 'Activas', count: counts.activas },
        { key: 'TODAS', label: 'Todas', count: counts.total },
        { key: 'CANCELADAS', label: 'Canceladas', count: counts.canceladas },
    ];

    const preComputedClasses = {
        panel: 'glass-panel rounded-[32px] md:rounded-[40px] border border-white/10 overflow-hidden',
        header: 'p-6 md:p-8 border-b border-white/10 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-5',
        title: 'text-xl md:text-2xl font-black text-white uppercase tracking-tight',
        subtitle: 'text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-1.5',
        tabBase: 'px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
        tabActive: 'bg-[var(--brand-primary)] text-black border-[var(--brand-primary)]',
        tabIdle: 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:border-white/25',
        cancel: 'px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-400/40 text-rose-300 bg-rose-400/5 hover:bg-rose-400 hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center',
        restore: 'px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-400/40 text-emerald-300 bg-emerald-400/5 hover:bg-emerald-400 hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center',
        checkin: 'px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-cyan-400/40 text-cyan-300 bg-cyan-400/5 hover:bg-cyan-400 hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center',
        nova: 'px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#00F2FF] text-black shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:scale-[1.02] transition-all flex items-center gap-2',
    };

    return (
        <section className={preComputedClasses.panel}>
            <div className={preComputedClasses.header}>
                <div>
                    <h3 className={preComputedClasses.title}>{title}</h3>
                    <p className={preComputedClasses.subtitle}>
                        {counts.total} registo(s) • {counts.activas} activa(s) • cancelamento liberta o quarto
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {canWrite && (
                        <button
                            type="button"
                            onClick={() => setShowNova(true)}
                            className={preComputedClasses.nova}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Nova Reserva
                        </button>
                    )}
                    {filterTabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setFilter(tab.key)}
                            className={`${preComputedClasses.tabBase} ${filter === tab.key ? preComputedClasses.tabActive : preComputedClasses.tabIdle}`}
                        >
                            {tab.label} ({tab.count})
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => { setLoading(true); void load(); }}
                        className={`${preComputedClasses.tabBase} ${preComputedClasses.tabIdle} flex items-center gap-2`}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>
            </div>

            {(error || !canWrite) && (
                <div className="px-6 md:px-8 py-3 border-b border-white/5 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-100/80 leading-relaxed">
                        {error ?? 'O seu perfil não tem permissão de escrita no módulo de Recepção — as acções estão desactivadas.'}
                    </p>
                </div>
            )}

            {notice && (
                <div className="px-6 md:px-8 py-3 border-b border-emerald-400/10 bg-emerald-400/5 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                    <p className="text-xs text-emerald-100/80">{notice}</p>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="w-9 h-9 text-cyan-400 animate-spin" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">A carregar reservas…</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                    <Calendar className="w-10 h-10 text-white/10" />
                    <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Sem reservas nesta secção</p>
                    <p className="text-[11px] text-white/25 max-w-md">
                        Toda a reserva referencia um cliente KYC — crie por telefone ou balcão com «+ Nova Reserva», ou nasce do portal.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/[0.01]">
                                <th className="px-6 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">Hóspede</th>
                                <th className="px-4 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">Quarto</th>
                                <th className="px-4 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">Serviço</th>
                                <th className="px-4 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">Datas</th>
                                <th className="px-4 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">Estado</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right whitespace-nowrap">Acções</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            <AnimatePresence initial={false}>
                                {visible.map(row => {
                                    const style = statusStyle(row.status);
                                    const canCancel = canWrite && ACTIVE_STATUSES.includes(row.status);
                                    const canRestore = canWrite && row.status === 'CANCELADA';
                                    const canCheckIn = canWrite && ['PENDENTE_PAGAMENTO', 'CONFIRMADA'].includes(row.status);
                                    const notas = parseNotasReserva(row.notes);
                                    const busy = busyId === row.id;

                                    return (
                                        <motion.tr
                                            key={row.id}
                                            layout
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            className="hover:bg-white/[0.03] transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                                        <User className="w-4 h-4 text-white/40" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-white uppercase tracking-wider truncate max-w-[220px]">
                                                            {row.guest_name}
                                                        </p>
                                                        {row.client_number && (
                                                            <p className="text-[9px] font-mono text-cyan-300/70 tracking-widest">{row.client_number}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-black text-white/70">
                                                    <Home className="w-3.5 h-3.5 text-white/25" />
                                                    {row.room_number || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] font-black text-white/45 uppercase tracking-widest">{row.service_type}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] text-white/45 tabular-nums">
                                                    {formatDate(row.check_in_date || row.reservation_date)} → {formatDate(row.check_out_date)}
                                                </span>
                                                {(notas.origem || notas.sinal) && (
                                                    <p className="mt-1 text-[9px] font-bold text-white/30">
                                                        {notas.origem ?? '—'}
                                                        {notas.sinal ? ` · sinal ${Number(notas.sinal).toFixed(2)} Kz` : ''}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${style.className}`}>
                                                    {style.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    {canCheckIn && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void converterEmCheckIn(row)}
                                                            className={preComputedClasses.checkin}
                                                            title="Converter a reserva agendada em estadia activa (check-in)"
                                                        >
                                                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                                                            Check-in
                                                        </button>
                                                    )}
                                                    {canCancel && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void cancelar(row)}
                                                            className={preComputedClasses.cancel}
                                                        >
                                                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                                                            Cancelar
                                                        </button>
                                                    )}
                                                    {canRestore && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void reativar(row)}
                                                            className={preComputedClasses.restore}
                                                        >
                                                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                                            Reativar
                                                        </button>
                                                    )}
                                                    {!canCancel && !canRestore && !canCheckIn && (
                                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">—</span>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Reserva manual — atendimento por telefone / balcão. */}
            <NovaReservaModal
                open={showNova}
                onClose={() => setShowNova(false)}
                onCreated={() => {
                    setNotice('Reserva manual criada com estado CONFIRMADA — visível no mapa de quartos e no Dashboard.');
                    setLoading(true);
                    void load();
                }}
            />
        </section>
    );
}
