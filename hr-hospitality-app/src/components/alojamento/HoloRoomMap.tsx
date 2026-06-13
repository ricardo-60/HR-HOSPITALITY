'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { Shield, Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Room {
    id: string;     // room number e.g. '101'
    status: string; // FREE | OCCUPIED | CLEANING | MAINTENANCE
    type: string;
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
            const { data, error } = await supabase
                .from('hospitality_rooms')
                .select('id, type, status')
                .order('id', { ascending: true });

            if (!error && data) {
                setRooms(data as Room[]);
            }
            setLoading(false);
        };

        fetchRooms();

        // Realtime Subscription
        const channel = supabase
            .channel('room-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitality_rooms' }, () => {
                fetchRooms();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
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

    return (
        <div className="w-full glass-panel rounded-[50px] p-12 overflow-hidden bg-white/[0.01]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16 px-4">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-1.5 h-6 bg-[#10B981] shadow-[0_0_15px_#10B981]" />
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Mapa de <span className="text-[#10B981]">Quartos</span></h3>
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Visualização em Tempo Real • Layout 3D</p>
                </div>
                <div className="flex gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_10px_#10B981]" />
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Livre</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-cyber-cyan shadow-[0_0_10px_#00FFFF]" />
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Ocupado</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_red]" />
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Manutenção</span>
                    </div>
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
                className="map-viewport w-full cursor-grab active:cursor-grabbing"
            >
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-[#00F2FF]/20 border-t-[#00F2FF] rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="flex px-10 pb-12 gap-10 min-w-max">
                        {rooms.map((room) => (
                            <motion.div
                                key={room.id}
                                whileHover={{ scale: 1.05, y: -5 }}
                                className="relative group cursor-pointer"
                                onClick={() => onSelectRoom?.(room.id, room.status)}
                            >
                                <div className={`w-40 h-52 rounded-[30px] border-2 glass-panel flex flex-col items-center justify-between p-8 transition-all duration-700 relative overflow-hidden ${room.status === 'OCCUPIED'
                                        ? 'border-cyber-cyan shadow-[0_0_30px_rgba(0,255,255,0.1)] bg-cyber-cyan/5'
                                        : room.status === 'MAINTENANCE'
                                            ? 'border-red-500/30 bg-red-500/5'
                                            : room.status === 'CLEANING'
                                                ? 'border-yellow-500/30 bg-yellow-500/5'
                                                : 'border-[#10B981]/30 bg-[#10B981]/5'
                                    }`}>
                                    <div className="text-center z-10">
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">{room.type}</p>
                                        <h4 className="text-4xl font-black text-white tracking-tighter">{room.id}</h4>
                                    </div>

                                    <div className={`p-4 rounded-xl border border-white/5 z-10 ${room.status === 'OCCUPIED' ? 'text-cyber-cyan' : room.status === 'MAINTENANCE' ? 'text-red-500' : room.status === 'CLEANING' ? 'text-yellow-500' : 'text-[#10B981]'
                                        }`}>
                                        <Home className="w-6 h-6" />
                                    </div>

                                    {room.status === 'OCCUPIED' && (
                                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-cyber-cyan/30 animate-scan-fast" />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
