/* eslint-disable */
'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Shirt, Clock, CheckCircle2, AlertCircle, RefreshCw, Plus, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LaundryOrder {
    id: string;
    room: string;
    guest: string;
    items: number;
    type: string;
    status: 'RECOLHIDO' | 'EM LAVAGEM' | 'PRONTO' | 'ENTREGUE';
    submittedAt: string;
    readyAt?: string;
}

const seedOrders: LaundryOrder[] = [
    { id: 'LAV-001', room: '101', guest: 'Carlos Mendes', items: 4, type: 'NORMAL', status: 'ENTREGUE', submittedAt: '08:00', readyAt: '14:00' },
    { id: 'LAV-002', room: '205', guest: 'Ana Silva', items: 2, type: 'EXPRESS', status: 'PRONTO', submittedAt: '09:30', readyAt: '12:30' },
    { id: 'LAV-003', room: '312', guest: 'João Baptista', items: 6, type: 'NORMAL', status: 'EM LAVAGEM', submittedAt: '10:15' },
    { id: 'LAV-004', room: '108', guest: 'Maria Santos', items: 3, type: 'DELICADO', status: 'RECOLHIDO', submittedAt: '11:00' },
    { id: 'LAV-005', room: '401', guest: 'Pedro Alves', items: 5, type: 'EXPRESS', status: 'EM LAVAGEM', submittedAt: '11:45' },
    { id: 'LAV-006', room: '220', guest: 'Sofia Nunes', items: 2, type: 'NORMAL', status: 'PRONTO', submittedAt: '07:30', readyAt: '13:30' },
];

const statusConfig = {
    'RECOLHIDO':   { color: 'text-amber-400 border-amber-400/30 bg-amber-400/10', dot: 'bg-amber-400', icon: Package },
    'EM LAVAGEM':  { color: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10', dot: 'bg-cyan-400', icon: RefreshCw },
    'PRONTO':      { color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10', dot: 'bg-emerald-400', icon: CheckCircle2 },
    'ENTREGUE':    { color: 'text-white/30 border-white/10 bg-white/5', dot: 'bg-white/20', icon: CheckCircle2 },
};

export default function LavandariaPage() {
    const [activeFilter, setActiveFilter] = useState<string>('TODOS');
    const filters = ['TODOS', 'RECOLHIDO', 'EM LAVAGEM', 'PRONTO', 'ENTREGUE'];

    // Lista em estado (seed = array base), persistida em localStorage
    const [orders, setOrders] = useState<LaundryOrder[]>(seedOrders);
    useEffect(() => {
        try {
            const guardadas = JSON.parse(localStorage.getItem('lavandaria_ordens') || 'null');
            if (Array.isArray(guardadas) && guardadas.length > 0) setOrders(guardadas);
        } catch { /* ignorar dados inválidos */ }
    }, []);

    const guardarOrdens = (lista: LaundryOrder[]) => {
        setOrders(lista);
        localStorage.setItem('lavandaria_ordens', JSON.stringify(lista));
    };

    const alterarStatusOrdem = (id: string, novo: LaundryOrder['status']) => {
        guardarOrdens(orders.map(o => o.id === id
            ? { ...o, status: novo, readyAt: novo === 'PRONTO' || novo === 'ENTREGUE' ? new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : o.readyAt }
            : o));
    };

    // Modal "Nova Ordem"
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ room: '', guest: '', items: '1', type: 'NORMAL' });

    const criarOrdem = (e: React.FormEvent) => {
        e.preventDefault();
        const nItens = parseInt(form.items, 10);
        if (!form.room.trim() || !form.guest.trim() || !nItens || nItens < 1) return;
        const nova: LaundryOrder = {
            id: `LAV-${Date.now().toString().slice(-6)}`,
            room: form.room.trim(),
            guest: form.guest.trim(),
            items: nItens,
            type: form.type,
            status: 'RECOLHIDO',
            submittedAt: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        };
        guardarOrdens([nova, ...orders]);
        setForm({ room: '', guest: '', items: '1', type: 'NORMAL' });
        setShowModal(false);
    };

    const recolhidos = orders.filter(o => o.status === 'RECOLHIDO').length;
    const emLavagem = orders.filter(o => o.status === 'EM LAVAGEM').length;
    const prontos = orders.filter(o => o.status === 'PRONTO').length;
    const entregues = orders.filter(o => o.status === 'ENTREGUE').length;

    const filtered = activeFilter === 'TODOS' ? orders : orders.filter(o => o.status === activeFilter);

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-14 pb-20 px-4">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-10 border-b border-white/5 pb-14">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-1.5 h-6 bg-[var(--brand-primary)] shadow-[0_0_15px_var(--brand-primary)]" />
                            <span className="text-[10px] font-black text-[var(--brand-primary)] uppercase tracking-[0.6em]">Laundry Operations • Active</span>
                        </div>
                        <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-none uppercase">
                            LAVAN<span className="text-[var(--brand-primary)]">DARIA</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.8em] text-[11px] mt-8 max-w-lg leading-relaxed">
                            HR-HOSPITALITY LAUNDRY MANAGEMENT • GUEST SERVICE
                        </p>
                    </div>
                    <button onClick={() => setShowModal(true)} className="flex items-center gap-3 px-8 py-5 bg-[var(--brand-primary)] text-white font-black text-[10px] uppercase tracking-[0.4em] rounded-[24px] hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,71,171,0.3)]">
                        <Plus className="w-4 h-4" />Nova Ordem
                    </button>
                </motion.div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { label: 'Recolhidos', value: recolhidos, color: '#F59E0B', bg: 'bg-amber-400/10 border-amber-400/20' },
                        { label: 'Em Lavagem', value: emLavagem, color: '#22D3EE', bg: 'bg-cyan-400/10 border-cyan-400/20' },
                        { label: 'Prontos', value: prontos, color: '#10B981', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                        { label: 'Entregues Hoje', value: entregues, color: '#ffffff', bg: 'bg-white/5 border-white/10' },
                    ].map((stat, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                            className={`border p-8 rounded-[32px] shadow-xl ${stat.bg}`}>
                            <p className="text-4xl font-black tabular-nums mb-2" style={{ color: stat.color }}>{stat.value}</p>
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">{stat.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-3">
                    {filters.map(f => (
                        <button key={f} onClick={() => setActiveFilter(f)}
                            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeFilter === f
                                    ? 'bg-[var(--brand-primary)] text-white shadow-[0_0_20px_rgba(0,71,171,0.3)]'
                                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white hover:border-white/20'
                            }`}>{f}</button>
                    ))}
                </div>

                {/* Orders List */}
                <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((order, i) => {
                            const cfg = statusConfig[order.status];
                            const Icon = cfg.icon;
                            return (
                                <motion.div key={order.id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: 0.04 * i }}
                                    className="glass-panel rounded-[24px] border border-white/10 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 hover:border-white/20 transition-all group"
                                >
                                    {/* ID & Room */}
                                    <div className="flex items-center gap-4 min-w-[180px]">
                                        <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                                            <Shirt className="w-5 h-5 text-white/40 group-hover:text-[var(--brand-primary)] transition-colors" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white tracking-widest">{order.id}</p>
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Quarto {order.room}</p>
                                        </div>
                                    </div>

                                    {/* Guest */}
                                    <div className="flex-1">
                                        <p className="text-sm font-black text-white uppercase tracking-tight">{order.guest}</p>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="text-[10px] font-black text-white/30 uppercase">{order.items} peças</span>
                                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-widest">{order.type}</span>
                                        </div>
                                    </div>

                                    {/* Time */}
                                    <div className="flex items-center gap-2 text-white/30">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase">{order.submittedAt}{order.readyAt ? ` → ${order.readyAt}` : ''}</span>
                                    </div>

                                    {/* Status Badge */}
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>
                                        <div className={`w-2 h-2 rounded-full ${cfg.dot} ${order.status === 'EM LAVAGEM' ? 'animate-pulse' : ''}`} />
                                        {order.status}
                                    </div>

                                    {/* Action */}
                                    {order.status === 'PRONTO' && (
                                        <button onClick={() => alterarStatusOrdem(order.id, 'ENTREGUE')} className="px-5 py-2 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] whitespace-nowrap">
                                            Marcar Entregue
                                        </button>
                                    )}
                                    {order.status === 'RECOLHIDO' && (
                                        <button onClick={() => alterarStatusOrdem(order.id, 'EM LAVAGEM')} className="flex items-center gap-2 px-5 py-2 bg-cyan-400 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] whitespace-nowrap">
                                            <RefreshCw className="w-3 h-3" /> Iniciar Lavagem
                                        </button>
                                    )}
                                    {order.status === 'EM LAVAGEM' && (
                                        <button onClick={() => alterarStatusOrdem(order.id, 'PRONTO')} className="flex items-center gap-2 px-5 py-2 bg-white/10 border border-white/20 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-white/20 transition-all whitespace-nowrap">
                                            <CheckCircle2 className="w-3 h-3" /> Marcar Pronto
                                        </button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Alert Banner */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                    className="flex items-center gap-6 bg-amber-400/5 border border-amber-400/20 p-6 rounded-[24px]">
                    <AlertCircle className="w-6 h-6 text-amber-400 flex-shrink-0 animate-pulse" />
                    <div>
                        <p className="text-sm font-black text-amber-400 uppercase tracking-widest">Alerta de Capacidade</p>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">
                            {emLavagem} ordens em lavagem simultânea • Capacidade máxima: 8 ordens
                        </p>
                    </div>
                </motion.div>
            </div>

            {/* Modal Nova Ordem */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.form
                            onSubmit={criarOrdem}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between border-b border-white/5 pb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-5 bg-[var(--brand-primary)] shadow-[0_0_10px_var(--brand-primary)]" />
                                    <h3 className="text-lg font-black text-white uppercase tracking-widest">Nova Ordem de Lavandaria</h3>
                                </div>
                                <button type="button" onClick={() => setShowModal(false)} className="text-white/30 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Quarto</label>
                                    <input type="text" required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}
                                        placeholder="Ex: 205"
                                        className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[var(--brand-primary)] transition-all font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Nº Itens</label>
                                    <input type="number" min={1} required value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[var(--brand-primary)] transition-all font-bold tabular-nums" />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Hóspede</label>
                                    <input type="text" required value={form.guest} onChange={(e) => setForm({ ...form, guest: e.target.value })}
                                        placeholder="Ex: Maria Santos"
                                        className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[var(--brand-primary)] transition-all font-bold" />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-1">Tipo</label>
                                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-[var(--brand-primary)] transition-all font-bold">
                                        <option value="NORMAL" className="bg-[#0A0A0A]">Normal</option>
                                        <option value="EXPRESS" className="bg-[#0A0A0A]">Express</option>
                                        <option value="DELICADO" className="bg-[#0A0A0A]">Delicado</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-4 bg-white/5 border border-white/10 text-white/60 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all">
                                    Cancelar
                                </button>
                                <button type="submit"
                                    className="flex-1 px-6 py-4 bg-[var(--brand-primary)] text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,71,171,0.3)]">
                                    Criar Ordem
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
}
