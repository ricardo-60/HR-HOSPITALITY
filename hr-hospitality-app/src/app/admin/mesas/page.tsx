'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, Edit, GripVertical, Save, X, ChevronDown, ChevronUp,
    Layout, Square, Maximize2, Minimize2, Eye, Palette
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { localOperation, localQuery } from '@/lib/db/localDB';

interface PosTable {
    id: string;
    code: string;
    name: string;
    zone: string;
    seats: number;
    status: 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'MANUTENCAO';
    sort_order: number;
}

type TableZone = string;
type TableStatus = 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'MANUTENCAO';

const ZONE_LABELS: Record<string, string> = {
    SNACK_BAR: 'Snack-Bar',
    BALCAO: 'Balcão',
    ESPLANADA: 'Esplanada',
    PISCINA: 'Piscina',
    RESTAURANTE: 'Restaurante',
};

const STATUS_LABELS: Record<TableStatus, string> = {
    LIVRE: 'Livre',
    OCUPADA: 'Ocupada',
    RESERVADA: 'Reservada',
    MANUTENCAO: 'Manutenção',
};

const ZONE_COLORS: Record<string, string> = {
    SNACK_BAR: '#00F2FF',
    BALCAO: '#F59E0B',
    ESPLANADA: '#10B981',
    PISCINA: '#3B82F6',
    RESTAURANTE: '#8B5CF6',
};

export default function AdminMesasPage() {
    const [mesas, setMesas] = useState<PosTable[]>([]);
    const [zonas, setZonas] = useState<TableZone[]>(['RESTAURANTE', 'SNACK_BAR', 'ESPLANADA', 'BALCAO', 'PISCINA']);
    const [novaZona, setNovaZona] = useState<TableZone>('RESTAURANTE');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [form, setForm] = useState({ code: '', name: '', zone: 'RESTAURANTE' as TableZone, seats: 4, status: 'LIVRE' as TableStatus, sort_order: 0 });
    const [carregando, setCarregando] = useState(true);

    const carregarMesas = useCallback(async () => {
        try {
            const data = await localQuery<PosTable[]>('pos.listTables', {});
            if (data) {
                setMesas(data.sort((a, b) => (a.zone.localeCompare(b.zone)) || a.sort_order - b.sort_order));
            }
        } catch (e) {
            console.error('Erro ao carregar mesas:', e);
        } finally {
            setCarregando(false);
        }
    }, []);

    const salvarMesa = async () => {
        if (!form.code.trim() || !form.name.trim()) return;
        try {
            if (editandoId) {
                await localOperation('pos.updateTable', { id: editandoId, ...form });
            } else {
                await localOperation('pos.createTable', form);
            }
            setEditandoId(null);
            setForm({ code: '', name: '', zone: 'RESTAURANTE', seats: 4, status: 'LIVRE', sort_order: 0 });
            carregarMesas();
        } catch (e) {
            console.error('Erro ao salvar mesa:', e);
        }
    };

    const excluirMesa = async (id: string) => {
        if (!confirm('Eliminar esta mesa?')) return;
        try {
            await localOperation('pos.deleteTable', { id });
            carregarMesas();
        } catch (e) {
            console.error('Erro ao excluir mesa:', e);
        }
    };

    const iniciarEdicao = (mesa: PosTable) => {
        setEditandoId(mesa.id);
        setForm({
            code: mesa.code,
            name: mesa.name,
            zone: mesa.zone,
            seats: mesa.seats,
            status: mesa.status,
            sort_order: mesa.sort_order,
        });
    };

    const adicionarZona = () => {
        if (!zonas.includes(novaZona)) {
            setZonas([...zonas, novaZona]);
        }
    };

    const removerZona = (zona: TableZone) => {
        if (zonas.length <= 1) return;
        if (mesas.some(m => m.zone === zona)) {
            alert('Não é possível remover zona com mesas associadas.');
            return;
        }
        setZonas(zonas.filter(z => z !== zona));
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1600px] mx-auto space-y-12 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 border-b border-white/10 pb-8"
                >
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <Layout className="w-8 h-8 text-[#00F2FF]" />
                            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
                                Gestão de <span className="text-[#00F2FF]">Mesas & Zonas</span>
                            </h1>
                        </div>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px]">
                            Configuração visual de zonas, mesas e layout do Restaurante/Snack-Bar
                        </p>
                    </div>
                    <button
                        onClick={() => { setEditandoId(null); setForm({ code: '', name: '', zone: 'RESTAURANTE', seats: 4, status: 'LIVRE', sort_order: 0 }); }}
                        className="flex items-center gap-2 px-6 py-3 bg-[#00F2FF] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,242,255,0.3)]"
                    >
                        <Plus className="w-4 h-4" /> Nova Mesa
                    </button>
                </motion.div>

                {/* Zonas */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-6"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black text-white uppercase tracking-wider">Zonas do Restaurante</h2>
                        <div className="flex items-center gap-2">
                            <select
                                value={novaZona}
                                onChange={e => setNovaZona(e.target.value as TableZone)}
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm font-black"
                            >
                                {(['RESTAURANTE', 'SNACK_BAR', 'ESPLANADA', 'BALCAO', 'PISCINA'] as TableZone[]).map(z => (
                                    <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                                ))}
                            </select>
                            <button onClick={adicionarZona} className="px-4 py-2 bg-[#00F2FF]/10 border border-[#00F2FF]/30 text-[#00F2FF] text-xs font-black uppercase rounded-xl hover:bg-[#00F2FF]/20 transition-all">
                                Adicionar
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {zonas.map(zona => (
                            <div key={zona} className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: `${ZONE_COLORS[zona]}20`, border: `1px solid ${ZONE_COLORS[zona]}40` }}>
                                <span className="w-3 h-3 rounded-full" style={{ background: ZONE_COLORS[zona] }} />
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: ZONE_COLORS[zona] }}>{ZONE_LABELS[zona]}</span>
                                <button onClick={() => removerZona(zona)} className="p-1 text-white/40 hover:text-red-400 transition-colors" title="Remover zona">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </motion.section>

                {/* Formulário de Mesa */}
                <AnimatePresence mode="wait">
                    {editandoId !== null || mesas.length === 0 ? (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-[#111111] border border-white/10 rounded-2xl p-6 md:p-8"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-white uppercase tracking-wider">
                                    {editandoId ? 'Editar Mesa' : 'Nova Mesa'}
                                </h3>
                                <button onClick={() => setEditandoId(null)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Código</label>
                                    <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:border-[#00F2FF]/50 focus:outline-none transition-all" placeholder="Ex: MESA-01" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Nome</label>
                                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:border-[#00F2FF]/50 focus:outline-none transition-all" placeholder="Ex: Mesa 01" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Zona</label>
                                    <select value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value as TableZone }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00F2FF]/50 focus:outline-none transition-all">
                                        {zonas.map(z => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Lugares</label>
                                    <input type="number" min={1} max={20} value={form.seats} onChange={e => setForm(f => ({ ...f, seats: parseInt(e.target.value) || 4 }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00F2FF]/50 focus:outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Estado</label>
                                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TableStatus }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00F2FF]/50 focus:outline-none transition-all">
                                        <option value="LIVRE">Livre</option>
                                        <option value="OCUPADA">Ocupada</option>
                                        <option value="RESERVADA">Reservada</option>
                                        <option value="MANUTENCAO">Manutenção</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Ordem</label>
                                    <input type="number" min={0} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00F2FF]/50 focus:outline-none transition-all" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-4 mt-6">
                                <button onClick={() => setEditandoId(null)} className="px-6 py-3 bg-white/5 border border-white/10 text-white/60 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 hover:text-white transition-all">
                                    Cancelar
                                </button>
                                <button onClick={salvarMesa} className="px-6 py-3 bg-[#00F2FF] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,242,255,0.3)]">
                                    <Save className="w-4 h-4 inline mr-2" /> {editandoId ? 'Atualizar' : 'Criar'}
                                </button>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                {/* Lista de Mesas */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <h2 className="text-xl font-black text-white uppercase tracking-wider">Mesas Cadastradas</h2>
                    {carregando ? (
                        <div className="flex justify-center py-12 text-white/40">A carregar mesas...</div>
                    ) : mesas.length === 0 ? (
                        <div className="text-center py-12 text-white/40">
                            <Layout className="w-12 h-12 mx-auto mb-4 text-white/20" />
                            <p>Nenhuma mesa cadastrada. Clique em &apos;Nova Mesa&apos; para começar.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {zonas.map(zona => {
                                const mesasZona = mesas.filter(m => m.zone === zona);
                                if (mesasZona.length === 0) return null;
                                return (
                                    <motion.div key={zona} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: `${ZONE_COLORS[zona]}15`, border: `1px solid ${ZONE_COLORS[zona]}30` }}>
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_COLORS[zona] }} />
                                            <span className="text-sm font-black uppercase tracking-wider" style={{ color: ZONE_COLORS[zona] }}>{ZONE_LABELS[zona]}</span>
                                            <span className="ml-auto text-xs text-white/40">{mesasZona.length} mesa(s)</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                            {mesasZona.map(mesa => (
                                                <motion.div
                                                    key={mesa.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="bg-[#111111] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-lg font-black text-white">{mesa.code}</span>
                                                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full" style={{ background: `${ZONE_COLORS[mesa.zone]}30`, color: ZONE_COLORS[mesa.zone] }}>
                                                                    {ZONE_LABELS[mesa.zone]}
                                                                </span>
                                                            </div>
                                                            <p className="text-white/70 font-medium truncate">{mesa.name}</p>
                                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-white/50">
                                                                <span className="flex items-center gap-1">
                                                                    <Square className="w-3 h-3" />
                                                                    {mesa.seats} lugares
                                                                </span>
                                                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: mesa.status === 'LIVRE' ? '#10B98130' : mesa.status === 'OCUPADA' ? '#F43F5E30' : mesa.status === 'RESERVADA' ? '#F59E0B30' : '#6B728030', color: mesa.status === 'LIVRE' ? '#10B981' : mesa.status === 'OCUPADA' ? '#F43F5E' : mesa.status === 'RESERVADA' ? '#F59E0B' : '#6B7280' }}>
                                                                    {STATUS_LABELS[mesa.status]}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={() => iniciarEdicao(mesa)} className="p-2 hover:bg-white/5 rounded-lg text-white/50 hover:text-[#00F2FF] transition-colors" title="Editar">
                                                                <Edit className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => excluirMesa(mesa.id)} className="p-2 hover:bg-white/5 rounded-lg text-white/50 hover:text-red-400 transition-colors" title="Eliminar">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </motion.section>
            </div>
        </DashboardLayout>
    );
}


