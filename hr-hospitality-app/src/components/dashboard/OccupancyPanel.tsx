'use client';

import { motion } from 'framer-motion';
import { BedDouble, DoorOpen, Loader2, Sparkles, User, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useRoomSync } from '@/lib/roomEvents';
import { supabase } from '@/lib/supabase';

interface RoomRow {
    id: string;
    room_number: string;
    room_type: string;
    status: string;
}

interface ReservationRow {
    room_id: string | null;
    room_number: string | null;
    guest_name: string;
    client_number: string | null;
    status: string;
}

interface Stay {
    roomKey: string;
    guestName: string;
    clientNumber: string | null;
    status: string;
    weight: number;
}

/** CHECKED_IN ganha (é quem está dentro), depois CONFIRMADA. */
const STATUS_WEIGHT: Record<string, number> = {
    CHECKED_IN: 0,
    CONFIRMADA: 1,
    PENDENTE_PAGAMENTO: 2,
};

const HEADCOUNT_CLASS = 'grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4';
const HEAD_CARD = 'rounded-2xl border p-4 md:p-5 flex flex-col gap-1';
const HEAD_VALUE = 'text-2xl md:text-3xl font-black text-white tabular-nums leading-none';
const HEAD_LABEL = 'text-[9px] font-black uppercase tracking-[0.25em]';

/**
 * Resumo de ocupação do Dashboard: contagem e lista rápida de quartos
 * ocupados (número + hóspede) e de quartos livres/disponíveis.
 * Actualiza sem recarregar a página (eventos + foco + polling).
 */
export function OccupancyPanel() {
    const [rooms, setRooms] = useState<RoomRow[]>([]);
    const [stays, setStays] = useState<Stay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [roomsRes, reservationsRes] = await Promise.all([
                supabase
                    .from('hotel_rooms')
                    .select('id, room_number, room_type, status')
                    .order('room_number', { ascending: true }),
                supabase
                    .from('hotel_reservations')
                    .select('room_id, room_number, guest_name, client_number, status')
                    .in('status', ['CHECKED_IN', 'CONFIRMADA'])
                    .limit(500),
            ]);

            if (roomsRes.error || !roomsRes.data) {
                setError(roomsRes.error?.message || 'Não foi possível carregar os quartos.');
                setRooms([]);
                setStays([]);
                return;
            }

            setError(null);
            setRooms(roomsRes.data as RoomRow[]);

            const best = new Map<string, Stay>();
            for (const reservation of ((reservationsRes.data ?? []) as ReservationRow[])) {
                const keys: string[] = [];
                if (reservation.room_id) keys.push(`id:${reservation.room_id}`);
                if (reservation.room_number) keys.push(`num:${reservation.room_number}`);
                const weight = STATUS_WEIGHT[reservation.status] ?? 9;
                for (const key of keys) {
                    const current = best.get(key);
                    if (!current || weight < current.weight) {
                        best.set(key, {
                            roomKey: key,
                            guestName: reservation.guest_name,
                            clientNumber: reservation.client_number,
                            status: reservation.status,
                            weight,
                        });
                    }
                }
            }
            setStays(Array.from(best.values()));
        } catch {
            setError('Sem ligação ao servidor local.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useRoomSync(load, { intervalMs: 15000 });

    const stayForRoom = (room: RoomRow): Stay | null =>
        stays.find(stay => stay.roomKey === `id:${room.id}` || stay.roomKey === `num:${room.room_number}`) ?? null;

    const occupied = rooms.filter(room => room.status === 'OCUPADO');
    const available = rooms.filter(room => room.status === 'DISPONIVEL');
    const cleaning = rooms.filter(room => room.status === 'LIMPEZA');
    const maintenance = rooms.filter(room => room.status === 'MANUTENCAO');
    const total = rooms.length;
    const occupancy = total ? Math.round((occupied.length / total) * 100) : 0;

    const occupiedList = occupied.map(room => ({ room, stay: stayForRoom(room) }));
    const unoccupied = [...available, ...cleaning, ...maintenance];

    const headCards = [
        { label: 'Ocupados', value: occupied.length, icon: BedDouble, className: 'border-emerald-400/30 bg-emerald-400/5', valueClass: 'text-emerald-300', iconClass: 'text-emerald-400' },
        { label: 'Livres', value: available.length, icon: DoorOpen, className: 'border-cyan-400/30 bg-cyan-400/5', valueClass: 'text-cyan-300', iconClass: 'text-cyan-400' },
        { label: 'Limpeza', value: cleaning.length, icon: Sparkles, className: 'border-amber-400/30 bg-amber-400/5', valueClass: 'text-amber-300', iconClass: 'text-amber-400' },
        { label: 'Manutenção', value: maintenance.length, icon: Wrench, className: 'border-rose-400/30 bg-rose-400/5', valueClass: 'text-rose-300', iconClass: 'text-rose-400' },
    ];

    return (
        <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-[32px] md:rounded-[40px] border border-white/10 overflow-hidden"
        >
            <div className="p-6 md:p-8 border-b border-white/10 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div>
                    <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">
                        Ocupação do Hotel
                    </h3>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-1.5">
                        {total} quartos • sincronização instantânea com o mapa de quartos
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none">
                            {occupancy}<span className="text-base text-[var(--brand-primary)] ml-1">%</span>
                        </p>
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mt-1">Taxa de ocupação</p>
                    </div>
                    <div className="relative w-16 h-16 md:w-20 md:h-20">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
                            <circle
                                cx="18" cy="18" r="15.9" fill="none"
                                stroke="var(--brand-primary)" strokeWidth="3.5" strokeLinecap="round"
                                strokeDasharray={`${occupancy} ${100 - occupancy}`}
                            />
                        </svg>
                        {loading && <Loader2 className="absolute inset-0 m-auto w-4 h-4 text-white/30 animate-spin" />}
                    </div>
                </div>
            </div>

            {error && (
                <div className="px-6 md:px-8 py-3 border-b border-white/5 text-xs text-amber-100/80">
                    {error}
                </div>
            )}

            <div className="p-6 md:p-8 space-y-6 md:space-y-8">
                <div className={HEADCOUNT_CLASS}>
                    {headCards.map(card => (
                        <div key={card.label} className={`${HEAD_CARD} ${card.className}`}>
                            <div className="flex items-center justify-between">
                                <span className={HEAD_LABEL} style={{ color: 'rgba(255,255,255,0.45)' }}>{card.label}</span>
                                <card.icon className={`w-4 h-4 ${card.iconClass}`} />
                            </div>
                            <p className={`${HEAD_VALUE} ${card.valueClass}`}>{card.value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Quartos ocupados — número + hóspede */}
                    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5 md:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <BedDouble className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-[10px] font-black text-emerald-300 uppercase tracking-[0.3em]">
                                Quartos Ocupados ({occupied.length})
                            </h4>
                        </div>
                        {occupiedList.length === 0 ? (
                            <p className="text-[11px] text-white/30 uppercase tracking-widest">Nenhum hóspede activo</p>
                        ) : (
                            <ul className="space-y-2">
                                {occupiedList.map(({ room, stay }) => (
                                    <li
                                        key={room.id}
                                        className="flex items-center justify-between gap-3 rounded-xl bg-black/30 border border-white/5 px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-lg font-black text-white tabular-nums">{room.room_number}</span>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-black text-white/70 uppercase tracking-wider truncate">
                                                    {stay?.guestName ?? 'Hóspede não identificado'}
                                                </p>
                                                {stay?.clientNumber && (
                                                    <p className="text-[9px] font-mono text-emerald-300/60 tracking-widest">{stay.clientNumber}</p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest shrink-0 ${stay?.status === 'CHECKED_IN'
                                            ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                            : 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10'
                                            }`}>
                                            {stay?.status === 'CHECKED_IN' ? 'Dentro' : 'Reservado'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Quartos livres / disponíveis */}
                    <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5 md:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <DoorOpen className="w-4 h-4 text-cyan-400" />
                            <h4 className="text-[10px] font-black text-cyan-300 uppercase tracking-[0.3em]">
                                Livres / Disponíveis ({available.length})
                            </h4>
                        </div>
                        {available.length === 0 ? (
                            <p className="text-[11px] text-white/30 uppercase tracking-widest">Hotel sem quartos disponíveis</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {available.map(room => (
                                    <span
                                        key={room.id}
                                        title={`${room.room_type} — ${room.status}`}
                                        className="px-3 py-2 rounded-xl bg-black/30 border border-cyan-400/20 text-sm font-black text-cyan-200 tabular-nums"
                                    >
                                        {room.room_number}
                                    </span>
                                ))}
                            </div>
                        )}

                        {unoccupied.length > 0 && (
                            <div className="mt-5 pt-4 border-t border-white/5">
                                <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.3em] mb-2">
                                    Fora de serviço
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {unoccupied.filter(room => room.status !== 'DISPONIVEL').map(room => (
                                        <span
                                            key={room.id}
                                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${room.status === 'LIMPEZA'
                                                ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                : 'text-rose-300 border-rose-400/30 bg-rose-400/10'
                                                }`}
                                        >
                                            {room.room_number} · {room.status === 'LIMPEZA' ? 'Limpeza' : 'Manutenção'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <p className="flex items-center gap-2 text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">
                    <User className="w-3 h-3" />
                    Toda a estadia referencia um cliente KYC cadastrado
                </p>
            </div>
        </motion.section>
    );
}
