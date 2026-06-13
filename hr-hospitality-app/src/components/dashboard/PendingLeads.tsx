'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CreditCard, User, Calendar, Home, ArrowRight, CheckCircle2 } from 'lucide-react';
import { DEFAULT_TENANT } from '@/config/tenants';
import { supabase } from '@/lib/supabase';

interface MapRoom {
    id: string;       // room number as text e.g. '101'
    type: string;
    status: string;   // FREE | OCCUPIED | CLEANING | MAINTENANCE
}

interface Lead {
    id: string;
    guest_name: string;
    room_id: string;
    reservation_type: string;
    status: 'PENDENTE_PAGAMENTO' | 'CONFIRMADA';
    created_at: string;
}

export function PendingLeads() {
    // 1. Estado do Mapa de Quartos (agora dinâmico)
    const [rooms, setRooms] = useState<MapRoom[]>([]);

    // 2. Estado das Reservas de Site
    const [leads, setLeads] = useState<Lead[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchRooms = async () => {
        try {
            const { data: roomsData, error: roomsError } = await supabase
                .from('hospitality_rooms')
                .select('id, type, status')
                .order('id', { ascending: true });
            
            if (!roomsError && roomsData) {
                setRooms(roomsData as MapRoom[]);
            } else {
                console.warn("Erro ao carregar quartos:", roomsError);
            }
        } catch (err) {
            console.error("Falha ao buscar quartos:", err);
        }
    };

    const fetchLeads = async () => {
        try {
            const { data: leadsData, error: leadsError } = await supabase
                .from('hospitality_reservations')
                .select('id, guest_name, room_id, reservation_type, status, created_at')
                .order('created_at', { ascending: false });
                
            if (!leadsData || leadsError) {
                console.warn("Erro ao carregar reservas:", leadsError);
            } else {
                setLeads(leadsData as Lead[]);
            }
        } catch (err) {
            console.warn("Falha de conexão com o Supabase:", err);
        }
    };

    useEffect(() => {
        fetchRooms();
        fetchLeads();

        // Realtime Subscription
        const channel = supabase
            .channel('pending-leads-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitality_rooms' }, () => {
                fetchRooms();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitality_reservations' }, () => {
                fetchLeads();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const efetivarReserva = async (leadId: string, roomId: string) => {
        const targetRoom = rooms.find(r => r.id === roomId);
        if (!targetRoom) return;
        
        setErrorMsg(null);

        // 1. Atualiza reserva e quarto no Supabase
        try {
            const { error: resError } = await supabase
                .from('hospitality_reservations')
                .update({ status: 'CONFIRMADA', room_id: targetRoom.id })
                .eq('id', leadId);
                
            if (resError) throw resError;

            const { error: roomError } = await supabase
                .from('hospitality_rooms')
                .update({ status: 'OCCUPIED' })
                .eq('id', targetRoom.id);

            if (roomError) throw roomError;
                
        } catch (err) {
            console.warn("Não foi possível persistir no Supabase:", err);
            setErrorMsg("Erro de Conexão: Não foi possível aprovar a reserva no Supabase. " + (err as any).message);
            return;
        }

        // 3. Atualiza os estados locais da UI
        setLeads(currentLeads => 
            currentLeads.map(lead => 
                lead.id === leadId ? { ...lead, status: 'CONFIRMADA', room_id: targetRoom.id } : lead
            )
        );

        setRooms(currentRooms => 
            currentRooms.map(room => 
                room.id === roomId ? { ...room, status: 'OCCUPIED' } : room
            )
        );
    };

    if (leads.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12 relative overflow-hidden"
        >
            {errorMsg && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between text-xs font-black uppercase tracking-widest text-red-400">
                    <span>{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white text-sm font-bold">&times;</button>
                </div>
            )}
            <div className="flex flex-col lg:flex-row gap-8">
                {/* 3. Renderização das Leads (Lado Esquerdo) */}
                <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                        <div className="p-3 bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-2xl animate-pulse self-start sm:self-auto">
                            <AlertCircle className="w-8 h-8 md:w-10 md:h-10 text-[#FBBF24]" />
                        </div>
                        <div>
                            <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">
                                Guardião Financeiro: <span className="text-[#FBBF24] block sm:inline font-bold">Novas Reservas de Site</span>
                            </h3>
                            <p className="text-xs md:text-sm lg:text-base font-black text-white/30 uppercase tracking-[0.2em] mt-1 md:mt-2">Controlo Visual de Check-in em Espera</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <AnimatePresence mode="popLayout">
                            {leads.map((lead) => {
                                const isPending = lead.status === 'PENDENTE_PAGAMENTO';
                                const themeHex = isPending ? '#FBBF24' : '#00F2FF'; // Amarelo Solar ou Turquesa (Ciano)

                                return (
                                    <motion.div
                                        key={lead.id}
                                        layout
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className={`glass-panel p-5 md:p-6 rounded-[20px] md:rounded-[24px] border-l-4 relative group transition-all duration-500`}
                                        style={{ borderLeftColor: themeHex }}
                                    >
                                        <div className="absolute top-6 right-6">
                                            <CreditCard className="w-6 h-6 md:w-8 md:h-8 opacity-20" style={{ color: themeHex }} />
                                        </div>

                                        {/* Status Badge */}
                                        <div className={`absolute -top-3 left-5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm border backdrop-blur-md ${isPending ? 'text-[#FBBF24] border-[#FBBF24]/20 bg-[#FBBF24]/10' : 'text-[#00F2FF] border-[#00F2FF]/20 bg-[#00F2FF]/10'}`}>
                                            {isPending ? (
                                                <>
                                                  <div className="w-2 h-2 rounded-full bg-[#FBBF24] animate-pulse shadow-[0_0_8px_#FBBF24]" />
                                                  Pendente de Pagamento
                                                </>
                                            ) : (
                                                <>
                                                  <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-[#00F2FF]" />
                                                  Confirmada
                                                </>
                                            )}
                                        </div>

                                        <div className="space-y-4 md:space-y-6 pt-4 md:pt-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                                                    <User className="w-5 h-5 md:w-6 md:h-6 text-white/40" />
                                                </div>
                                                <p className="text-base md:text-lg lg:text-xl font-black text-white uppercase tracking-widest truncate">{lead.guest_name}</p>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                                                <div className="flex items-center gap-2">
                                                    <Home className="w-4 h-4 md:w-5 md:h-5 text-white/20" />
                                                    <span className="text-xs md:text-sm font-black text-white/60">{lead.reservation_type} • Quarto {lead.room_id || '–'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-white/20" />
                                                    <span className="text-xs md:text-sm font-black text-white/40">Site/Lead</span>
                                                </div>
                                            </div>

                                            <div className="pt-2 md:pt-4 overflow-hidden">
                                                <AnimatePresence mode="wait">
                                                    {isPending ? (
                                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto ml-auto justify-end">
                                                            <select
                                                                id={`room-select-${lead.id}`}
                                                                defaultValue={lead.room_id || ""}
                                                                className="bg-black/50 border border-[#FBBF24]/30 hover:border-[#FBBF24]/60 focus:border-[#FBBF24] rounded-md text-[9px] md:text-[10px] text-white px-4 py-1.5 md:py-2 outline-none font-black uppercase tracking-widest cursor-pointer transition-all"
                                                            >
                                                                <option value="" disabled>Selecionar Quarto...</option>
                                                                {lead.room_id && !rooms.some(r => r.id === lead.room_id) && (
                                                                    <option value={lead.room_id}>{lead.room_id}</option>
                                                                )}
                                                                {rooms
                                                                    .filter(r => r.status === 'FREE' || r.id === lead.room_id)
                                                                    .map(r => (
                                                                        <option key={r.id} value={r.id} className="bg-[#111827]">
                                                                            {r.id} - {r.type}
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                            <motion.button 
                                                                key="btn-efetivar"
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, scale: 0.95 }}
                                                                onClick={() => {
                                                                    const selectEl = document.getElementById(`room-select-${lead.id}`) as HTMLSelectElement;
                                                                    const selectedRoomId = selectEl?.value;
                                                                    if (!selectedRoomId) {
                                                                        alert("Por favor, selecione um quarto!");
                                                                        return;
                                                                    }
                                                                    efetivarReserva(lead.id, selectedRoomId);
                                                                }}
                                                                className="w-auto px-6 py-1.5 md:py-2 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-300 border border-[#FBBF24]/40 text-[#FBBF24] bg-[#FBBF24]/5 hover:bg-[#FBBF24] hover:text-black hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] active:scale-95 group/btn"
                                                            >
                                                                Efetivar <ArrowRight className="w-3 h-3 opacity-50 group-hover/btn:opacity-100" />
                                                            </motion.button>
                                                        </div>
                                                    ) : (
                                                        <motion.div 
                                                            key="lbl-alocado"
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ duration: 0.4, ease: "easeOut" }}
                                                            className="w-auto ml-auto px-4 py-1.5 md:py-2 text-[var(--brand-accent)] bg-[var(--brand-accent)]/5 border border-[var(--brand-accent)]/20 rounded-md text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] flex items-center opacity-90 transition-all hover:bg-[var(--brand-accent)]/10"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-[var(--brand-accent)]/70" />
                                                                <span className="truncate drop-shadow-[0_0_8px_var(--brand-accent)] mr-2">VINCULADO AO MAPA</span>
                                                            </div>
                                                            <ArrowRight className="w-3 h-3 md:w-4 md:h-4 opacity-40 animate-pulse" />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>

                {/* 4. Simulação do Mapa de Locais (Lado Direito) */}
                <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 pt-[72px]">
                    <div className="glass-panel p-6 md:p-8 rounded-[32px] h-full flex flex-col relative border-t-4" style={{ borderTopColor: 'var(--brand-primary)' }}>
                        <div className="absolute -top-4 md:-top-5 right-6 px-4 py-2 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg border backdrop-blur-md text-[var(--brand-primary)] border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10">
                            Estado em Tempo Real
                        </div>
                        <h4 className="text-xs md:text-sm font-black text-white/40 uppercase tracking-[0.3em] mb-6 flex items-center justify-between">
                            Mapa do Edifício
                            <div className="w-2 h-2 rounded-full bg-[var(--brand-accent)] animate-pulse" />
                        </h4>
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            {rooms.map(room => {
                                const isOccupied = room.status === 'OCCUPIED';
                                return (
                                    <div key={room.id} className={`rounded-xl md:rounded-2xl border flex flex-col justify-center items-center transition-all duration-700 p-4 md:p-6 ${!isOccupied ? 'border-white/10 bg-white/5 text-white/40' : 'border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]'}`}>
                                        <Home className={`w-8 h-8 md:w-10 md:h-10 mb-2 md:mb-3 opacity-50 ${!isOccupied ? '' : 'text-[var(--brand-accent)] drop-shadow-[0_0_8px_var(--brand-accent)]'}`} />
                                        <span className="text-2xl md:text-3xl xl:text-4xl font-black">{room.id}</span>
                                        <span className="text-[10px] md:text-xs uppercase tracking-widest mt-1 md:mt-2 opacity-60">
                                            {!isOccupied ? 'Livre' : 'Ocupado'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
