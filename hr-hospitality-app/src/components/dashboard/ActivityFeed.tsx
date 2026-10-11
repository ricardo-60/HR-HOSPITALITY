'use client';

import { motion } from 'framer-motion';
import { Activity, ChevronRight, ListTodo, Loader2, Monitor } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useRoomSync } from '@/lib/roomEvents';
import { supabase } from '@/lib/supabase';

type StreamStatus = 'SUCCESS' | 'ACTIVE' | 'WARNING' | 'CANCELLED' | 'ARCHIVED';

interface ActivityRow {
    id: string;
    action: string;
    location: string;
    time: string;
    status: StreamStatus;
    operator: string;
    sortKey: string;
}

interface ReservationFeedRow {
    id: string;
    guest_name: string;
    room_number: string | null;
    service_type: string;
    status: string;
    client_number: string | null;
    created_at: string;
}

interface OrderFeedRow {
    id: string;
    table_id: string;
    product_name: string;
    quantity: number;
    status: string;
    created_at: string;
}

interface TableFeedRow {
    id: string;
    code: string;
    name: string;
    zone: string;
}

const STATUS_BADGE: Record<StreamStatus, string> = {
    SUCCESS: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    ACTIVE: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
    WARNING: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    CANCELLED: 'text-rose-400 border-rose-400/30 bg-rose-400/10',
    ARCHIVED: 'text-white/45 border-white/15 bg-white/5',
};

/** `2026-10-10 09:42:01` ou ISO → `09:42:01` (nunca inventa horas). */
function timeOf(value: string | null | undefined): string {
    if (!value) return '—';
    const match = /(\d{2}):(\d{2}):(\d{2})/.exec(value);
    return match ? match[0] : '—';
}

function eventRef(prefix: string, id: string): string {
    return `${prefix}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Secção de actividades do Dashboard: reservas do portal/landing page,
 * check-ins/check-out e pedidos POS — dados reais da base local, sem
 * registos de demonstração. Actualiza sem recarregar a página.
 */
export function ActivityFeed() {
    const [rows, setRows] = useState<ActivityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const load = useCallback(async () => {
        try {
            const [reservationsRes, ordersRes, tablesRes] = await Promise.all([
                supabase
                    .from('hotel_reservations')
                    .select('id, guest_name, room_number, service_type, status, client_number, created_at')
                    .order('created_at', { ascending: false })
                    .limit(100),
                supabase
                    .from('pos_table_consumptions')
                    .select('id, table_id, product_name, quantity, status, created_at')
                    .order('created_at', { ascending: false })
                    .limit(100),
                supabase
                    .from('pos_tables')
                    .select('id, code, name, zone'),
            ]);

            if (reservationsRes.error) {
                setError(reservationsRes.error.message);
            } else {
                setError(null);
            }

            const reservations = ((reservationsRes.data ?? []) as ReservationFeedRow[]);
            const orders = ((ordersRes.data ?? []) as OrderFeedRow[]);
            const tables = ((tablesRes.data ?? []) as TableFeedRow[]);
            const tableById = new Map(tables.map(table => [table.id, table]));

            const feed: ActivityRow[] = [];

            for (const reservation of reservations) {
                const room = reservation.room_number ? `QUARTO ${reservation.room_number}` : reservation.service_type.toUpperCase();
                const base = { id: eventRef('RSV', reservation.id), location: room, time: timeOf(reservation.created_at), sortKey: reservation.created_at };

                if (reservation.status === 'CHECKED_IN') {
                    feed.push({ ...base, action: `CHECK-IN — ${reservation.guest_name}`, status: 'SUCCESS', operator: 'Recepção' });
                } else if (reservation.status === 'CHECKED_OUT') {
                    feed.push({ ...base, action: `CHECK-OUT — ${reservation.guest_name}`, status: 'ARCHIVED', operator: 'Recepção' });
                } else if (reservation.status === 'CANCELADA') {
                    feed.push({ ...base, action: `RESERVA CANCELADA — ${reservation.guest_name}`, status: 'CANCELLED', operator: 'Recepção' });
                } else if (reservation.status === 'CONFIRMADA') {
                    feed.push({ ...base, action: `RESERVA CONFIRMADA — ${reservation.guest_name}`, status: 'ACTIVE', operator: 'Portal Web' });
                } else if (reservation.status === 'PENDENTE_PAGAMENTO') {
                    feed.push({ ...base, action: `RESERVA PORTAL — ${reservation.guest_name} (pagamento pendente)`, status: 'WARNING', operator: 'Portal Web' });
                } else {
                    feed.push({ ...base, action: `${reservation.status} — ${reservation.guest_name}`, status: 'ARCHIVED', operator: 'Sistema' });
                }
            }

            for (const order of orders) {
                const table = tableById.get(order.table_id);
                const status: StreamStatus =
                    order.status === 'CANCELADO' ? 'CANCELLED'
                        : order.status === 'PENDENTE' ? 'ACTIVE'
                            : 'SUCCESS';

                feed.push({
                    id: eventRef('POS', order.id),
                    action: `PEDIDO ${order.status === 'ENVIADO' ? 'ENVIADO À COZINHA' : 'REGISTADO'} — ${order.product_name} ×${order.quantity}`,
                    location: table ? `${table.zone} · ${table.name}` : 'POS',
                    time: timeOf(order.created_at),
                    status,
                    operator: table?.code || 'POS',
                    sortKey: order.created_at,
                });
            }

            feed.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
            setRows(feed);
        } catch {
            setError('Sem ligação ao servidor local.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useRoomSync(load, { intervalMs: 20000 });

    const visible = showAll ? rows.slice(0, 60) : rows.slice(0, 8);

    const panelClass = 'glass-panel rounded-[32px] md:rounded-[40px] overflow-hidden shadow-2xl border border-white/10';
    const headerRow = 'p-6 md:p-8 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/[0.02]';
    const headerIconBox = 'w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center';
    const sectionTitle = 'text-xl md:text-2xl font-black text-white uppercase tracking-tight';
    const sectionSubtitle = 'text-xs md:text-sm font-black text-white/30 uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 md:mt-2';
    const toggleClass = `w-full md:w-auto px-6 py-3 md:px-8 md:py-4 border rounded-2xl md:rounded-[20px] text-xs md:text-sm font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-3 lg:gap-4 group shadow-lg ${showAll
        ? 'bg-[var(--brand-primary)] text-black border-[var(--brand-primary)]'
        : 'bg-white/5 border-white/10 text-white/70 hover:bg-[var(--brand-primary)] hover:text-black hover:border-[var(--brand-primary)]'
        }`;
    const thClass = 'px-6 py-4 md:px-6 md:py-6 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.15em] whitespace-nowrap';

    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={panelClass}
        >
            <div className={headerRow}>
                <div className="flex items-center gap-4 md:gap-5">
                    <div className={headerIconBox}>
                        <ListTodo className="w-6 h-6 md:w-7 md:h-7 text-[var(--brand-primary)]" />
                    </div>
                    <div>
                        <h3 className={sectionTitle}>Central de Pedidos & Reservas</h3>
                        <p className={sectionSubtitle}>Portal web · Landing page · Recepção · POS</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAll(current => !current)}
                    aria-expanded={showAll}
                    className={toggleClass}
                >
                    {showAll ? 'Recolher Actividade' : 'Global Logs Access'}
                    <ChevronRight className={`w-4 h-4 md:w-5 md:h-5 transition-transform ${showAll ? 'rotate-90' : 'group-hover:translate-x-1 sm:group-hover:translate-x-2'}`} />
                </button>
            </div>

            {error && (
                <div className="px-6 md:px-8 py-3 border-b border-white/5 text-xs text-amber-100/80">{error}</div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">A sincronizar actividade…</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 px-6 text-center">
                    <Monitor className="w-10 h-10 text-white/10" />
                    <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Sem actividade registada</p>
                    <p className="text-[11px] text-white/25 max-w-lg">
                        As reservas do portal e os pedidos POS aparecem aqui assim que forem criados — sem dados de demonstração.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto min-w-full pb-2 md:pb-0">
                    <table className="w-full text-left responsive-table">
                        <thead>
                            <tr className="bg-white/[0.01]">
                                <th className={thClass}>Event ID</th>
                                <th className={thClass}>Activity</th>
                                <th className={thClass}>Operational Point</th>
                                <th className={thClass}>Operator</th>
                                <th className={thClass}>Timeline</th>
                                <th className={thClass}>Security Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            {visible.map(log => (
                                <tr key={log.id} className="group hover:bg-white/[0.03] transition-colors">
                                    <td data-label="Event ID" className="px-6 py-4 md:px-6 md:py-6">
                                        <span className="text-white/40 font-black text-xs md:text-sm tracking-widest font-mono group-hover:text-white/60">{log.id}</span>
                                    </td>
                                    <td data-label="Activity" className="px-6 py-4 md:px-6 md:py-6 min-w-[220px]">
                                        <p className="font-black text-xs md:text-sm uppercase tracking-widest text-white/90 group-hover:text-[var(--brand-primary)] transition-all">
                                            {log.action}
                                        </p>
                                    </td>
                                    <td data-label="Operational Point" className="px-6 py-4 md:px-6 md:py-6">
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <Activity className="w-5 h-5 text-white/20" />
                                            <span className="text-white/60 font-black text-xs md:text-sm tracking-widest uppercase truncate">{log.location}</span>
                                        </div>
                                    </td>
                                    <td data-label="Operator" className="px-6 py-4 md:px-6 md:py-6">
                                        <span className="text-[var(--brand-primary)]/80 font-black text-[10px] md:text-xs tracking-widest uppercase">{log.operator}</span>
                                    </td>
                                    <td data-label="Timeline" className="px-6 py-3 md:px-8 md:py-5">
                                        <span className="text-white/50 font-black text-xs md:text-sm tracking-widest tabular-nums">{log.time}</span>
                                    </td>
                                    <td data-label="Security Status" className="px-6 py-4 md:px-6 md:py-6">
                                        <span className={`px-4 md:px-5 py-2 md:py-2.5 rounded-full border text-[9px] md:text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center ${STATUS_BADGE[log.status]}`}>
                                            {log.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="p-8 md:p-10 bg-black/20 flex justify-center text-center">
                <p className="text-[9px] md:text-xs font-black text-white/20 uppercase tracking-[0.5em] md:tracking-[0.8em] animate-pulse">
                    {showAll ? `Arquivo Desencriptado — ${visible.length} Registos Exibidos` : `Actividade Recente — ${visible.length} de ${rows.length} registos`}
                </p>
            </div>
        </motion.div>
    );
}
