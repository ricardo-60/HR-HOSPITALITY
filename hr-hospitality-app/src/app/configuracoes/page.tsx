'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_TENANT } from '@/config/tenants';
import {
    Settings, Building2, Wifi, Users, Database, Shield,
    CheckCircle, AlertTriangle, Server, Globe, Key,
    Monitor, RefreshCw
} from 'lucide-react';

export default function ConfiguracoesPage() {
    const { user, users } = useAuth();
    const [activeTab, setActiveTab] = useState<'hotel' | 'rede' | 'sistema' | 'modulos'>('hotel');

    const tabs = [
        { id: 'hotel' as const, label: 'Hotel', icon: Building2 },
        { id: 'rede' as const, label: 'Rede', icon: Wifi },
        { id: 'sistema' as const, label: 'Sistema', icon: Server },
        { id: 'modulos' as const, label: 'Módulos', icon: Monitor },
    ];

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                                <Settings className="w-6 h-6 text-[var(--brand-primary)]" />
                            </div>
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                    CONFIGURAÇÕES
                                </h1>
                                <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                    GESTÃO CENTRAL DO SISTEMA
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3" />
                </motion.div>

                {/* Tabs */}
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'hotel' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Hotel Info */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Building2 className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Dados do Hotel</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Nome</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-bold">
                                            {DEFAULT_TENANT.name}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Slogan</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                            {DEFAULT_TENANT.slogan}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Client ID</label>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                                {DEFAULT_TENANT.id}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Moeda</label>
                                            <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                                {DEFAULT_TENANT.currency}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Endereço</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                            AVENIDA 21 DE JANEIRO, BENFICA, LUANDA
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">NIF</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                            5484045614
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Brand Colors */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Globe className="w-5 h-5 text-[var(--brand-accent)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Cores da Marca</h3>
                                </div>

                                <div className="space-y-4">
                                    {Object.entries(DEFAULT_TENANT.colors).map(([name, color]) => (
                                        <div key={name} className="flex items-center gap-4">
                                            <div
                                                className="w-12 h-12 rounded-xl border-2 border-white/10 shadow-lg"
                                                style={{ backgroundColor: color }}
                                            />
                                            <div className="flex-1">
                                                <p className="text-xs font-black text-white/60 uppercase tracking-wider">{name}</p>
                                                <p className="text-sm font-mono text-white/80">{color}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'rede' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Network Mode */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Wifi className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Modo de Rede</h3>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        <div>
                                            <p className="text-sm font-black text-white">Modo Online (Supabase Cloud)</p>
                                            <p className="text-xs text-white/50">Base de dados na nuvem ativa</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">URL do Supabase</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono truncate">
                                            zqmtxxjoocwhaodlnhxg.supabase.co
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Estado Realtime (WebSocket)</label>
                                        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                                            <div>
                                                <p className="text-sm font-black text-amber-400">Desconectado</p>
                                                <p className="text-xs text-white/50">DNS não resolve (ERR_NAME_NOT_RESOLVED)</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Modo Local (SQLite)</label>
                                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
                                            <Database className="w-5 h-5 text-white/30" />
                                            <div>
                                                <p className="text-sm font-black text-white/70">Offline-First disponível</p>
                                                <p className="text-xs text-white/40">Banco local hospitality_local.db</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Network Config */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Server className="w-5 h-5 text-[var(--brand-accent)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Configuração de Rede</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Modo</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                                            Servidor (Porta 3002)
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">IP da Máquina</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                            192.168.1.x
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Frontend</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                            http://localhost:3000
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Backend Express</label>
                                        <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-mono">
                                            http://localhost:3002
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sistema' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* System Status */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Shield className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Estado do Sistema</h3>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { name: 'Frontend Next.js', status: 'ONLINE', ok: true },
                                        { name: 'Supabase REST API', status: 'ONLINE', ok: true },
                                        { name: 'Supabase Realtime', status: 'OFFLINE', ok: false },
                                        { name: 'SQLite Local', status: 'DISPONÍVEL', ok: true },
                                        { name: 'Electron Desktop', status: 'DISPONÍVEL', ok: true },
                                    ].map((item) => (
                                        <div key={item.name} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                                            <span className="text-sm font-bold text-white/80">{item.name}</span>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                item.ok
                                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                                            }`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Users Summary */}
                            <div className="glass-panel p-8 rounded-[28px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Users className="w-5 h-5 text-[var(--brand-secondary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">Utilizadores</h3>
                                </div>

                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                        <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-center">
                                            <p className="text-2xl font-black text-[var(--brand-primary)]">{users.length}</p>
                                            <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Total</p>
                                        </div>
                                        <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-center">
                                            <p className="text-2xl font-black text-emerald-400">{users.filter(u => u.status === 'ATIVO').length}</p>
                                            <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Ativos</p>
                                        </div>
                                        <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-center">
                                            <p className="text-2xl font-black text-red-400">{users.filter(u => u.status === 'BLOQUEADO').length}</p>
                                            <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Bloqueados</p>
                                        </div>
                                    </div>

                                    {users.map((u) => (
                                        <div key={u.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${u.status === 'ATIVO' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                <div>
                                                    <p className="text-sm font-bold text-white/80">{u.name}</p>
                                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-wider">{u.role}</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-mono text-white/40">{u.id}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'modulos' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {[
                                { name: 'ALOJAMENTO', desc: 'Check-in/Check-out, Quartos, Reservas', status: 'ATIVO', path: '/alojamento' },
                                { name: 'RESTAURAÇÃO', desc: 'POS, Gastronomia, Faturação', status: 'ATIVO', path: '/pos' },
                                { name: 'SNACK BAR', desc: 'Terminal Rápido, Mesas, Consumos', status: 'ATIVO', path: '/snack-bar' },
                                { name: 'EVENTOS', desc: 'Salas, Reservas, Catering', status: 'ATIVO', path: '/eventos' },
                                { name: 'BEM-ESTAR', desc: 'Spa, Ginásio, Piscina', status: 'ATIVO', path: '/spa' },
                                { name: 'LAVANDARIA', desc: 'Ordens, Entregas, Stock', status: 'ATIVO', path: '/lavandaria' },
                                { name: 'TRANSFER', desc: 'Transporte VIP, Aeroporto', status: 'ATIVO', path: '/transfer' },
                                { name: 'PARQUE', desc: 'Estacionamento, CCTV, Vigilância', status: 'ATIVO', path: '/parque' },
                                { name: 'RECURSOS HUMANOS', desc: 'Staff, Férias, Salários, Escalas', status: 'ATIVO', path: '/rh' },
                            ].map((mod) => (
                                <div key={mod.name} className="glass-panel p-6 rounded-[24px] border border-white/5 hover:border-[var(--brand-primary)]/30 transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <h4 className="text-sm font-black text-white uppercase tracking-wider group-hover:text-[var(--brand-primary)] transition-colors">
                                            {mod.name}
                                        </h4>
                                        <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                            {mod.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/40 leading-relaxed">{mod.desc}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Footer */}
                <div className="text-center text-xs text-white/20 pt-10 border-t border-white/5 uppercase tracking-widest">
                    POWERED BY HR-TECNOLOGIA | CEO HERMENEGILDO RICARDO
                </div>
            </div>
        </DashboardLayout>
    );
}
