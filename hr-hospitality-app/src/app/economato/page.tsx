'use client';

import { motion } from 'framer-motion';
import {
    ArrowDownCircle, ArrowUpCircle, Check, Package, Plus, RefreshCw,
    TriangleAlert, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import {
    createInventoryItem,
    listInventoryItems,
    listInventoryMovements,
    recordInventoryMovement,
    type InventoryItem,
    type InventoryMovement,
    type MovementType,
} from '@/lib/adminData';

const CATEGORIES = ['BEBIDA', 'COMIDA', 'LIMPEZA', 'HIGIENE', 'ROUPARIA', 'MANUTENCAO', 'ESCRITORIO', 'outro'];

const MOVEMENT_LABEL: Record<MovementType, string> = {
    ENTRADA: 'Entrada',
    SAIDA: 'Saída',
    QUEBRA: 'Quebra',
    INVENTARIO: 'Inventário',
    AJUSTE: 'Ajuste',
};

const MOVEMENT_STYLE: Record<MovementType, string> = {
    ENTRADA: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
    SAIDA: 'text-white/60 border-white/15 bg-white/5',
    QUEBRA: 'text-rose-300 border-rose-400/30 bg-rose-500/10',
    INVENTARIO: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
    AJUSTE: 'text-white/60 border-white/15 bg-white/5',
};

const MOVEMENT_SIGN: Record<MovementType, '+' | '−' | '='> = {
    ENTRADA: '+',
    SAIDA: '−',
    QUEBRA: '−',
    INVENTARIO: '=',
    AJUSTE: '=',
};

function formatKz(value: number): string {
    const [intPart, decPart] = value.toFixed(2).split('.');
    return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart} Kz`;
}

type StockState = 'RUTURA' | 'BAIXO' | 'OK';

function stockState(item: InventoryItem): StockState {
    if (item.current_stock <= 0) return 'RUTURA';
    if (item.current_stock <= item.min_stock) return 'BAIXO';
    return 'OK';
}

const STOCK_STYLE: Record<StockState, string> = {
    RUTURA: 'bg-rose-500/10 border-rose-400/30 text-rose-300',
    BAIXO: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
    OK: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
};

export default function EconomatoPage() {
    const { user } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [newItem, setNewItem] = useState({ sku: '', name: '', category: 'BEBIDA', unit: 'un', min_stock: '0', supplier: '' });
    const [movement, setMovement] = useState({ item_id: '', movement_type: 'ENTRADA' as MovementType, quantity: '1', unit_cost: '0', reason: '' });

    const canWrite = user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO' || user?.role === 'ACESSO';

    const refresh = useCallback(async () => {
        setLoading(true);
        const [itemResult, movementResult] = await Promise.all([
            listInventoryItems(),
            listInventoryMovements(),
        ]);
        setLoading(false);
        if (itemResult.error) { setError(itemResult.error); setItems([]); }
        else { setError(null); setItems(itemResult.data ?? []); }
        if (movementResult.data) setMovements(movementResult.data ?? []);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const alerts = useMemo(() => items.filter(item => stockState(item) !== 'OK'), [items]);
    const totalValue = useMemo(
        () => items.reduce((sum, item) => sum + item.current_stock * item.average_cost, 0),
        [items],
    );

    const createItem = async () => {
        setError(null);
        setNotice(null);
        if (!newItem.sku.trim() || !newItem.name.trim()) {
            setError('SKU e nome são obrigatórios.');
            return;
        }
        const result = await createInventoryItem({
            sku: newItem.sku.trim().toUpperCase(),
            name: newItem.name.trim(),
            category: newItem.category,
            unit: newItem.unit,
            min_stock: Number(newItem.min_stock) || 0,
            supplier: newItem.supplier.trim(),
        });
        if (result.error) { setError(result.error); return; }
        setNotice(`Artigo "${newItem.name}" criado. O saldo começa a zero: registe uma entrada.`);
        setNewItem({ sku: '', name: '', category: 'BEBIDA', unit: 'un', min_stock: '0', supplier: '' });
        await refresh();
    };

    const registerMovement = async () => {
        setError(null);
        setNotice(null);
        if (!movement.item_id) { setError('Escolha o artigo.'); return; }
        const quantity = Math.abs(Number(movement.quantity));
        if (!Number.isFinite(quantity) || quantity <= 0) { setError('A quantidade tem de ser maior que zero.'); return; }

        const result = await recordInventoryMovement({
            item_id: movement.item_id,
            movement_type: movement.movement_type,
            quantity,
            unit_cost: movement.movement_type === 'ENTRADA' ? Number(movement.unit_cost) || 0 : null,
            reason: movement.reason,
            reference_type: movement.movement_type === 'ENTRADA' ? 'COMPRA' : 'PERDA',
        });
        if (result.error) { setError(result.error); return; }
        setNotice('Movimento registado. O saldo foi recalculado pela base de dados.');
        setMovement(m => ({ ...m, quantity: '1', reason: '' }));
        await refresh();
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-b border-white/10 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <Package className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">Economato</h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                CONTROLO DE STOCKS
                            </p>
                        </div>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Artigos</p>
                        <p className="text-4xl font-black text-white mt-2">{items.length}</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Alertas</p>
                        <p className={`text-4xl font-black mt-2 ${alerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {alerts.length}
                        </p>
                        <p className="text-xs text-white/40 mt-1">no limite mínimo ou em rutura</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Valor em stock</p>
                        <p className="text-2xl font-black text-[var(--brand-primary)] mt-2">{formatKz(totalValue)}</p>
                        <p className="text-xs text-white/40 mt-1">pelo custo médio ponderado</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => void refresh()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                    <p className="text-xs text-white/35">
                        O saldo nunca é escrito directamente: é recalculado na base de dados a partir de cada movimento.
                    </p>
                </div>

                {error ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                        <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
                        <p className="text-sm text-rose-200">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto" aria-label="Fechar">
                            <X className="w-4 h-4 text-rose-300" />
                        </button>
                    </div>
                ) : null}

                {notice ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                        <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                        <p className="text-sm text-emerald-200">{notice}</p>
                    </div>
                ) : null}

                {/* Alertas */}
                {alerts.length > 0 ? (
                    <div className="rounded-[28px] border border-amber-400/30 bg-amber-500/5 p-6 space-y-3">
                        <p className="text-xs font-black text-amber-300 uppercase tracking-[0.3em]">Repor urgently</p>
                        <div className="flex flex-wrap gap-2">
                            {alerts.map(item => (
                                <span key={item.id} className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase ${STOCK_STYLE[stockState(item)]}`}>
                                    {item.name} · {item.current_stock} {item.unit}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}

                {canWrite ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4">
                            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Novo artigo
                            </h2>
                            <div className="grid grid-cols-2 gap-3">
                                <input value={newItem.sku} onChange={e => setNewItem(i => ({ ...i, sku: e.target.value }))} placeholder="SKU" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                                <input value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} placeholder="Nome" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                                <select value={newItem.category} onChange={e => setNewItem(i => ({ ...i, category: e.target.value }))} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm">
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input value={newItem.unit} onChange={e => setNewItem(i => ({ ...i, unit: e.target.value }))} placeholder="un, kg, L" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                                <input value={newItem.min_stock} onChange={e => setNewItem(i => ({ ...i, min_stock: e.target.value }))} placeholder="Stock mínimo" inputMode="decimal" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                                <input value={newItem.supplier} onChange={e => setNewItem(i => ({ ...i, supplier: e.target.value }))} placeholder="Fornecedor" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                            </div>
                            <button onClick={createItem} className="w-full px-5 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider">
                                Criar artigo
                            </button>
                        </div>

                        <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4">
                            <h2 className="text-sm font-black text-white uppercase tracking-wider">Registar movimento</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    value={movement.item_id}
                                    onChange={e => setMovement(m => ({ ...m, item_id: e.target.value }))}
                                    className="col-span-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                >
                                    <option value="">Escolher artigo…</option>
                                    {items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.current_stock} {item.unit})</option>)}
                                </select>
                                <select
                                    value={movement.movement_type}
                                    onChange={e => setMovement(m => ({ ...m, movement_type: e.target.value as MovementType }))}
                                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                >
                                    {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map(type => (
                                        <option key={type} value={type}>{MOVEMENT_LABEL[type]}</option>
                                    ))}
                                </select>
                                <input
                                    value={movement.quantity}
                                    onChange={e => setMovement(m => ({ ...m, quantity: e.target.value }))}
                                    placeholder="Quantidade"
                                    inputMode="decimal"
                                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                />
                                {movement.movement_type === 'ENTRADA' ? (
                                    <input
                                        value={movement.unit_cost}
                                        onChange={e => setMovement(m => ({ ...m, unit_cost: e.target.value }))}
                                        placeholder="Custo unitário"
                                        inputMode="decimal"
                                        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                    />
                                ) : null}
                                <input
                                    value={movement.reason}
                                    onChange={e => setMovement(m => ({ ...m, reason: e.target.value }))}
                                    placeholder="Motivo / fornecedor"
                                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                />
                            </div>
                            <button onClick={registerMovement} className="w-full px-5 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider">
                                Registar
                            </button>
                            <p className="text-[11px] text-white/35 leading-relaxed">
                                O custo unitário só entra em conta nas entradas, e recalcula o custo médio
                                ponderado. Uma saída acima do disponível é recusada pela base de dados.
                            </p>
                        </div>
                    </div>
                ) : null}

                <div className="space-y-4">
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Inventário</h2>
                    {loading ? (
                        <p className="text-sm text-white/40">A carregar…</p>
                    ) : items.length === 0 ? (
                        <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/50">Nenhum artigo registado. Comece por criar o primeiro.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {items.map(item => {
                                const state = stockState(item);
                                return (
                                    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-[24px] border border-white/5 p-5 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-white">{item.name}</p>
                                                <p className="text-[10px] text-white/35 font-mono mt-0.5">
                                                    {item.sku} · {item.category}{item.supplier ? ` · ${item.supplier}` : ''}
                                                </p>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${STOCK_STYLE[state]}`}>
                                                {state}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 text-xs pt-1 border-t border-white/5">
                                            <div>
                                                <p className="text-white/35">Saldo</p>
                                                <p className="font-black text-white mt-0.5">{item.current_stock} {item.unit}</p>
                                            </div>
                                            <div>
                                                <p className="text-white/35">Mínimo</p>
                                                <p className="font-black text-white/60 mt-0.5">{item.min_stock} {item.unit}</p>
                                            </div>
                                            <div>
                                                <p className="text-white/35">Custo médio</p>
                                                <p className="font-black text-white/60 mt-0.5">{formatKz(item.average_cost)}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Movimentos recentes</h2>
                    {movements.length === 0 ? (
                        <div className="glass-panel rounded-[28px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/50">Sem movimentos registados.</p>
                        </div>
                    ) : (
                        <div className="glass-panel rounded-[28px] border border-white/5 divide-y divide-white/5">
                            {movements.map(entry => (
                                <div key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                    <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${MOVEMENT_STYLE[entry.movement_type]}`}>
                                        {MOVEMENT_LABEL[entry.movement_type]}
                                    </span>
                                    <span className="text-sm text-white flex-1 min-w-[140px]">{entry.item_name}</span>
                                    <span className="font-mono text-sm text-white/70">
                                        {MOVEMENT_SIGN[entry.movement_type]}{entry.quantity}
                                    </span>
                                    {entry.balance_after !== null ? (
                                        <span className="text-[11px] text-white/35">saldo {entry.balance_after}</span>
                                    ) : null}
                                    {entry.reason ? <span className="text-[11px] text-white/35">{entry.reason}</span> : null}
                                    <span className="text-[10px] text-white/25">
                                        {new Date(entry.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-2">
                    <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em] flex items-center gap-2">
                        <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-300" />
                        <ArrowDownCircle className="w-3.5 h-3.5 text-rose-300" />
                        Como o saldo é calculado
                    </p>
                    <p className="text-sm text-white/60 leading-relaxed">
                        Cada entrada, saída, quebra ou inventário escreve uma linha em
                        <span className="text-white"> inventory_movements</span> e um trigger recalcula
                        o saldo do artigo. Não existe caminho para alterar o stock sem deixar rasto, e
                        o POS consome stock do mesmo modo que o economato.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
