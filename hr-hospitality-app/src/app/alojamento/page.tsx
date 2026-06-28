/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CheckoutConsolidated } from '@/components/finance/CheckoutConsolidated';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Users, Key, Calendar, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';
import { HoloRoomMap } from '@/components/alojamento/HoloRoomMap';
import { supabase } from '@/lib/supabase';

export default function AlojamentoPage() {
    const [showCheckout, setShowCheckout] = useState(false);
    const [loadingCheckout, setLoadingCheckout] = useState(false);
    const [checkoutData, setCheckoutData] = useState<{
        guestName: string;
        roomNumber: string;
        items: { description: string, value: number, category: string }[];
        taxes: number;
        reservationId: string;
    } | null>(null);

    const handleSelectRoom = async (roomId: string, status: string) => {
        if (status === 'DISPONIVEL') {
            window.location.href = `/alojamento/checkin?room=${roomId}`;
        } else if (status === 'OCUPADO') {
            setLoadingCheckout(true);
            try {
                // 1. Buscar a reserva confirmada para o quarto
                const { data: reservation, error: resError } = await supabase
                    .from('hotel_reservations')
                    .select('id, guest_name')
                    .eq('room_id', roomId)
                    .eq('status', 'CONFIRMADA')
                    .maybeSingle();

                if (resError || !reservation) {
                    console.warn("Nenhuma reserva confirmada ativa para o quarto:", roomId);
                    setLoadingCheckout(false);
                    return;
                }

                // 2. Buscar consumos desta reserva
                const { data: consumptions } = await supabase
                    .from('hotel_consumptions')
                    .select('description, total_price, category')
                    .eq('reservation_id', reservation.id);

                // 3. Montar a lista de itens
                const itemsList = [
                    { description: 'Hospedagem - Estadia Acumulada', value: 25000.00, category: 'ALOJAMENTO' }
                ];

                if (consumptions && consumptions.length > 0) {
                    consumptions.forEach((c: any) => {
                        itemsList.push({
                            description: c.description,
                            value: Number(c.total_price || c.amount || 0),
                            category: c.category || 'EXTRA'
                        });
                    });
                }

                setCheckoutData({
                    guestName: reservation.guest_name,
                    roomNumber: roomId,
                    items: itemsList,
                    taxes: 3500.00,
                    reservationId: reservation.id
                });
                setShowCheckout(true);
            } catch (err) {
                console.error("Erro ao preparar checkout:", err);
            } finally {
                setLoadingCheckout(false);
            }
        }
    };

    const handleFinalizeCheckout = async () => {
        if (!checkoutData) return;
        try {
            // Atualizar quarto para DISPONIVEL
            await supabase
                .from('hotel_rooms')
                .update({ status: 'DISPONIVEL' })
                .eq('id', checkoutData.roomNumber);

            // Atualizar status da reserva para CHECKED_OUT
            await supabase
                .from('hotel_reservations')
                .update({ status: 'CHECKED_OUT' } as any)
                .eq('id', checkoutData.reservationId);

            setShowCheckout(false);
            setCheckoutData(null);
        } catch (err) {
            console.error("Falha ao finalizar checkout:", err);
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-20 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-white/5 pb-16"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-1.5 h-6 bg-[#00F2FF] shadow-[0_0_15px_#00F2FF]" />
                            <span className="text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.6em]">Hospitality Module • Active</span>
                        </div>
                        <h1 className="text-8xl font-black text-white tracking-tighter leading-none uppercase stroke-white/20">
                            ALOJA<span className="text-[#00F2FF]">MENTO</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-10 max-w-lg leading-relaxed">
                            HR-HOSPITALITY ROOM MANAGEMENT & GUEST CHECK-IN
                        </p>
                    </div>

                    <div className="flex gap-6">
                        <button
                            onClick={() => window.location.href = '/alojamento/checkin'}
                            className="px-12 py-8 bg-gradient-to-r from-cyber-cyan to-cyber-purple text-black font-black text-[10px] uppercase tracking-[0.5em] rounded-[30px] shadow-[0_20px_40px_rgba(0,255,255,0.2)] hover:scale-105 transition-all flex items-center gap-4"
                        >
                            Check-in 360 <Zap className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setShowCheckout(true)}
                            className="px-12 py-8 bg-black border border-[#00F2FF]/40 text-[#00F2FF] font-black text-[10px] uppercase tracking-[0.5em] rounded-[30px] shadow-[0_20px_40px_rgba(0,0,0,0.8)] hover:bg-[#00F2FF] hover:text-black transition-all flex items-center gap-4"
                        >
                            Fast Check-out Mode <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </motion.div>

                {/* Fotografia Oficial do Alojamento com fallback */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[350px] md:h-[450px] rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group mb-16">
                    <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-700 pointer-events-none" />
                    {/* Fundo gradiente como fallback se a imagem não existir */}
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/60 via-blue-950 to-black" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <div className="w-64 h-64 rounded-full bg-cyan-400/20 blur-3xl" />
                    </div>
                    <Image 
                        src="/images/quarto-casal-luxo-hotel-lukweku.png" 
                        alt="Quarto Casal Luxo" 
                        fill 
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                        priority
                    />
                    <div className="absolute top-8 right-8 z-20 px-4 py-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-full">
                        <span className="text-white/70 font-black text-[9px] uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></span>
                            Vista Otimizada
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-10 md:p-14 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-20 flex flex-col justify-end">
                        <span className="text-[#00F2FF] font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-3 block drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]">Standard Excellency</span>
                        <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter drop-shadow-lg">Suítes Executivas</h2>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {[
                        { label: 'Check-ins Hoje', value: '12', icon: Calendar, color: '#00F2FF' },
                        { label: 'Quartos Livres', value: '45', icon: Home, color: '#10B981' },
                        { label: 'A chegar', value: '08', icon: Users, color: '#8B5CF6' },
                        { label: 'Chaves Ativas', value: '156', icon: Key, color: '#F59E0B' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-[#111111] border border-white/10 p-12 rounded-[50px] shadow-2xl group hover:border-[#00F2FF]/40 transition-all">
                            <div className="flex justify-between items-start mb-12">
                                <div className="p-5 bg-white/5 rounded-2xl border border-white/5 group-hover:border-[#00F2FF]/20 transition-all">
                                    <stat.icon className="w-8 h-8" style={{ color: stat.color }} />
                                </div>
                                <span className="text-white/10 font-black text-[9px] uppercase tracking-widest">Live Sensor</span>
                            </div>
                            <p className="text-5xl font-black text-white tracking-tighter mb-4 tabular-nums">{stat.value}</p>
                            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em]">{stat.label}</p>
                        </div>
                    ))}
                </div>

                <HoloRoomMap onSelectRoom={handleSelectRoom} />

                {/* Loading checkout state overlay */}
                <AnimatePresence>
                    {loadingCheckout && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
                        >
                            <Loader2 className="w-16 h-16 text-[#00F2FF] animate-spin mb-4" />
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">Consolidando Extrato Transacional...</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showCheckout && checkoutData && (
                        <div className="fixed inset-0 z-[200] flex justify-center items-center px-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => {
                                    setShowCheckout(false);
                                    setCheckoutData(null);
                                }}
                                className="absolute inset-0 bg-black/95 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="relative w-full max-w-[1200px] max-h-[90vh] overflow-hidden"
                            >
                                <CheckoutConsolidated
                                    guestName={checkoutData.guestName}
                                    roomNumber={checkoutData.roomNumber}
                                    items={checkoutData.items}
                                    taxes={checkoutData.taxes}
                                    onFinalize={handleFinalizeCheckout}
                                />
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </DashboardLayout>
    );
}
