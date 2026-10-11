/* eslint-disable */
'use client';

import { motion } from 'framer-motion';
import { Ban, Calendar, CheckCircle2, Home, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ReservationsPanel } from '@/components/alojamento/ReservationsPanel';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useRoomSync } from '@/lib/roomEvents';
import { supabase } from '@/lib/supabase';

interface Stats {
    activas: number;
    checkInsHoje: number;
    canceladas: number;
    quartosOcupados: number;
}

const EMPTY: Stats = { activas: 0, checkInsHoje: 0, canceladas: 0, quartosOcupados: 0 };

export default function ReservasPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const [reservasRes, quartosRes] = await Promise.all([
                supabase.from('hotel_reservations').select('status, check_in_date'),
                supabase.from('hotel_rooms').select('status'),
            ]);

            if (reservasRes.error || !reservasRes.data) {
                setLoadError(reservasRes.error?.message || 'Não foi possível carregar as reservas.');
                setStats(EMPTY);
                return;
            }

            const reservas = reservasRes.data as { status: string; check_in_date: string | null }[];
            const quartos = (!quartosRes.error && quartosRes.data
                ? quartosRes.data
                : []) as { status: string }[];

            setLoadError(null);
            setStats({
                activas: reservas.filter(r => ['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN'].includes(r.status)).length,
                checkInsHoje: reservas.filter(r => r.check_in_date === hoje && r.status !== 'CANCELADA').length,
                canceladas: reservas.filter(r => r.status === 'CANCELADA').length,
                quartosOcupados: quartos.filter(q => q.status === 'OCUPADO').length,
            });
        } catch {
            setStats(EMPTY);
        }
    }, []);

    useEffect(() => {
        void loadStats();
    }, [loadStats]);

    // Cancelar/reativar no painel emite o evento — os KPIs seguem sem reload.
    useRoomSync(loadStats, { intervalMs: 20000 });

    const cards = [
        { label: 'Reservas Activas', value: stats?.activas ?? '—', icon: Calendar, color: '#00F2FF' },
        { label: 'Check-ins Hoje', value: stats?.checkInsHoje ?? '—', icon: CheckCircle2, color: '#10B981' },
        { label: 'Canceladas', value: stats?.canceladas ?? '—', icon: Ban, color: '#F43F5E' },
        { label: 'Quartos Ocupados', value: stats?.quartosOcupados ?? '—', icon: Home, color: '#F59E0B' },
    ];

    const cardGrid = 'grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10';
    const cardBox = 'bg-[#111111] border border-white/10 p-5 md:p-8 rounded-[20px] md:rounded-[36px] shadow-2xl group hover:border-[#00F2FF]/40 transition-all';

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-10 md:space-y-14 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row flex-wrap justify-between items-start md:items-end gap-8 border-b border-white/5 pb-10"
                >
                    <div>
                        <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-8">
                            <div className="w-1.5 h-5 md:h-6 bg-[#F43F5E] shadow-[0_0_15px_#F43F5E]" />
                            <span className="text-[9px] md:text-[10px] font-black text-[#F43F5E] uppercase tracking-[0.4em] md:tracking-[0.6em]">
                                Reservations Control • Active
                            </span>
                        </div>
                        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            RESER<span className="text-[#F43F5E]">VAS</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.5em] md:tracking-[0.8em] text-[10px] md:text-[11px] mt-6 max-w-xl leading-relaxed">
                            Central de marcações do portal e da recepção — cancelar, desmarcar e reativar reservas
                        </p>
                    </div>
                    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-white/10 bg-white/5">
                        <Users className="w-4 h-4 text-white/40" />
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                            Referência obrigatória a clientes KYC
                        </span>
                    </div>
                </motion.div>

                {loadError && (
                    <div className="p-4 bg-rose-500/10 border border-rose-400/30 rounded-2xl text-xs text-rose-100/85">
                        {loadError}
                    </div>
                )}

                <div className={cardGrid}>
                    {cards.map((stat, i) => (
                        <div key={i} className={cardBox}>
                            <div className="flex justify-between items-start mb-5 md:mb-8">
                                <div className="p-3 md:p-4 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 group-hover:border-[#00F2FF]/20 transition-all">
                                    <stat.icon className="w-4 h-4 md:w-6 md:h-6" style={{ color: stat.color }} />
                                </div>
                            </div>
                            <p className="text-2xl md:text-4xl font-black text-white tracking-tighter mb-2 tabular-nums">
                                {stat.value}
                            </p>
                            <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>

                <ReservationsPanel title="Central de Reservas & Marcações" />
            </div>
        </DashboardLayout>
    );
}
