/* eslint-disable */
'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Room {
    id: string;
    room_number?: string;
    status: string; // DISPONIVEL | OCUPADO | LIMPEZA | MANUTENCAO
    room_type?: string;
    type?: string;
}

interface HoloRoomMapProps {
    onSelectRoom?: (roomId: string, status: string) => void;
}

export function HoloRoomMap({ onSelectRoom }: HoloRoomMapProps) {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    useEffect(() => {
        const fetchRooms = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('hotel_rooms')
                .select('id, room_number, room_type, status')
                .order('room_number', { ascending: true });

            if (!error && data) {
                setRooms(data as Room[]);
            } else {
                console.warn('[HoloRoomMap] Erro ao carregar quartos:', error);
            }
            setLoading(false);
        };

        fetchRooms();

        // Realtime Subscription (compatível offline via stub)
        const channel = (supabase as any)
            .channel('room-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_rooms' }, () => {
                fetchRooms();
            })
            .subscribe();

        return () => {
            (supabase as any).removeChannel(channel);
        };
    }, []);

    const startDragging = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        setStartX(clientX - (viewportRef.current?.offsetLeft || 0));
        setScrollLeft(viewportRef.current?.scrollLeft || 0);
    };

    const stopDragging = () => setIsDragging(false);

    const onDrag = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const x = clientX - (viewportRef.current?.offsetLeft || 0);
        const walk = (x - startX) * 2;
        if (viewportRef.current) viewportRef.current.scrollLeft = scrollLeft - walk;
    };

    const getRoomColor = (status: string) => {
        switch (status) {
            case 'OCUPADO':    return { border: 'border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_30px_rgba(0,255,255,0.1)]', icon: 'text-cyan-400', badge: 'bg-cyan-400/20 text-cyan-300' };
            case 'MANUTENCAO': return { border: 'border-red-500/40 bg-red-500/5', icon: 'text-red-400', badge: 'bg-red-500/20 text-red-400' };
            case 'LIMPEZA':    return { border: 'border-yellow-400/40 bg-yellow-400/5', icon: 'text-yellow-400', badge: 'bg-yellow-400/20 text-yellow-400' };
            default:           return { border: 'border-emerald-500/40 bg-emerald-500/5', icon: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400' };
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'DISPONIVEL': return 'LIVRE';
            case 'OCUPADO':    return 'OCUPADO';
            case 'LIMPEZA':    return 'LIMPEZA';
            case 'MANUTENCAO': return 'MANUTENÇÃO';
            default: return status;
        }
    };

    return (
        <div className="w-full glass-panel rounded-[50px] p-12 overflow-hidden bg-white/[0.01]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16 px-4">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-1.5 h-6 bg-emerald-500 shadow-[0_0_15px_#10B981]" />
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Mapa de <span className="text-emerald-400">Quartos</span></h3>
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Visualização em Tempo Real • {rooms.length} quartos</p>
                </div>
                <div className="flex flex-wrap gap-4 md:gap-6">
                    {[
                        { color: 'bg-emerald-500 shadow-[0_0_10px_#10B981]', label: 'Livre' },
                        { color: 'bg-cyan-400 shadow-[0_0_10px_#00FFFF]', label: 'Ocupado' },
                        { color: 'bg-yellow-400 shadow-[0_0_10px_yellow]', label: 'Limpeza' },
                        { color: 'bg-red-500 shadow-[0_0_10px_red]', label: 'Manutenção' },
                    ].map(({ color, label }) => (
                        <div key={label} className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div
                ref={viewportRef}
                onMouseDown={startDragging}
                onMouseLeave={stopDragging}
                onMouseUp={stopDragging}
                onMouseMove={onDrag}
                onTouchStart={startDragging}
                onTouchEnd={stopDragging}
                onTouchMove={onDrag}
                className="map-viewport w-full cursor-grab active:cursor-grabbing overflow-x-auto"
            >
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
                    </div>
                ) : rooms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Home className="w-12 h-12 text-white/10" />
                        <p className="text-xs font-black text-white/20 uppercase tracking-[0.4em]">Sem quartos carregados</p>
                        <p className="text-[10px] text-white/10 uppercase tracking-widest">Servidor local (porta 3002) necessário</p>
                    </div>
                ) : (
                    <div className="flex px-4 md:px-10 pb-12 gap-6 md:gap-10 min-w-max">
                        {rooms.map((room) => {
                            const colors = getRoomColor(room.status);
                            const displayNumber = room.room_number || room.id;
                            const displayType = room.room_type || room.type || '';
                            return (
                                <motion.div
                                    key={room.id}
                                    whileHover={{ scale: 1.06, y: -6 }}
                                    whileTap={{ scale: 0.97 }}
                                    className="relative group cursor-pointer"
                                    onClick={() => onSelectRoom?.(room.id, room.status)}
                                >
                                    <div className={`w-36 md:w-40 h-48 md:h-52 rounded-[30px] border-2 glass-panel flex flex-col items-center justify-between p-6 md:p-8 transition-all duration-700 relative overflow-hidden ${colors.border}`}>
                                        <div className="text-center z-10 mt-2">
                                            <p className="text-[7px] md:text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">{displayType}</p>
                                            <h4 className="text-3xl md:text-4xl font-black text-white tracking-tighter">{displayNumber}</h4>
                                        </div>

                                        <div className={`p-3 md:p-4 rounded-xl border border-white/5 z-10 ${colors.icon}`}>
                                            <Home className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>

                                        {/* Status Badge */}
                                        <span className={`text-[7px] font-black uppercase tracking-widest px-3 py-1 rounded-full z-10 ${colors.badge}`}>
                                            {getStatusLabel(room.status)}
                                        </span>

                                        {room.status === 'OCUPADO' && (
                                            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-cyan-400/30 animate-scan-fast" />
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
