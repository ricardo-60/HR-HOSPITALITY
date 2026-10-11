/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CheckoutConsolidated } from '@/components/finance/CheckoutConsolidated';
import { FaturaPrintSheet } from '@/components/finance/FaturaPrintSheet';
import {
    ClienteFatura,
    DadosFatura,
    FormatoFatura,
    LinhaFatura,
    MetodoPagamento,
    PagamentoFatura,
    gerarNumeroFatura,
    origemConsumo,
    resumoFatura,
} from '@/lib/fatura';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Users, Key, Calendar, ArrowRight, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { RoomBoard } from '@/app/alojamento/RoomBoard';
import { ReservationsPanel } from '@/components/alojamento/ReservationsPanel';
import { supabase } from '@/lib/supabase';
import { localQuery } from '@/lib/db/localDB';
import { emitRoomEvent, useRoomSync } from '@/lib/roomEvents';

// Estados terminais: não contam para "a chegar" nem para check-ins do dia.
const INACTIVE_RESERVATION_STATUSES = ['CHECKED_OUT', 'CANCELADA'];

function nightsBetween(start: string | null, end: string): number {
    if (!start) return 1;
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1;
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    return Math.max(1, diff);
}

export default function AlojamentoPage() {
    const [showCheckout, setShowCheckout] = useState(false);
    const [loadingCheckout, setLoadingCheckout] = useState(false);
    const [checkoutHint, setCheckoutHint] = useState(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [checkoutData, setCheckoutData] = useState<{
        guestName: string;
        roomNumber: string;   // número legível (ex: "101"), usado no extrato
        roomId: string;       // id canónico do quarto
        linhas: LinhaFatura[];
        taxes: number;
        reservationId: string;
        periodo: { entrada: string | null; saida: string | null };
        cliente: ClienteFatura;
        invoiceNumber: string;
        auditToken: string;
    } | null>(null);
    // Folha preparada para `window.print()` — vive fora do `print:hidden` do modal.
    const [fatura, setFatura] = useState<{ formato: FormatoFatura; dados: DadosFatura; impresso: string } | null>(null);

    const [kpis, setKpis] = useState<{ checkins: string; livres: string; aChegar: string; chaves: string } | null>(null);

    const loadKpis = useCallback(async () => {
        const fallback = { checkins: '—', livres: '—', aChegar: '—', chaves: '—' };
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const [roomsRes, resRes] = await Promise.all([
                supabase.from('hotel_rooms').select('status'),
                supabase.from('hotel_reservations').select('check_in_date, status'),
            ]);
            if (roomsRes.error || !roomsRes.data) { setKpis(fallback); return; }
            const rooms = roomsRes.data as { status: string }[];
            const reservas = resRes.error ? [] : ((resRes.data || []) as { check_in_date: string | null; status: string }[]);
            setKpis({
                // Reservas canceladas nunca contam como check-in.
                checkins: String(reservas.filter(r => r.check_in_date === hoje && r.status !== 'CANCELADA').length),
                livres: String(rooms.filter(r => r.status === 'DISPONIVEL').length),
                aChegar: String(reservas.filter(r => (r.check_in_date || '') > hoje && !INACTIVE_RESERVATION_STATUSES.includes(r.status)).length),
                chaves: String(rooms.filter(r => r.status === 'OCUPADO').length),
            });
        } catch {
            setKpis(fallback);
        }
    }, []);

    useEffect(() => {
        void loadKpis();
    }, [loadKpis]);

    // Actualização instantânea dos KPIs: eventos + foco + polling de segurança.
    useRoomSync(loadKpis);

    const handleSelectRoom = async (roomId: string, status: string) => {
        // Um quarto reservado para hoje ainda sem check-in comporta-se como
        // livre no fluxo: leva directamente ao check-in com o quarto pré-seleccionado.
        if (status === 'DISPONIVEL' || status === 'RESERVADO') {
            window.location.href = `/alojamento/checkin?room=${roomId}`;
            return;
        }
        if (status !== 'OCUPADO') return;

        setLoadingCheckout(true);
        setCheckoutError(null);
        try {
            // A estadia activa pode ser CHECKED_IN (entrada já feita) ou
            // CONFIRMADA (reserva do portal ainda sem entrada). Antes só se
            // procurava CONFIRMADA e o check-out falhava em silêncio.
            const { data: activeReservations, error: resError } = await supabase
                .from('hotel_reservations')
                .select('id, guest_name, room_number, check_in_date, status, total_amount, client_id, client_number')
                .eq('room_id', roomId)
                .in('status', ['CHECKED_IN', 'CONFIRMADA'])
                .order('created_at', { ascending: false })
                .limit(1);

            const reservation = !resError && activeReservations && activeReservations.length > 0
                ? activeReservations[0] as { id: string; guest_name: string; room_number: string | null; check_in_date: string | null; status: string; total_amount: number | string | null; client_id: string | null; client_number: string | null }
                : null;

            if (!reservation) {
                setCheckoutError('Nenhuma estadia activa associada a este quarto.');
                setLoadingCheckout(false);
                return;
            }

            const agora = new Date();
            const hoje = agora.toISOString().split('T')[0];
            // Débitos com rastreabilidade total: data/hora exacta, zona de
            // consumo e mesa/dispositivo de origem de cada lançamento (SQLite local).
            const [{ data: room }, { data: consumptions }, { data: client }] = await Promise.all([
                supabase.from('hotel_rooms').select('id, room_number, price_per_night').eq('id', roomId).maybeSingle(),
                supabase
                    .from('hotel_consumptions')
                    .select('description, quantity, unit_price, total_price, category, registered_at, source_zone, source_table')
                    .eq('reservation_id', reservation.id)
                    .order('registered_at', { ascending: true }),
                reservation.client_id
                    ? supabase.from('clients').select('full_name, client_number, document_type, document_number, email').eq('id', reservation.client_id).maybeSingle()
                    : Promise.resolve({ data: null, error: null } as { data: any; error: any }),
            ]);

            const roomNumber = room?.room_number || reservation.room_number || roomId;
            const pricePerNight = Number(room?.price_per_night ?? reservation.total_amount ?? 0);
            const nights = nightsBetween(reservation.check_in_date, hoje);

            // Extrato calculado a partir da tarifa real do quarto × noites —
            // nunca valores fixos de demonstração.
            const linhas: LinhaFatura[] = [
                {
                    kind: 'ALOJAMENTO',
                    description: `Hospedagem — ${nights} noite(s) × ${pricePerNight.toFixed(2)}Kz`,
                    quantity: nights,
                    unitPrice: pricePerNight,
                    value: pricePerNight * nights,
                    category: 'ALOJAMENTO',
                    registeredAt: agora.toISOString(),
                    zone: 'RECEPCAO',
                    origin: `Check-in ${reservation.check_in_date ? reservation.check_in_date.split('-').reverse().join('/') : '—'} · Quarto ${roomNumber}`,
                },
            ];

            if (consumptions && consumptions.length > 0) {
                (consumptions as any[]).forEach(c => {
                    linhas.push({
                        kind: 'EXTRA',
                        description: c.description,
                        quantity: Number(c.quantity ?? 1),
                        unitPrice: Number(c.unit_price ?? 0),
                        value: Number(c.total_price || 0),
                        category: c.category || 'EXTRA',
                        registeredAt: c.registered_at ?? null,
                        zone: c.source_zone ?? null,
                        // "Mesa 03 (Restaurante Principal) → Transferido p/ Quarto 102"
                        origin: origemConsumo(c.source_zone, c.source_table, roomNumber),
                    });
                });
            }

            const documento = client
                ? [client.document_type, client.document_number].filter(Boolean).join(' ') || null
                : null;

            setCheckoutData({
                guestName: reservation.guest_name,
                roomNumber,
                roomId,
                linhas,
                taxes: 0,
                reservationId: reservation.id,
                periodo: { entrada: reservation.check_in_date, saida: hoje },
                cliente: {
                    nome: client?.full_name ?? reservation.guest_name,
                    numero: client?.client_number ?? reservation.client_number ?? null,
                    documento,
                    email: client?.email ?? null,
                },
                invoiceNumber: gerarNumeroFatura(agora),
                auditToken: `AUDIT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            });
            setFatura(null);
            setShowCheckout(true);
        } catch (err) {
            console.error("Erro ao preparar checkout:", err);
            setCheckoutError(err instanceof Error ? err.message : 'Erro ao preparar o check-out.');
        } finally {
            setLoadingCheckout(false);
        }
    };

    // Botão CHECK-OUT do header: dispara o fluxo de checkout.
    // Sem extrato consolidado (quarto ainda não selecionado no mapa), dá feedback inline
    // e leva o utilizador ao Mapa de Quartos para escolher o quarto ocupado.
    const handleHeaderCheckout = () => {
        if (checkoutData) {
            setShowCheckout(true);
            return;
        }
        setCheckoutHint(true);
        document.getElementById('room-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setCheckoutHint(false), 5000);
    };

    const handleFinalizeCheckout = async (pagamento: {
        method: MetodoPagamento;
        received: number;
        paid: number;
        change: number;
        pending: number;
        invoice: string;
    }) => {
        if (!checkoutData) return;
        setCheckoutError(null);
        try {
            // Lance atómico no servidor: reserva → CHECKED_OUT e quarto →
            // DISPONIVEL, com validação de estado, libertação do quarto e
            // registo do pagamento (método, pago, pendente, troco, fatura)
            // nas notas da reserva para auditoria.
            const updated = await localQuery<{ id?: string; status?: string } | null>(
                'hotel_reservations.checkOut',
                {
                    id: checkoutData.reservationId,
                    room_status: 'DISPONIVEL',
                    payment: {
                        method: pagamento.method,
                        paid: pagamento.paid,
                        pending: pagamento.pending,
                        change: pagamento.change,
                        invoice: pagamento.invoice,
                        received: pagamento.received,
                    },
                }
            );
            if (!updated || updated.status !== 'CHECKED_OUT') {
                throw new Error('O servidor não confirmou a transição de check-out.');
            }

            const { roomId, roomNumber, reservationId } = checkoutData;
            setShowCheckout(false);
            setCheckoutData(null);
            setFatura(null);

            // Reactividade: o mapa, os KPIs e o Dashboard actualizam no acto.
            emitRoomEvent({ type: 'check-out', roomId, roomNumber, reservationId });
        } catch (err) {
            console.error("Falha ao finalizar checkout:", err);
            setCheckoutError(err instanceof Error ? err.message : 'Falha ao finalizar o check-out.');
            setShowCheckout(false);
        }
    };

    /**
     * Prepara a folha da fatura/extrato (A4 ou bobina térmica de 80 mm) e abre
     * a caixa de impressão do navegador. A folha tem de estar no DOM antes de
     * `window.print()`, por isso o estado muda primeiro e o pedido vai no tick
     * seguinte — mesmo padrão das escalas de RH.
     */
    const imprimirFatura = (formato: FormatoFatura, pagamento: PagamentoFatura) => {
        if (!checkoutData) return;
        const agora = new Date();
        const resumo = resumoFatura(checkoutData.linhas, checkoutData.taxes);
        const dados: DadosFatura = {
            numero: checkoutData.invoiceNumber,
            emitidoEm: agora.toISOString(),
            guestName: checkoutData.guestName,
            roomNumber: checkoutData.roomNumber,
            periodo: checkoutData.periodo,
            cliente: checkoutData.cliente,
            linhas: checkoutData.linhas,
            alojamento: resumo.alojamento,
            extras: resumo.extras,
            taxas: resumo.taxas,
            total: resumo.total,
            pagamento,
            auditToken: checkoutData.auditToken,
        };
        setFatura({ formato, dados, impresso: agora.toLocaleString('pt-PT') });
        window.setTimeout(() => { window.print(); }, 80);
    };

    const fecharCheckout = () => {
        setShowCheckout(false);
        setCheckoutData(null);
        setFatura(null);
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-10 md:space-y-16 pb-20 px-4 print:hidden">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row flex-wrap justify-between items-start md:items-end gap-8 md:gap-12 border-b border-white/5 pb-10 md:pb-16"
                >
                    <div>
                        <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-8">
                            <div className="w-1.5 h-5 md:h-6 bg-[#00F2FF] shadow-[0_0_15px_#00F2FF]" />
                            <span className="text-[9px] md:text-[10px] font-black text-[#00F2FF] uppercase tracking-[0.4em] md:tracking-[0.6em]">Hospitality Module • Active</span>
                        </div>
                        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            ALOJA<span className="text-[#00F2FF]">MENTO</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.5em] md:tracking-[0.8em] text-[10px] md:text-[11px] mt-6 md:mt-10 max-w-lg leading-relaxed">
                            HR-HOSPITALITY ROOM MANAGEMENT & GUEST CHECK-IN
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 md:gap-6 w-full md:w-auto ml-auto">
                        <button
                            onClick={() => window.location.href = '/alojamento/checkin'}
                            className="flex-1 sm:flex-none px-6 md:px-12 py-4 md:py-8 bg-gradient-to-r from-cyber-cyan to-cyber-purple text-black font-black text-[10px] uppercase tracking-[0.3em] md:tracking-[0.5em] rounded-2xl md:rounded-[30px] shadow-[0_20px_40px_rgba(0,255,255,0.2)] hover:scale-105 transition-all flex items-center justify-center gap-3"
                        >
                            Check-in 360 <Zap className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleHeaderCheckout}
                            className="flex-1 sm:flex-none px-6 md:px-12 py-4 md:py-8 bg-black border border-[#00F2FF]/40 text-[#00F2FF] font-black text-[10px] uppercase tracking-[0.3em] md:tracking-[0.5em] rounded-2xl md:rounded-[30px] hover:bg-[#00F2FF] hover:text-black transition-all flex items-center justify-center gap-3"
                        >
                            Check-out <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>

                {/* Fotografia Oficial do Alojamento com fallback */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative w-full h-[220px] sm:h-[320px] md:h-[400px] rounded-[32px] md:rounded-[50px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 group">
                    <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-700 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/60 via-blue-950 to-black" />
                    <Image
                        src="/images/quarto-casal-luxo-hotel-lukweku.png"
                        alt="Quarto Casal Luxo"
                        fill
                        className="object-cover object-center group-hover:scale-105 transition-transform duration-1000"
                        priority
                    />
                    <div className="absolute top-4 md:top-8 right-4 md:right-8 z-20 px-3 md:px-4 py-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-full">
                        <span className="text-white/70 font-black text-[8px] md:text-[9px] uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></span>
                            Vista Otimizada
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 lg:p-14 bg-gradient-to-t from-black/95 via-black/50 to-transparent z-20 flex flex-col justify-end">
                        <span className="text-[#00F2FF] font-black text-[9px] md:text-[12px] uppercase tracking-[0.3em] md:tracking-[0.4em] mb-2 md:mb-3 block drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]">Standard Excellency</span>
                        <h2 className="text-2xl sm:text-4xl md:text-6xl font-black text-white uppercase tracking-tighter drop-shadow-lg">Suítes Executivas</h2>
                    </div>
                </motion.div>

                {/* Erro do fluxo de check-out (visível, nunca só em consola) */}
                <AnimatePresence>
                    {checkoutError && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="p-4 md:p-5 bg-rose-500/10 border border-rose-400/30 rounded-2xl flex items-start justify-between gap-4"
                        >
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                                <p className="text-xs text-rose-100/85 leading-relaxed">{checkoutError}</p>
                            </div>
                            <button
                                onClick={() => setCheckoutError(null)}
                                className="text-rose-300/60 hover:text-rose-200 text-sm font-bold leading-none"
                                aria-label="Fechar erro"
                            >
                                &times;
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10">
                    {[
                        { label: 'Check-ins Hoje', value: kpis?.checkins ?? '—', icon: Calendar, color: '#00F2FF' },
                        { label: 'Quartos Livres', value: kpis?.livres ?? '—', icon: Home, color: '#10B981' },
                        { label: 'A chegar', value: kpis?.aChegar ?? '—', icon: Users, color: '#8B5CF6' },
                        { label: 'Chaves Ativas', value: kpis?.chaves ?? '—', icon: Key, color: '#F59E0B' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-[#111111] border border-white/10 p-5 md:p-10 lg:p-12 rounded-[20px] md:rounded-[40px] lg:rounded-[50px] shadow-2xl group hover:border-[#00F2FF]/40 transition-all">
                            <div className="flex justify-between items-start mb-5 md:mb-10 lg:mb-12">
                                <div className="p-3 md:p-4 lg:p-5 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 group-hover:border-[#00F2FF]/20 transition-all">
                                    <stat.icon className="w-4 h-4 md:w-6 md:h-6 lg:w-8 lg:h-8" style={{ color: stat.color }} />
                                </div>
                            </div>
                            <p className="text-2xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter mb-2 md:mb-4 tabular-nums">{stat.value}</p>
                            <p className="text-[9px] md:text-[10px] lg:text-[11px] font-black text-white/30 uppercase tracking-[0.3em] md:tracking-[0.4em]">{stat.label}</p>
                        </div>
                    ))}
                </div>

                <div id="room-map">
                    <RoomBoard onSelectRoom={handleSelectRoom} />
                </div>

                {/* Central de reservas: visualização, cancelamento e reativação */}
                <ReservationsPanel />

                {/* Feedback inline do CHECK-OUT (sem extrato carregado) */}
                <AnimatePresence>
                    {checkoutHint && (
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 30 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[260] px-6 py-4 bg-[#0A0A0A] border border-[#00F2FF]/40 rounded-2xl shadow-[0_0_30px_rgba(0,242,255,0.2)] flex items-center gap-4 max-w-[90vw]"
                        >
                            <span className="w-2 h-2 rounded-full bg-[#00F2FF] animate-pulse shadow-[0_0_10px_#00F2FF] flex-shrink-0" />
                            <p className="text-[10px] font-black text-white uppercase tracking-widest">
                                CHECK-OUT: selecione um quarto <span className="text-[#00F2FF]">ocupado</span> no mapa para consolidar o extrato
                            </p>
                            <button onClick={() => setCheckoutHint(false)} className="text-white/30 hover:text-white text-sm font-bold flex-shrink-0">&times;</button>
                        </motion.div>
                    )}
                </AnimatePresence>

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
                        <div className="fixed inset-0 z-[200] flex justify-center items-center px-4 print:hidden">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={fecharCheckout}
                                className="absolute inset-0 bg-black/95 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="relative w-full max-w-[960px] max-h-[88vh]"
                            >
                                <CheckoutConsolidated
                                    guestName={checkoutData.guestName}
                                    roomNumber={checkoutData.roomNumber}
                                    periodo={checkoutData.periodo}
                                    cliente={checkoutData.cliente}
                                    invoiceNumber={checkoutData.invoiceNumber}
                                    auditToken={checkoutData.auditToken}
                                    items={checkoutData.linhas}
                                    taxes={checkoutData.taxes}
                                    onFinalize={handleFinalizeCheckout}
                                    onPrint={imprimirFatura}
                                    onClose={fecharCheckout}
                                />
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Folha da fatura/extrato — só existe para o papel (`hidden print:block`). */}
            {showCheckout && fatura && (
                <FaturaPrintSheet
                    formato={fatura.formato}
                    dados={fatura.dados}
                    impresso={fatura.impresso}
                />
            )}
        </DashboardLayout>
    );
}
