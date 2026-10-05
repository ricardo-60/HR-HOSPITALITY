'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Table } from '@/types';
import { BillModal } from './BillModal';
import { localQuery, localOperation } from '@/lib/db/localDB';
import { X, Table as TableIcon, Users, CreditCard, Home, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface PosTable {
    id: string;
    code: string;
    name: string;
    zone: string;
    seats: number;
    status: 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'MANUTENCAO';
    sort_order: number;
    total?: number;
}

const STATUS_LABELS: Record<string, string> = {
    LIVRE: 'Livre',
    OCUPADA: 'Ocupada',
    RESERVADA: 'Reservada',
    MANUTENCAO: 'Manutenção',
} as const;

const STATUS_COLORS: Record<string, string> = {
    LIVRE: '#10B981',
    OCUPADA: '#F43F5E',
    RESERVADA: '#F59E0B',
    MANUTENCAO: '#6B7280',
} as const;

export function HoloTableMap({ onTableSelect, selectedTableId }: { 
    onTableSelect?: (table: PosTable | null) => void; 
    selectedTableId?: string | null;
}) {
    const { user } = useAuth();
    const viewportRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [mesas, setMesas] = useState<PosTable[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const carregarMesas = useCallback(async () => {
        try {
            setCarregando(true);
            const data = await localQuery<PosTable[]>('pos.listTables', {});
            if (data) {
                const ordenadas = data.sort((a, b) => 
                    (a.zone.localeCompare(b.zone)) || a.sort_order - b.sort_order
                );
                setMesas(ordenadas);
                
                if (selectedTableId && !selectedTable) {
                    const mesa = ordenadas.find(m => m.id === selectedTableId);
                    if (mesa) setSelectedTable(mesa);
                }
            }
            setErro(null);
        } catch (e) {
            console.error('[HoloTableMap] Erro ao carregar mesas:', e);
            setErro('Erro ao carregar mesas. Verifique a conexão com o servidor.');
        } finally {
            setCarregando(false);
        }
    }, [selectedTableId, selectedTable]);

    useEffect(() => {
        carregarMesas();
    }, [carregarMesas]);

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

    const handleSelecionarMesa = (mesa: PosTable) => {
        if (mesa.status === 'MANUTENCAO') {
            setErro('Mesa em manutenção. Selecione outra mesa.');
            return;
        }
        setSelectedTable(mesa);
        onTableSelect?.(mesa);
        setErro(null);
    };

    const handleLiberarMesa = async (mesaId: string) => {
        try {
            await localOperation('pos.updateTable', { id: mesaId, status: 'LIVRE' });
            carregarMesas();
            if (selectedTable?.id === mesaId) {
                setSelectedTable(null);
                onTableSelect?.(null);
            }
        } catch (e) {
            console.error('[HoloTableMap] Erro ao liberar mesa:', e);
            setErro('Erro ao liberar mesa.');
        }
    };

    const handleFecharConta = async (mesa: PosTable) => {
        setSelectedTable({ ...mesa, status: 'LIVRE' });
    };

    if (carregando) {
        return (
            <div className="map-viewport w-full h-[500px] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-[#00F2FF] mx-auto mb-4" />
                    <p className="text-white/50 text-sm uppercase tracking-wider">A carregar mapa de mesas...</p>
                </div>
            </div>
        );
    }

    if (erro && mesas.length === 0) {
        return (
            <div className="map-viewport w-full h-[500px] flex items-center justify-center">
                <div className="text-center p-8">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-red-400 text-sm uppercase tracking-wider mb-2">{erro}</p>
                    <button onClick={carregarMesas} className="px-6 py-2 bg-[#00F2FF] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-all">
                        Tentar Novamente
                    </button>
                </div>
            </div>
        );
    }

    const mesasPorZona = mesas.reduce((acc, mesa) => {
        if (!acc[mesa.zone]) acc[mesa.zone] = [];
        acc[mesa.zone].push(mesa);
        return acc;
    }, {} as Record<string, PosTable[]>);

    const zonasOrdenadas = Object.keys(mesasPorZona).sort();

    return (
        <div className="space-y-8">
            <AnimatePresence mode="wait">
                {selectedTable ? (
                    <motion.div
                        key="selected"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-gradient-to-r from-[#00F2FF]/10 to-[#F59E0B]/10 border border-[#00F2FF]/30 rounded-2xl p-4 md:p-6"
                    >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#00F2FF] rounded-xl">
                                    <TableIcon className="w-6 h-6 text-black" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white/50 uppercase tracking-wider">Mesa Selecionada</p>
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl md:text-3xl font-black text-white">Mesa {selectedTable.name}</span>
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider" style={{ 
                                            background: `${STATUS_COLORS[selectedTable.status] || '#6B7280'}30`, 
                                            color: STATUS_COLORS[selectedTable.status] || '#6B7280' 
                                        }}>
                                            {STATUS_LABELS[selectedTable.status] || selectedTable.status}
                                        </span>
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#00F2FF]/20 text-[#00F2FF]">
                                            {selectedTable.zone}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedTable(null); onTableSelect?.(null); }}
                                className="p-2 bg-white/5 hover:bg-red-500/20 rounded-xl text-white/50 hover:text-red-400 transition-all"
                                title="Deselecionar mesa"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="none"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 md:p-6"
                    >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-500/20 rounded-xl">
                                    <AlertCircle className="w-6 h-6 text-red-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-red-400 uppercase tracking-wider">Nenhuma Mesa Selecionada</p>
                                    <p className="text-white/50 text-sm mt-1">Selecione uma mesa no mapa abaixo para iniciar o atendimento</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                <div className="flex px-6 py-8 gap-8 min-w-max">
                    {zonasOrdenadas.length === 0 ? (
                        <div className="w-full flex items-center justify-center py-12 text-white/40">
                            <p className="text-center">Nenhuma mesa cadastrada. Configure mesas em <strong>/admin/mesas</strong>.</p>
                        </div>
                    ) : zonasOrdenadas.map(zona => (
                        <motion.div
                            key={zona}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex flex-col gap-4 min-w-[320px]"
                        >
                            <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: `${STATUS_COLORS[zona] || '#00F2FF'}15`, border: `1px solid ${STATUS_COLORS[zona] || '#00F2FF'}30` }}>
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[zona] || '#00F2FF' }} />
                                <span className="text-sm font-black uppercase tracking-wider" style={{ color: STATUS_COLORS[zona] || '#00F2FF' }}>
                                    {zona}
                                </span>
                                <span className="ml-auto text-xs text-white/40">{mesasPorZona[zona].length} mesa(s)</span>
                            </div>
                            <div className="flex gap-4 md:gap-6 flex-wrap">
                                {mesasPorZona[zona].map(mesa => (
                                    <motion.div
                                        key={mesa.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleSelecionarMesa(mesa)}
                                        className={`relative group select-none p-4 rounded-2xl transition-all duration-300 shadow-xl ${mesa.status === 'MANUTENCAO' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${selectedTable?.id === mesa.id ? 'ring-2 ring-[#00F2FF]' : ''} ${mesa.status === 'LIVRE' ? 'bg-white/5 border border-green-500/30' : mesa.status === 'OCUPADA' ? 'bg-red-500/10 border border-red-500/30' : mesa.status === 'RESERVADA' ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-500/10 border border-gray-500/30'}`}
                                        style={{ minWidth: '200px' }}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-black text-white">{mesa.name}</span>
                                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full" style={{ 
                                                    background: `${STATUS_COLORS[mesa.status] || '#6B7280'}30`, 
                                                    color: STATUS_COLORS[mesa.status] || '#6B7280' 
                                                }}>
                                                    {STATUS_LABELS[mesa.status] || mesa.status}
                                                </span>
                                            </div>
                                            {mesa.status === 'OCUPADA' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleLiberarMesa(mesa.id); }}
                                                    className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                                                    title="Liberar mesa (fechar conta)"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-white/60">
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5" />
                                                {mesa.seats} lugares
                                            </span>
                                            <span className="font-mono text-white/70">Ordem: {mesa.sort_order}</span>
                                        </div>
                                        {mesa.status === 'OCUPADA' && (
                                            <motion.div
                                                initial={{ y: 10, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between"
                                            >
                                                <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">Total da Mesa</span>
                                                <span className="text-xl font-black text-red-400 tabular-nums">{mesa.total?.toFixed(2) || '0.00'} Kz</span>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            <AnimatePresence>
                {selectedTable && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Fechar Conta - Mesa {selectedTable.name}</h3>
                                    <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-1">Total: {selectedTable.total?.toFixed(2) || '0.00'} Kz</p>
                                </div>
                                <button onClick={() => { setSelectedTable(null); onTableSelect?.(null); }} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <BillModal
                                table={{
                                    id: selectedTable.id,
                                    number: parseInt(selectedTable.code.replace(/\D/g, '')) || selectedTable.sort_order,
                                    status: selectedTable.status as 'FREE' | 'OCCUPIED' | 'RESERVED',
                                    currentBill: (() => { const t = selectedTable.total; return typeof t === 'string' ? parseFloat(t) : (t || 0); })()
                                }}
                                onClose={() => { setSelectedTable(null); onTableSelect?.(null); }}
                                onBillClosed={handleLiberarMesa}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}