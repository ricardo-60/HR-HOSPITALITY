'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GestroCard } from '@/components/dashboard/GestroCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { OccupancyPanel } from '@/components/dashboard/OccupancyPanel';
import { Users, Zap, Shield, Globe, AlertTriangle, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TENANT } from '@/config/tenants';
import { PendingLeads } from '@/components/dashboard/PendingLeads';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRoomSync } from '@/lib/roomEvents';
import { inventoryItems } from '@/app/logistica/page';
import { parkingSlots } from '@/app/parque/page';

export default function DashboardPage() {
  const { user } = useAuth();
  const [hospedesAtivos, setHospedesAtivos] = useState<string | null>(null);
  const [reservasActivas, setReservasActivas] = useState<string | null>(null);

  // Valores reais derivados dos dados da aplicação (nunca fixos)
  const alertasEconomato = inventoryItems.filter(i => i.status !== 'OK').length;
  const ocupacaoParque = parkingSlots.length
    ? Math.round((parkingSlots.filter(s => s.status === 'OCUPADO').length / parkingSlots.length) * 100)
    : 0;

  const loadHeadcount = useCallback(async () => {
    try {
      const [roomsRes, reservasRes] = await Promise.all([
        supabase.from('hotel_rooms').select('status'),
        supabase.from('hotel_reservations').select('status'),
      ]);
      if (roomsRes.error || !roomsRes.data) return;
      const rooms = roomsRes.data as { status: string }[];
      const reservas = reservasRes.error ? [] : ((reservasRes.data ?? []) as { status: string }[]);
      setHospedesAtivos(String(rooms.filter(r => r.status === 'OCUPADO').length));
      setReservasActivas(String(
        reservas.filter(r => ['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN'].includes(r.status)).length
      ));
    } catch {
      /* offline: manter '—' */
    }
  }, []);

  useEffect(() => {
    // Carregamento diferido (mesmo padrão das outras páginas) para não
    // encadear renders síncronos no effect.
    const timer = window.setTimeout(() => { void loadHeadcount(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHeadcount]);

  // Check-in / check-out / cancelações actualizam os KPIs sem reload.
  useRoomSync(loadHeadcount);

  return (
    <DashboardLayout>
      <div className="space-y-12 md:space-y-16 lg:space-y-20 pb-24">
        {/* Dynamic Responsive Header with Lukweku Branding */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 border-b border-white/10 pb-8 md:pb-12"
        >
          <div className="max-w-full overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 md:mb-6 relative z-10 w-full flex-wrap">
              <div className="flex gap-2">
                <div className="w-1.5 h-6 md:h-8 bg-[var(--brand-primary)] rounded-full shadow-[0_0_10px_var(--brand-primary)]" />
                <div className="w-1.5 h-6 md:h-8 bg-[var(--brand-secondary)] rounded-full shadow-[0_0_10px_var(--brand-secondary)]" />
              </div>
              <span className="text-sm md:text-base lg:text-lg font-sans font-light text-white/90 tracking-wide md:tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {DEFAULT_TENANT.slogan}
              </span>
            </div>
            <h1 className="text-4xl sm:text-fluid-h1 font-black text-white tracking-tighter uppercase leading-[0.85] select-none">
              {DEFAULT_TENANT.name.split(' ')[0]}<span className="text-[var(--brand-primary)] drop-shadow-[0_0_12px_var(--brand-primary)] md:ml-6 block md:inline font-light">{DEFAULT_TENANT.name.split(' ')[1]}</span>
            </h1>
            <div className="flex items-center gap-3 mt-6 md:mt-8 opacity-50">
              <Globe className="w-5 h-5 md:w-6 md:h-6 animate-spin-slow text-[var(--brand-primary)]" />
              <p className="text-xs md:text-sm font-black uppercase tracking-luxury truncate">HR-HOSPITALITY PLATFORM • CLIENT: {DEFAULT_TENANT.id}</p>
            </div>
          </div>

          <div className="flex w-full lg:w-auto items-center gap-6 md:gap-8 glass-panel p-6 md:p-8 lg:p-10 rounded-[28px] md:rounded-[32px] shadow-2xl overflow-hidden self-stretch lg:self-auto">
            <div className="flex-1 lg:flex-none lg:text-right">
              <p className="text-[10px] md:text-xs font-black text-white/50 uppercase tracking-widest mb-2">Operator: {user?.name ?? '—'}</p>
              <div className="flex items-center gap-3 lg:justify-end">
                <p className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-widest truncate">SECURE_AUTH_V5</p>
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-emerald-500 shadow-[0_0_12px_#10B981] animate-pulse flex-shrink-0" />
              </div>
            </div>
            <div className="h-16 md:h-20 w-[1px] bg-white/10 hidden sm:block" />
            <div className="p-4 md:p-6 bg-white/5 rounded-2xl md:rounded-3xl border border-white/10 text-cyber-yellow animate-pulse">
              <AlertTriangle className="w-6 h-6 md:w-8 md:h-8 text-[var(--brand-secondary)] drop-shadow-[0_0_10px_var(--brand-secondary)]" />
            </div>
          </div>
        </motion.div>

        {/* Resumo de ocupação: quartos ocupados (com hóspede) e livres */}
        <OccupancyPanel />

        {/* Aprovação manual de reservas vindas do portal + mapa do edifício */}
        <PendingLeads />

        {/* Adaptive Grid: 1 col (mobile), 2 cols (tablet), 4 cols (desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-8 lg:gap-10">
          <GestroCard label="HÓSPEDES ATIVOS" value={hospedesAtivos ?? '—'} icon={Users} trend="Quartos Ocupados" color="var(--brand-primary)" />
          <GestroCard label="RESERVAS ACTIVAS" value={reservasActivas ?? '—'} icon={Zap} trend="Portal + Recepção" color="var(--brand-secondary)" />
          <GestroCard label="ALERTA ECONOMATO" value={String(alertasEconomato).padStart(2, '0')} icon={Package} trend="Crítico/Validade" color="#10B981" />
          <GestroCard label="RADAR PARQUE" value={`${ocupacaoParque}%`} icon={Shield} trend="Taxa de Ocupação" color="var(--brand-accent)" />
        </div>

        {/* Central de pedidos online e reservas (actividade real) */}
        <ActivityFeed />
      </div>
    </DashboardLayout>
  );
}
