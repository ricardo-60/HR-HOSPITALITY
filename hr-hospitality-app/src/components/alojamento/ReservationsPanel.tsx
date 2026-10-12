'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    Ban,
    Calendar,
    Camera,
    CheckCircle2,
    CloudDownload,
    Eye,
    FileText,
    Home,
    Loader2,
    LogIn,
    Plus,
    Receipt,
    RefreshCw,
    RotateCcw,
    User,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { MEDIA_LABELS, signedMediaUrl, type MediaKind } from '@/lib/adminData';
import { pullCloudReservations } from '@/lib/cloudInboundSync';
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
    /** Registo universal (migração 017) — chega pela Landing Page. */
    guest_phone: string | null;
    document_type: string | null;
    document_number: string | null;
    document_path: string | null;
    receipt_path: string | null;
    face_path: string | null;
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

const MEDIA_ICON: Record<MediaKind, typeof Camera> = {
    face: Camera,
    document: FileText,
    receipt: Receipt,
};

interface MediaState {
    url: string | null;
    loading: boolean;
    error: string | null;
}

const MEDIA_IDLE: MediaState = { url: null, loading: false, error: null };

/** Estado inicial calculado das props — evita setState síncrono no efeito. */
function buildMediaState(reservation: ReservationRow): Record<MediaKind, MediaState> {
    const loading: MediaState = { url: null, loading: true, error: null };
    return {
        face: reservation.face_path ? loading : MEDIA_IDLE,
        document: reservation.document_path ? loading : MEDIA_IDLE,
        receipt: reservation.receipt_path ? loading : MEDIA_IDLE,
    };
}

/**
 * Ficha de uma reserva: o rosto do hóspede em destaque, documento de
 * identidade e comprovativo de pagamento à mão.
 *
 * As URL são assinadas e de 10 minutos, por isso são pedidas à abertura e
 * nunca guardadas — um link de KYC que fica no estado da app deixa de ser
 * um link.
 */
function ReservationFicha({
    reservation,
    onClose,
    onCheckIn,
    canWrite,
    busy,
}: {
    reservation: ReservationRow;
    onClose: () => void;
    onCheckIn: (row: ReservationRow) => void;
    canWrite: boolean;
    busy: boolean;
}) {
    // A ficha é remontada por reserva (`key={selected.id}`), por isso o
    // estado inicial pode vir directamente das props.
    const [media, setMedia] = useState<Record<MediaKind, MediaState>>(() => buildMediaState(reservation));
    const [confirming, setConfirming] = useState(false);

    const paths: Record<MediaKind, string | null> = {
        face: reservation.face_path,
        document: reservation.document_path,
        receipt: reservation.receipt_path,
    };

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            // Cada `await` deixa o efeito retornar primeiro: nenhum setState
            // corre de forma síncrona dentro do efeito.
            for (const kind of ['face', 'document', 'receipt'] as MediaKind[]) {
                const path = paths[kind];
                if (!path) continue;
                const result = await signedMediaUrl(kind, path);
                if (cancelled) return;
                setMedia(prev => ({
                    ...prev,
                    [kind]: { url: result.data, loading: false, error: result.error },
                }));
            }
        })();

        return () => {
            cancelled = true;
        };
        // `paths` é reconstruído a cada render; as dependências são os valores.
    }, [reservation.id, reservation.face_path, reservation.document_path, reservation.receipt_path]);

    const missing = (['face', 'document', 'receipt'] as MediaKind[]).filter(kind => !paths[kind]);
    const style = statusStyle(reservation.status);
    const notas = parseNotasReserva(reservation.notes);

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="glass-panel border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
                onClick={event => event.stopPropagation()}
            >
                <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Ficha de registo</p>
                        <h4 className="text-lg font-black text-white uppercase tracking-tight truncate">{reservation.guest_name}</h4>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${style.className}`}>
                                {style.label}
                            </span>
                            <span className="text-[10px] font-black text-white/45 uppercase tracking-widest">
                                {reservation.room_number ? `Quarto ${reservation.room_number}` : reservation.service_type}
                            </span>
                            <span className="text-[10px] text-white/40 tabular-nums">
                                {formatDate(reservation.check_in_date || reservation.reservation_date)} → {formatDate(reservation.check_out_date)}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 w-9 h-9 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center transition-colors"
                        aria-label="Fechar ficha"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-[168px_1fr] gap-6">
                    {/* Rosto — o que a receção precisa de ver primeiro. */}
                    <div>
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-2">
                            {MEDIA_LABELS.face}
                        </p>
                        <div className="aspect-square rounded-2xl overflow-hidden border border-cyan-400/25 bg-white/5 flex items-center justify-center">
                            {media.face.loading ? (
                                <Loader2 className="w-6 h-6 text-cyan-300 animate-spin" />
                            ) : media.face.url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- URL assinada de 10 min: o `<Image>` do Next exige domínio configurado
                                <img src={media.face.url} alt={`Rosto de ${reservation.guest_name}`} className="w-full h-full object-cover" />
                            ) : (
                                <Camera className="w-8 h-8 text-white/15" />
                            )}
                        </div>
                        {media.face.error && (
                            <p className="mt-2 text-[9px] text-amber-300/80 leading-snug">{media.face.error}</p>
                        )}
                        {!paths.face && !media.face.error && (
                            <p className="mt-2 text-[9px] text-white/30 leading-snug">Sem fotografia registada.</p>
                        )}
                    </div>

                    {/* Dados cadastrais e documentos. */}
                    <div className="space-y-4">
                        <dl className="grid grid-cols-2 gap-3">
                            <div>
                                <dt className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Contacto</dt>
                                <dd className="text-xs font-bold text-white/70 mt-1">{reservation.guest_phone || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Documento</dt>
                                <dd className="text-xs font-bold text-white/70 mt-1">
                                    {reservation.document_type && reservation.document_number
                                        ? `${reservation.document_type} · ${reservation.document_number}`
                                        : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Valor</dt>
                                <dd className="text-xs font-bold text-white/70 mt-1">
                                    {Number(reservation.total_amount ?? 0).toFixed(2)} Kz
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Origem</dt>
                                <dd className="text-xs font-bold text-white/70 mt-1">{notas.origem ?? '—'}</dd>
                            </div>
                        </dl>

                        {/* Documento e comprovativo — validação final antes do check-in. */}
                        <div className="space-y-2">
                            {(['document', 'receipt'] as MediaKind[]).map(kind => {
                                const Icon = MEDIA_ICON[kind];
                                const state = media[kind];
                                return (
                                    <div key={kind} className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3">
                                        <Icon className="w-4 h-4 text-white/35 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest truncate">
                                                {MEDIA_LABELS[kind]}
                                            </p>
                                            <p className="text-[9px] text-white/30 truncate">
                                                {!paths[kind]
                                                    ? 'Em falta no registo'
                                                    : state.error ?? (state.loading ? 'A abrir…' : 'Pré-visualização pronta')}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!paths[kind] || state.loading || Boolean(state.error)}
                                            onClick={() => { if (state.url) window.open(state.url, '_blank', 'noopener,noreferrer'); }}
                                            className="shrink-0 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        >
                                            <Eye className="w-3 h-3" />
                                            Ver
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {missing.length > 0 && (
                            <p className="text-[10px] text-amber-300/85 leading-relaxed border border-amber-400/20 bg-amber-400/5 rounded-xl px-4 py-3">
                                Registo incompleto — falta {missing.map(kind => MEDIA_LABELS[kind].toLowerCase()).join(', ')}.
                                Confirme a identificação presencialmente antes do check-in.
                            </p>
                        )}
                    </div>
                </div>

                {/* Check-in só depois de o rececionista ter visto a ficha. */}
                {canWrite && ['PENDENTE_PAGAMENTO', 'CONFIRMADA'].includes(reservation.status) && (
                    <div className="p-6 border-t border-white/10 flex flex-wrap items-center justify-end gap-3">
                        {!confirming ? (
                            <button
                                type="button"
                                onClick={() => setConfirming(true)}
                                className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-cyan-400/40 text-cyan-300 bg-cyan-400/5 hover:bg-cyan-400 hover:text-black transition-all flex items-center gap-2"
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                Confirmar pagamento e check-in
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setConfirming(false)}
                                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/15 text-white/60 hover:border-white/30 transition-all"
                                >
                                    Voltar
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => { setConfirming(false); onCheckIn(reservation); }}
                                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-400 text-black hover:bg-emerald-300 transition-all flex items-center gap-2 disabled:opacity-40"
                                >
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {missing.length > 0 ? 'Check-in com registo incompleto' : 'Sim, efectuar check-in'}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
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
    const [syncing, setSyncing] = useState(false);
    const [selected, setSelected] = useState<ReservationRow | null>(null);
    /** Miniaturas do rosto, indexadas por `face_path` (URL assinada de 10 min). */
    const [faceUrls, setFaceUrls] = useState<Record<string, string>>({});

    /**
     * Pede as URLs assinadas das fotos de rosto num ÚNICO pedido em lote.
     * Uma por linha dispararia centenas de chamadas só para desenhar a lista.
     */
    const loadFaceThumbs = useCallback(async (list: ReservationRow[]) => {
        const paths = list
            .map(row => row.face_path)
            .filter((path): path is string => Boolean(path))
            .slice(0, 60);

        if (paths.length === 0) {
            setFaceUrls({});
            return;
        }

        try {
            const { data, error } = await supabase.storage.from('client-faces').createSignedUrls(paths, 600);
            if (error || !data) {
                // Sem a policy `client_faces_read` (migração 017) isto falha:
                // a lista continua a funcionar, só sem as miniaturas.
                setFaceUrls({});
                return;
            }
            const map: Record<string, string> = {};
            data.forEach((entry: { error?: string | null; signedUrl?: string } | null, index: number) => {
                const path = paths[index];
                if (entry && !entry.error && entry.signedUrl && path) map[path] = entry.signedUrl;
            });
            setFaceUrls(map);
        } catch {
            setFaceUrls({});
        }
    }, []);

    const load = useCallback(async () => {
        try {
            const result = await supabase
                .from('hotel_reservations')
                .select(
                    'id, guest_name, room_id, room_number, client_number, service_type, status, check_in_date, check_out_date, reservation_date, total_amount, notes, created_at, ' +
                    'guest_phone, document_type, document_number, document_path, receipt_path, face_path'
                )
                .order('created_at', { ascending: false })
                .limit(300);

            if (result.error || !result.data) {
                setError(result.error?.message || 'Não foi possível carregar as reservas.');
            } else {
                setError(null);
                const list = result.data as ReservationRow[];
                setRows(list);
                void loadFaceThumbs(list);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha de ligação ao servidor local.');
        } finally {
            setLoading(false);
        }
    }, [loadFaceThumbs]);

    useEffect(() => {
        void load();
    }, [load]);

    // Reactividade instantânea (evento local + foco + polling de segurança).
    useRoomSync(load, { intervalMs: 20000 });

    /**
     * "Sincronizar Nuvem / Puxar Reservas da Web".
     * Força uma leitura imediata de `hotel_reservations` no Supabase (sessão
     * autenticada) e injeta os registos novos no SQLite local — é o caminho
     * cloud → local que recebe as reservas feitas na Landing Page (Vercel).
     */
    const sincronizarNuvem = async () => {
        if (syncing) return;
        setSyncing(true);
        setError(null);
        try {
            const summary = await pullCloudReservations('manual');
            if (summary.error) {
                setError(`Sincronização com a nuvem falhou: ${summary.error}`);
            } else if (summary.inserted + summary.updated > 0) {
                setNotice(
                    `Nuvem sincronizada: ${summary.inserted} reserva(s) nova(s) e ` +
                    `${summary.updated} atualizada(s) puxada(s) da Landing Page.`
                );
            } else {
                setNotice(`Nuvem consultada: nada de novo (${summary.fetched} registo(s) na nuvem).`);
            }
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível sincronizar com a nuvem.');
        } finally {
            setSyncing(false);
        }
    };

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
        syncCloud: 'px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-violet-400/50 text-violet-200 bg-violet-400/10 hover:bg-violet-400 hover:text-black transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed',
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
                    <button
                        type="button"
                        onClick={() => { void sincronizarNuvem(); }}
                        disabled={syncing}
                        title="Puxar as reservas feitas na Landing Page (Supabase) para este Servidor Local"
                        className={preComputedClasses.syncCloud}
                    >
                        <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
                        {syncing ? 'A Sincronizar…' : 'Sincronizar Nuvem'}
                    </button>
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
                                                    {/* O rosto é o que a receção usa para reconhecer o hóspede. */}
                                                    {row.face_path && faceUrls[row.face_path] ? (
                                                        // eslint-disable-next-line @next/next/no-img-element -- URL assinada de 10 min: o <Image> exige domínio configurado
                                                        <img
                                                            src={faceUrls[row.face_path]}
                                                            alt={`Rosto de ${row.guest_name}`}
                                                            title="Fotografia do rosto registada"
                                                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-cyan-400/40"
                                                        />
                                                    ) : (
                                                        <div
                                                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                                                                row.face_path
                                                                    ? 'bg-cyan-400/10 border border-cyan-400/30'
                                                                    : 'bg-white/5'
                                                            }`}
                                                            title={row.face_path ? 'Rosto registado — abra a ficha' : 'Sem fotografia de rosto'}
                                                        >
                                                            {row.face_path
                                                                ? <Camera className="w-4 h-4 text-cyan-300/70" />
                                                                : <User className="w-4 h-4 text-white/40" />}
                                                        </div>
                                                    )}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelected(row)}
                                                        title="Ver o rosto do hóspede, o documento de identidade e o comprovativo"
                                                        className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/15 text-white/60 bg-white/5 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        Ficha
                                                    </button>
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
                                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest hidden md:inline">sem acções</span>
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

            {/* Ficha de registo — rosto, documento e comprovativo. */}
            {selected && (
                <ReservationFicha
                    reservation={selected}
                    canWrite={canWrite}
                    busy={busyId === selected.id}
                    onClose={() => setSelected(null)}
                    onCheckIn={(row) => {
                        setSelected(null);
                        void converterEmCheckIn(row);
                    }}
                />
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
