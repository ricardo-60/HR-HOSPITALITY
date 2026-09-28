'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
    Check,
    Clock,
    Home,
    Loader2,
    Plus,
    RefreshCw,
    Timer,
    TriangleAlert,
    Wallet,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
    canWriteAlojamento,
    closeHourlyBilling,
    extendHourlyBilling,
    formatAmount,
    formatCountdown,
    hoursUsed,
    listActiveHourlyBilling,
    pickRoomRate,
    previewCloseAmount,
    rateScopeLabel,
    secondsUntil,
    startHourlyBilling,
    type ExtendHourlyResult,
    type HourlyBillingSession,
    type PickedRate,
    type StartHourlyResult,
} from '@/lib/roomRates';
import { supabase } from '@/lib/supabase';

/* ── Mapa de cores obrigatório do quadro de quartos ───────────────────────── */
/* Verde (`green`) = disponível, vermelho (`red`) = ocupado, amarelo (`yellow`)
   = reservado, azul (`blue`) = limpeza, cinzento (`gray`) = manutenção. O par
   foreground/background é sempre legível sobre o fundo escuro do painel. */

interface StateStyle {
    label: string;
    card: string;
    badge: string;
    dot: string;
}

const STATE_STYLES: Record<string, StateStyle> = {
    DISPONIVEL: {
        label: 'Disponível',
        card: 'border-green-400/40 bg-green-500/10 hover:border-green-400/70',
        badge: 'bg-green-500/15 text-green-300 border-green-400/40',
        dot: 'bg-green-400 shadow-[0_0_10px_#4ADE80]',
    },
    OCUPADO: {
        label: 'Ocupado',
        card: 'border-red-400/40 bg-red-500/10 hover:border-red-400/70',
        badge: 'bg-red-500/15 text-red-300 border-red-400/40',
        dot: 'bg-red-400 shadow-[0_0_10px_#F87171]',
    },
    RESERVADO: {
        label: 'Reservado',
        card: 'border-yellow-400/40 bg-yellow-400/10 hover:border-yellow-400/70',
        badge: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/40',
        dot: 'bg-yellow-400 shadow-[0_0_10px_#FACC15]',
    },
    LIMPEZA: {
        label: 'Limpeza',
        card: 'border-blue-400/40 bg-blue-500/10 hover:border-blue-400/70',
        badge: 'bg-blue-500/15 text-blue-300 border-blue-400/40',
        dot: 'bg-blue-400 shadow-[0_0_10px_#60A5FA]',
    },
    MANUTENCAO: {
        label: 'Manutenção',
        card: 'border-gray-400/40 bg-gray-500/10 hover:border-gray-400/70',
        badge: 'bg-gray-500/15 text-gray-300 border-gray-400/40',
        dot: 'bg-gray-400 shadow-[0_0_10px_#9CA3AF]',
    },
};

const LEGEND_ORDER = ['DISPONIVEL', 'OCUPADO', 'RESERVADO', 'LIMPEZA', 'MANUTENCAO'];

const UNKNOWN_STYLE: StateStyle = {
    label: '—',
    card: 'border-white/15 bg-white/5 hover:border-white/30',
    badge: 'bg-white/10 text-white/60 border-white/20',
    dot: 'bg-white/40',
};

function stateStyle(status: string): StateStyle {
    return STATE_STYLES[status] ?? { ...UNKNOWN_STYLE, label: status || '—' };
}

/* ── Tipos locais ─────────────────────────────────────────────────────────── */

interface RoomRow {
    id: string;
    room_number: string | null;
    room_type: string | null;
    status: string;
    price_per_night: number | null;
}

interface ReservationRow {
    id: string;
    room_number: string | null;
    room_id: string | null;
    status: string;
    reservation_date: string | null;
    check_in_date: string | null;
}

type BlockChoice = 1 | 2 | 3;

interface RoomAction {
    kind: 'start' | 'extend' | 'close';
    room: RoomRow;
    session?: HourlyBillingSession;
}

interface PickState {
    loading: boolean;
    rate: PickedRate | null;
    error: string | null;
    resolved: boolean;
}

interface Notice {
    kind: 'ok' | 'error';
    text: string;
}

const PERMISSION_HINT = 'O seu perfil não tem permissão de escrita no módulo de Alojamento.';

function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function formatClock(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeOf(epochMs: number): string {
    return new Date(epochMs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Estado apresentado no quadro. O estado vindo da base de dados mandando:
 * `OCUPADO` ganha sempre; `RESERVADO` vindo da BD também é respeitado. Sem
 * migração 011 o enum não conhece `RESERVADO`, por isso a reserva do dia é
 * derivada de `hotel_reservations` (CONFIRMADA = reservado sem check-in,
 * CHECKED_IN = ocupado).
 */
function effectiveState(
    room: RoomRow,
    today: Map<string, ReservationRow>
): string {
    if (room.status === 'OCUPADO') return 'OCUPADO';
    if (room.status === 'RESERVADO') return 'RESERVADO';

    const reservation =
        (room.id ? today.get(`id:${room.id}`) : undefined) ??
        (room.room_number ? today.get(`num:${room.room_number}`) : undefined);

    if (room.status === 'DISPONIVEL') {
        if (reservation) return reservation.status === 'CHECKED_IN' ? 'OCUPADO' : 'RESERVADO';
        return 'DISPONIVEL';
    }
    // LIMPEZA / MANUTENCAO (ou valor futuro do enum) mantêm-se: a reserva
    // confirmada não apaga uma pendência de governança.
    return room.status;
}

/* ── Componente ───────────────────────────────────────────────────────────── */

interface RoomBoardProps {
    onSelectRoom: (roomId: string, status: string) => void;
}

export function RoomBoard({ onSelectRoom }: RoomBoardProps) {
    const { user, hasPermission } = useAuth();
    const canWrite = hasPermission('reception') && canWriteAlojamento(user);

    const [rooms, setRooms] = useState<RoomRow[]>([]);
    const [reservations, setReservations] = useState<ReservationRow[]>([]);
    const [sessions, setSessions] = useState<HourlyBillingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [hourlyError, setHourlyError] = useState<string | null>(null);
    const [hourlyUnavailable, setHourlyUnavailable] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    // Relógio local: a contagem decrescente nunca volta a tocar na base de dados.
    const [now, setNow] = useState(() => Date.now());
    const hasActiveSession = sessions.length > 0;

    useEffect(() => {
        if (!hasActiveSession) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [hasActiveSession]);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 7000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const refresh = useCallback(async () => {
        const [roomsRes, reservationsRes, hourlyRes] = await Promise.all([
            supabase
                .from('hotel_rooms')
                .select('id, room_number, room_type, status, price_per_night')
                .order('room_number', { ascending: true }),
            supabase
                .from('hotel_reservations')
                .select('id, room_number, room_id, status, reservation_date, check_in_date')
                .in('status', ['CONFIRMADA', 'CHECKED_IN'])
                .limit(500),
            listActiveHourlyBilling(),
        ]);

        if (roomsRes.error || !roomsRes.data) {
            setRoomsError(roomsRes.error?.message || 'Não foi possível carregar os quartos.');
            setRooms([]);
        } else {
            setRoomsError(null);
            setRooms(roomsRes.data as RoomRow[]);
        }

        if (reservationsRes.error || !reservationsRes.data) {
            setReservations([]);
        } else {
            setReservations(reservationsRes.data as ReservationRow[]);
        }

        setHourlyUnavailable(hourlyRes.missing);
        if (hourlyRes.error) {
            setHourlyError(hourlyRes.error);
            setSessions([]);
        } else {
            setHourlyError(null);
            setSessions(hourlyRes.data ?? []);
        }
        setNow(Date.now());
        setLoading(false);
    }, []);

    // Carregamento diferido (mesmo padrão das outras páginas): o estado inicial
    // é sempre a lista vazia, o que mantém a marcação do servidor e do cliente
    // idêntica antes de a primeira consulta resolver.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const todayReservations = useMemo(() => {
        const today = localToday();
        const map = new Map<string, ReservationRow>();
        for (const reservation of reservations) {
            const matchesToday =
                reservation.reservation_date === today || reservation.check_in_date === today;
            if (!matchesToday) continue;
            if (reservation.room_id) map.set(`id:${reservation.room_id}`, reservation);
            if (reservation.room_number) map.set(`num:${reservation.room_number}`, reservation);
        }
        return map;
    }, [reservations]);

    const sessionsByRoom = useMemo(() => {
        const map = new Map<string, HourlyBillingSession>();
        for (const session of sessions) {
            if (session.room_id) map.set(session.room_id, session);
        }
        return map;
    }, [sessions]);

    /* ── Acções horárias ─────────────────────────────────────────────────── */

    const [action, setAction] = useState<RoomAction | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [block, setBlock] = useState<BlockChoice | null>(null);
    const [pick, setPick] = useState<PickState | null>(null);
    const [extraHours, setExtraHours] = useState<BlockChoice>(1);
    const [paidAmount, setPaidAmount] = useState('');

    const closeAction = () => {
        if (busy) return;
        setAction(null);
        setActionError(null);
        setBlock(null);
        setPick(null);
    };

    const openAction = (next: RoomAction) => {
        setAction(next);
        setActionError(null);
        setBlock(null);
        setPick(null);
        setExtraHours(1);
        if (next.kind === 'close' && next.session) {
            // `now` é o relógio do quadro (actualizado de segundo em segundo);
            // usar Date.now() aqui violaria a pureza de render do React.
            setPaidAmount(String(previewCloseAmount(next.session, now)));
        } else {
            setPaidAmount('');
        }
    };

    const selectBlock = async (hours: BlockChoice) => {
        if (!action) return;
        setBlock(hours);
        setActionError(null);
        setPick({ loading: true, rate: null, error: null, resolved: false });
        const result = await pickRoomRate(action.room.id, hours);
        if (result.error) {
            setPick({ loading: false, rate: null, error: result.error, resolved: false });
            return;
        }
        setPick({ loading: false, rate: result.data ?? null, error: null, resolved: true });
    };

    /** Actualização imediata do estado local com o que a BD acabou de devolver. */
    const optimisticStart = (room: RoomRow, data: StartHourlyResult) => {
        const session: HourlyBillingSession = {
            id: data.hourly_billing_id,
            room_id: room.id,
            room_number: data.room_number || room.room_number,
            reservation_id: null,
            block_hours: data.block_hours,
            rate: data.rate,
            extra_hour_rate: data.extra_hour_rate,
            started_at: data.started_at,
            ends_at: data.ends_at,
            extensions: 0,
            status: 'EM_CURSO',
        };
        setSessions(previous => [...previous.filter(item => item.id !== session.id), session]);
        setRooms(previous =>
            previous.map(item => (item.id === room.id ? { ...item, status: 'OCUPADO' } : item))
        );
        setNow(Date.now());
    };

    const optimisticExtend = (sessionId: string, data: ExtendHourlyResult) => {
        setSessions(previous =>
            previous.map(session =>
                session.id === sessionId
                    ? { ...session, ends_at: data.ends_at, extensions: data.extensions }
                    : session
            )
        );
        setNow(Date.now());
    };

    /** O fecho coloca o quarto em limpeza, tal como `hr_close_hourly_billing`. */
    const optimisticClose = (room: RoomRow, sessionId: string) => {
        setSessions(previous => previous.filter(session => session.id !== sessionId));
        setRooms(previous =>
            previous.map(item => (item.id === room.id ? { ...item, status: 'LIMPEZA' } : item))
        );
    };

    const confirmStart = async () => {
        if (!action || !block) return;
        setBusy(true);
        setActionError(null);
        const room = action.room;
        const result = await startHourlyBilling(room.id, block);
        setBusy(false);
        if (result.error || !result.data) {
            setActionError(result.error ?? 'Não foi possível abrir a sessão horária.');
            return;
        }
        optimisticStart(room, result.data);
        setNotice({
            kind: 'ok',
            text: `Sessão horária aberta no quarto ${result.data.room_number || room.room_number || ''} — ${result.data.block_hours}h até ${formatClock(result.data.ends_at)}.`,
        });
        closeAction();
        void refresh();
    };

    const confirmExtend = async () => {
        if (!action?.session) return;
        const session = action.session;
        setBusy(true);
        setActionError(null);
        const result = await extendHourlyBilling(session.id, extraHours);
        setBusy(false);
        if (result.error || !result.data) {
            setActionError(result.error ?? 'Não foi possível estender a sessão horária.');
            return;
        }
        optimisticExtend(session.id, result.data);
        setNotice({
            kind: 'ok',
            text: `Sessão estendida ${result.data.extra_hours}h no quarto ${result.data.room_number} — acréscimo de ${formatAmount(result.data.extra_amount)}. Nova hora de fim: ${formatClock(result.data.ends_at)}.`,
        });
        closeAction();
        void refresh();
    };

    const confirmClose = async () => {
        if (!action?.session) return;
        const room = action.room;
        const session = action.session;
        const trimmed = paidAmount.trim();
        let amount: number | null = null;
        if (trimmed) {
            const parsed = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
            if (!Number.isFinite(parsed) || parsed < 0) {
                setActionError('Indique um valor liquidado válido (igual ou superior a 0).');
                return;
            }
            amount = parsed;
        }
        setBusy(true);
        setActionError(null);
        const result = await closeHourlyBilling(session.id, amount, null);
        setBusy(false);
        if (result.error || !result.data) {
            setActionError(result.error ?? 'Não foi possível fechar a sessão horária.');
            return;
        }
        optimisticClose(room, session.id);
        setNotice({
            kind: 'ok',
            text: `Sessão liquidada no quarto ${result.data.room_number} — ${result.data.hours_used}h utilizadas, ${formatAmount(result.data.amount_paid)} recebidos.`,
        });
        closeAction();
        void refresh();
    };

    /* ── Desenhos auxiliares ─────────────────────────────────────────────── */

    const startReason = (state: string): string | null => {
        if (!canWrite) return PERMISSION_HINT;
        if (state === 'OCUPADO') return 'O quarto já está ocupado — não é possível abrir uma nova sessão horária.';
        if (state === 'LIMPEZA') return 'O quarto está em limpeza.';
        if (state === 'MANUTENCAO') return 'O quarto está em manutenção.';
        if (state !== 'DISPONIVEL' && state !== 'RESERVADO') {
            return `Estado "${state}" não permite abrir sessão horária.`;
        }
        if (hourlyUnavailable) return 'Sessões horárias indisponíveis: a migração 011 ainda não foi aplicada.';
        return null;
    };

    const closeSession = action?.session;
    const closeUsed = closeSession ? hoursUsed(closeSession.started_at, now) : 0;
    const closeSuggested = closeSession ? previewCloseAmount(closeSession, now) : 0;

    return (
        <div className="glass-panel rounded-[40px] border border-white/10 p-6 md:p-10 space-y-8">
            {/* Cabeçalho + legenda */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-1.5 h-6 bg-emerald-500 shadow-[0_0_15px_#10B981]" />
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase">
                            Mapa de <span className="text-emerald-400">Quartos</span>
                        </h3>
                    </div>
                    <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.4em]">
                        Quadro operacional em tempo real • {rooms.length} quartos • {sessions.length} sessão(ões) horária(s)
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 md:gap-6">
                    {LEGEND_ORDER.map(status => {
                        const style = stateStyle(status);
                        return (
                            <div key={status} className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                                <span className="text-[9px] font-black text-white/45 uppercase tracking-widest">
                                    {style.label}
                                </span>
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/25 transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Indisponibilidade da migração 011 — degradação explicativa */}
            {hourlyUnavailable ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                    <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-100/80 leading-relaxed">
                        As sessões horárias estão indisponíveis: a migração 011 ainda não foi aplicada a esta base de dados.
                        O quadro de quartos, o check-in e o check-out continuam operacionais.
                    </p>
                </div>
            ) : hourlyError ? (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-200 leading-relaxed">{hourlyError}</p>
                </div>
            ) : null}

            {roomsError ? (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-200 leading-relaxed">{roomsError}</p>
                </div>
            ) : null}

            {/* Quadro */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
                        A carregar o quadro de quartos…
                    </p>
                </div>
            ) : rooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Home className="w-12 h-12 text-white/10" />
                    <p className="text-xs font-black text-white/30 uppercase tracking-[0.4em]">Sem quartos carregados</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                    {rooms.map(room => {
                        const state = effectiveState(room, todayReservations);
                        const style = stateStyle(state);
                        const session = sessionsByRoom.get(room.id) ?? null;
                        const seconds = session ? secondsUntil(session.ends_at, now) : 0;
                        const countdownText = seconds <= 0 ? 'expirado' : formatCountdown(seconds);
                        const countdownClass = seconds <= 0
                            ? 'text-red-300'
                            : seconds < 600
                                ? 'text-amber-300'
                                : 'text-green-300';
                        const blockedStart = startReason(state);

                        return (
                            <motion.div
                                key={room.id}
                                whileHover={{ y: -4 }}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectRoom(room.id, state)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelectRoom(room.id, state);
                                    }
                                }}
                                className={`relative rounded-[26px] border p-5 flex flex-col gap-3 cursor-pointer transition-colors ${style.card}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black text-white/35 uppercase tracking-[0.3em] truncate">
                                            {room.room_type || 'Quarto'}
                                        </p>
                                        <p className="text-3xl font-black text-white tracking-tighter leading-none mt-1">
                                            {room.room_number || room.id.slice(0, 6)}
                                        </p>
                                    </div>
                                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${style.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                        {style.label}
                                    </span>
                                </div>

                                {session ? (
                                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-0.5">
                                        <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.25em]">
                                            Sessão horária • {session.block_hours}h{session.extensions > 0 ? ` +${session.extensions}` : ''}
                                        </p>
                                        <p className={`font-mono text-2xl font-black tabular-nums leading-none ${countdownClass}`}>
                                            {countdownText}
                                        </p>
                                        <p className="text-[9px] text-white/40">
                                            {formatAmount(session.rate)}
                                            {session.extra_hour_rate != null
                                                ? ` • extra ${formatAmount(session.extra_hour_rate)}/h`
                                                : ''}
                                        </p>
                                    </div>
                                ) : null}

                                {!hourlyUnavailable ? (
                                    <div className="mt-auto flex flex-wrap gap-2">
                                        {session ? (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={!canWrite}
                                                    title={canWrite ? 'Estender a sessão horária' : PERMISSION_HINT}
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        openAction({ kind: 'extend', room, session });
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white/70 text-[10px] font-black uppercase tracking-wider hover:text-white hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" /> Estender
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canWrite}
                                                    title={canWrite ? 'Fechar e liquidar a sessão' : PERMISSION_HINT}
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        openAction({ kind: 'close', room, session });
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-200 text-[10px] font-black uppercase tracking-wider hover:bg-amber-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <Wallet className="w-3 h-3" /> Fechar
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={Boolean(blockedStart)}
                                                title={blockedStart ?? 'Abrir sessão horária (1h, 2h ou 3h)'}
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    openAction({ kind: 'start', room });
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/40 text-cyan-200 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Timer className="w-3 h-3" /> Abrir por hora
                                            </button>
                                        )}
                                    </div>
                                ) : null}

                                {!hourlyUnavailable && (!canWrite || (blockedStart && !session)) ? (
                                    <p className="text-[9px] leading-snug text-white/30">
                                        {blockedStart ?? PERMISSION_HINT}
                                    </p>
                                ) : null}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Aviso flutuante de resultado das acções */}
            <AnimatePresence>
                {notice ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[270] px-5 py-4 rounded-2xl border shadow-[0_0_30px_rgba(0,0,0,0.6)] flex items-start gap-3 max-w-[92vw] ${
                            notice.kind === 'ok'
                                ? 'bg-[#06120C] border-emerald-400/40'
                                : 'bg-[#140608] border-rose-400/40'
                        }`}
                    >
                        {notice.kind === 'ok'
                            ? <Check className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                            : <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />}
                        <p className="text-[11px] font-bold text-white/85 leading-relaxed">{notice.text}</p>
                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            className="text-white/40 hover:text-white"
                            aria-label="Fechar aviso"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* Modal da acção */}
            <AnimatePresence>
                {action ? (
                    <div className="fixed inset-0 z-[250] flex justify-center items-center px-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeAction}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 16 }}
                            className="relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto glass-panel rounded-[28px] border border-white/10 p-6 md:p-8 space-y-5"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[9px] font-black text-cyan-300 uppercase tracking-[0.4em]">
                                        Sessão horária
                                    </p>
                                    <h4 className="text-2xl font-black text-white uppercase tracking-tight mt-1">
                                        {action.room.room_number || action.room.id.slice(0, 6)}
                                        <span className="text-white/30 text-base ml-3 normal-case tracking-normal">
                                            {action.room.room_type || 'Quarto'}
                                        </span>
                                    </h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeAction}
                                    disabled={busy}
                                    className="text-white/40 hover:text-white disabled:opacity-40"
                                    aria-label="Fechar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {actionError ? (
                                <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                                    <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                                    <p className="text-xs text-rose-200 leading-relaxed">{actionError}</p>
                                </div>
                            ) : null}

                            {/* ── Abrir por hora ── */}
                            {action.kind === 'start' ? (
                                <div className="space-y-4">
                                    <p className="text-xs text-white/50 leading-relaxed">
                                        Escolha o bloco horário. O preço é resolvido pelas tarifas da propriedade
                                        (quarto → tipo → propriedade) e mostrado antes de confirmar.
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {([1, 2, 3] as const).map(hours => (
                                            <button
                                                key={hours}
                                                type="button"
                                                onClick={() => void selectBlock(hours)}
                                                disabled={busy || Boolean(pick?.loading)}
                                                className={`px-4 py-4 rounded-xl border text-center transition-all ${
                                                    block === hours
                                                        ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                                                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
                                                }`}
                                            >
                                                <span className="block text-2xl font-black">{hours}h</span>
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                                                    Bloco
                                                </span>
                                            </button>
                                        ))}
                                    </div>

                                    {pick?.loading ? (
                                        <p className="flex items-center gap-2 text-xs text-white/50">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> A resolver a tarifa…
                                        </p>
                                    ) : pick?.error ? (
                                        <p className="text-xs text-rose-300">{pick.error}</p>
                                    ) : pick?.resolved ? (
                                        pick.rate ? (
                                            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 space-y-1">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-300">
                                                    Preço resolvido
                                                </p>
                                                <p className="text-3xl font-black text-white tracking-tight">
                                                    {formatAmount(pick.rate.price)}
                                                </p>
                                                <p className="text-[11px] text-white/50">
                                                    {pick.rate.label} • âmbito: {rateScopeLabel(pick.rate.scope)}
                                                    {pick.rate.extra != null
                                                        ? ` • hora extra ${formatAmount(pick.rate.extra)}`
                                                        : ' • hora extra calculada sobre o bloco'}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 space-y-1">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300">
                                                    Sem tarifa horária registada
                                                </p>
                                                <p className="text-xs text-white/60 leading-relaxed">
                                                    Não existe tarifa por hora para este quarto. Na abertura, a base de dados
                                                    usa o preço diário como referência
                                                    {action.room.price_per_night
                                                        ? ` (${formatAmount(action.room.price_per_night)})`
                                                        : ''}.
                                                    Crie uma tarifa em Parâmetros → Tarifas.
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        <p className="text-[11px] text-white/35">
                                            Seleccione 1h, 2h ou 3h para ver o preço antes de confirmar.
                                        </p>
                                    )}
                                </div>
                            ) : null}

                            {/* ── Estender ── */}
                            {action.kind === 'extend' && action.session ? (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                                            Fim actual
                                        </span>
                                        <span className="font-mono text-sm text-white/80">
                                            {formatClock(action.session.ends_at)} ({formatCountdown(secondsUntil(action.session.ends_at, now))})
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {([1, 2, 3] as const).map(hours => (
                                            <button
                                                key={hours}
                                                type="button"
                                                onClick={() => setExtraHours(hours)}
                                                className={`px-4 py-4 rounded-xl border text-center transition-all ${
                                                    extraHours === hours
                                                        ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                                                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
                                                }`}
                                            >
                                                <span className="block text-2xl font-black">+{hours}h</span>
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                                                    Extensão
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 space-y-1">
                                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-200">
                                            Acréscimo estimado
                                        </p>
                                        <p className="text-3xl font-black text-white tracking-tight">
                                            {action.session.extra_hour_rate != null
                                                ? formatAmount(action.session.extra_hour_rate * extraHours)
                                                : '—'}
                                        </p>
                                        <p className="text-[11px] text-white/50">
                                            {action.session.extra_hour_rate != null
                                                ? `${extraHours} × ${formatAmount(action.session.extra_hour_rate)} • novo fim ${formatTimeOf(Date.parse(action.session.ends_at) + extraHours * 3_600_000)}`
                                                : 'Hora extra não definida para esta sessão: o valor final é calculado pela base de dados.'}
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            {/* ── Fechar / liquidar ── */}
                            {action.kind === 'close' && action.session ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
                                                Horas utilizadas
                                            </p>
                                            <p className="text-2xl font-black text-white mt-1">
                                                {closeUsed}h
                                                <span className="text-xs font-bold text-white/40 ml-2">
                                                    de {action.session.block_hours}h +{action.session.extensions}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
                                                Valor a liquidar
                                            </p>
                                            <p className="text-2xl font-black text-white mt-1">
                                                {formatAmount(closeSuggested)}
                                            </p>
                                        </div>
                                    </div>
                                    <label className="block space-y-2">
                                        <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                            Valor pago (Kz)
                                        </span>
                                        <input
                                            value={paidAmount}
                                            onChange={event => setPaidAmount(event.target.value)}
                                            inputMode="decimal"
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                        />
                                        <span className="block text-[10px] text-white/35">
                                            Preenchido com o valor sugerido. Deixe vazio para a base de dados calcular.
                                        </span>
                                    </label>
                                    <div className="flex items-center gap-2 text-[11px] text-white/45">
                                        <Clock className="w-3.5 h-3.5 shrink-0" />
                                        Início {formatClock(action.session.started_at)} • duração máxima prevista{' '}
                                        {action.session.block_hours + action.session.extensions}h
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (action.kind === 'start') void confirmStart();
                                        else if (action.kind === 'extend') void confirmExtend();
                                        else void confirmClose();
                                    }}
                                    disabled={
                                        busy ||
                                        (action.kind === 'start' && !block) ||
                                        (action.kind === 'start' && Boolean(pick?.loading))
                                    }
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-300 text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {action.kind === 'start' ? 'Confirmar abertura' : action.kind === 'extend' ? 'Confirmar extensão' : 'Confirmar fecho'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeAction}
                                    disabled={busy}
                                    className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
