'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GestroCard } from '@/components/dashboard/GestroCard';
import { Users, Zap, Shield, Activity, Globe, ChevronRight, AlertTriangle, Package, ListTodo } from 'lucide-react';
import { motion } from 'framer-motion';
import { DEFAULT_TENANT } from '@/config/tenants';
import { PendingLeads } from '@/components/dashboard/PendingLeads';

const logItems = [
  { id: 'LOG-8842', action: 'CHECK-IN CONCLUÍDO', location: 'QUARTO 101', time: '09:42:01', status: 'SUCCESS', operator: 'R. Ferreira' },
  { id: 'LOG-8841', action: 'PEDIDO BAR TRANSMITIDO', location: 'SNACK BAR', time: '09:38:15', status: 'ACTIVE', operator: 'J. Manuel' },
  { id: 'LOG-8840', action: 'ACESSO GINÁSIO VALIDADO', location: 'GENTLEMAN GYM', time: '09:35:00', status: 'SUCCESS', operator: 'System' },
  { id: 'LOG-8839', action: 'SAÍDA VIATURA (HB-42-TR)', location: 'PARKING A-01', time: '09:30:12', status: 'ARCHIVED', operator: 'Guard_01' },
  { id: 'LOG-8838', action: 'ALERTA STOCK: GIN PREMIUM', location: 'ECONOMATO', time: '09:25:44', status: 'WARNING', operator: 'Logistics' },
];

export default function DashboardPage() {
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
              <p className="text-[10px] md:text-xs font-black text-white/50 uppercase tracking-widest mb-2">Operator: R. Ferreira</p>
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

        {/* Manual Approval Leads Stream (Lukweku Core Logic) */}
        <PendingLeads />

        {/* Adaptive Grid: 1 col (mobile), 2 cols (tablet), 4 cols (desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-8 lg:gap-10">
          <GestroCard label="HÓSPEDES ATIVOS" value="148" icon={Users} trend="+12 Tracking" color="var(--brand-primary)" />
          <GestroCard label="ALERTA ECONOMATO" value="03" icon={Package} trend="Near Expiry" color="var(--brand-secondary)" />
          <GestroCard label="RADAR PARQUE" value="92%" icon={Shield} trend="Secured Asset" color="#10B981" />
          <GestroCard label="TERMINAIS" value="ONLINE" icon={Zap} trend="Security Mesh" color="var(--brand-accent)" />
        </div>

        {/* Responsive Operational Logs Table/Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-[32px] md:rounded-[40px] overflow-hidden shadow-2xl border border-white/10"
        >
          <div className="p-6 md:p-8 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/[0.02]">
            <div className="flex items-center gap-4 md:gap-5">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                <ListTodo className="w-6 h-6 md:w-7 md:h-7 text-[var(--brand-primary)]" />
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">Operational Streams</h3>
                <p className="text-xs md:text-sm font-black text-white/30 uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 md:mt-2">Real-time Intelligence Flow</p>
              </div>
            </div>
            <button className="w-full md:w-auto px-6 py-3 md:px-8 md:py-4 bg-white/5 border border-white/10 rounded-2xl md:rounded-[20px] text-xs md:text-sm font-black text-white/70 uppercase tracking-widest hover:bg-[var(--brand-primary)] hover:text-black hover:border-[var(--brand-primary)] transition-all duration-300 flex items-center justify-center gap-3 lg:gap-4 group shadow-lg">
              Global Logs Access <ChevronRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 sm:group-hover:translate-x-2 transition-transform" />
            </button>
          </div>

          <div className="overflow-x-auto min-w-full pb-2 md:pb-0">
            <table className="w-full text-left responsive-table">
              <thead>
                <tr className="bg-white/[0.01]">
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em] whitespace-nowrap">Event ID</th>
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em]">Activity</th>
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em] whitespace-nowrap">Operational Point</th>
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em]">Operator</th>
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em]">Timeline</th>
                  <th className="px-6 py-4 md:px-12 md:py-8 text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em] whitespace-nowrap">Security Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {logItems.map((log) => (
                  <tr key={log.id} className="group hover:bg-white/[0.03] transition-colors">
                    <td data-label="Event ID" className="px-6 py-4 md:px-12 md:py-6">
                      <span className="text-white/40 font-black text-xs md:text-sm tracking-widest font-mono group-hover:text-white/60">{log.id}</span>
                    </td>
                    <td data-label="Activity" className="px-6 py-4 md:px-12 md:py-6 min-w-[200px]">
                      <p className="font-black text-xs md:text-sm uppercase tracking-widest text-white/90 group-hover:text-[var(--brand-primary)] transition-all">
                        {log.action}
                      </p>
                    </td>
                    <td data-label="Operational Point" className="px-6 py-4 md:px-12 md:py-6">
                      <div className="flex items-center gap-3 md:gap-4">
                        <Activity className="w-5 h-5 text-white/20" />
                        <span className="text-white/60 font-black text-xs md:text-sm tracking-widest uppercase truncate">{log.location}</span>
                      </div>
                    </td>
                    <td data-label="Operator" className="px-6 py-4 md:px-12 md:py-6">
                      <span className="text-[var(--brand-primary)]/80 font-black text-[10px] md:text-xs tracking-widest uppercase">{log.operator}</span>
                    </td>
                    <td data-label="Timeline" className="px-6 py-3 md:px-8 md:py-5">
                      <span className="text-white/50 font-black text-xs md:text-sm tracking-widest tabular-nums">{log.time}</span>
                    </td>
                    <td data-label="Security Status" className="px-6 py-4 md:px-12 md:py-6">
                      <div className={`px-4 md:px-5 py-2 md:py-2.5 rounded-full border text-[9px] md:text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center ${log.status === 'SUCCESS' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' :
                        log.status === 'WARNING' ? 'text-[var(--brand-secondary)] border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/10' :
                          'text-[var(--brand-primary)] border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10'
                        }`}>
                        {log.status}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
 
          <div className="p-8 md:p-10 bg-black/20 flex justify-center text-center">
            <p className="text-[9px] md:text-xs font-black text-white/20 uppercase tracking-[0.5em] md:tracking-[0.8em] animate-pulse">End of Encrypted Content Stream</p>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
