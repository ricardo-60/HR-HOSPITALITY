'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { localQuery, localOperation } from '@/lib/db/localDB';
import {
    X, Table as TableIcon, Users, AlertCircle, CheckCircle, Loader2,
    Clock, Plus, Trash2, Banknote, BedDouble, CreditCard, Wallet, Home,
    Search, User, Hash, ChefHat,
} from 'lucide-react';

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

interface TableConsumption {
    id: string;
    table_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    category: string | null;
    status: 'PENDENTE' | 'ENVIADO' | 'CANCELADO' | 'PAGO';
    notes: string | null;
    created_at: string;
}

interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    icon: string;
}

interface CartItem {
    product: Product;
    qty: number;
}

interface RoomTarget {
    id: string;
    room_number: string;
    guest_name: string | null;
    status: string;
}

interface ClientTarget {
    id: string;
    client_number: string;
    full_name: string;
    document_number: string | null;
}

type PaymentMethod = 'CASH' | 'TPA' | 'TRANSFER';
type ChargeMode = 'IMMEDIATE' | 'ROOM';

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

const CATEGORIES: { name: string; icon: string }[] = [
    { name: 'Bebidas', icon: '🥤' },
    { name: 'Snacks', icon: '🍟' },
    { name: 'Pratos', icon: '🍽️' },
    { name: 'Sobremesas', icon: '🍫' },
    { name: 'Cafés', icon: '☕' },
    { name: 'Vinhos', icon: '🍷' },
];

const PRODUCTS: Product[] = [
    { id: 'p1', name: 'Coca-Cola Zero', price: 2.5, category: 'Bebidas', icon: '🥤' },
    { id: 'p2', name: 'Água Mineral', price: 1.5, category: 'Bebidas', icon: '💧' },
    { id: 'p3', name: 'Cerveja Sagres', price: 3.5, category: 'Bebidas', icon: '🍺' },
    { id: 'p4', name: 'Sumo Natural', price: 4.0, category: 'Bebidas', icon: '🧃' },
    { id: 'p5', name: 'Hambúrguer Gourmet', price: 12.0, category: 'Pratos', icon: '🍔' },
    { id: 'p6', name: 'Batatas Fritas', price: 4.5, category: 'Snacks', icon: '🍟' },
    { id: 'p7', name: 'Tosta Mista', price: 5.5, category: 'Snacks', icon: '🥪' },
    { id: 'p8', name: 'Salada César', price: 8.5, category: 'Pratos', icon: '🥗' },
    { id: 'p9', name: 'Peixe Grelhado', price: 16.0, category: 'Pratos', icon: '🐟' },
    { id: 'p10', name: 'Bife na Chapa', price: 18.0, category: 'Pratos', icon: '🥩' },
    { id: 'p11', name: 'Mousse Chocolate', price: 5.0, category: 'Sobremesas', icon: '🍫' },
    { id: 'p12', name: 'Gelado Artesanal', price: 3.5, category: 'Sobremesas', icon: '🍨' },
    { id: 'p13', name: 'Café Espresso', price: 1.2, category: 'Cafés', icon: '☕' },
    { id: 'p14', name: 'Cappuccino', price: 2.8, category: 'Cafés', icon: '🥛' },
    { id: 'p15', name: 'Vinho Tinto', price: 6.0, category: 'Vinhos', icon: '🍷' },
    { id: 'p16', name: 'Vinho Branco', price: 6.0, category: 'Vinhos', icon: '🥂' },
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
    CASH: 'Numerário',
    TPA: 'TPA / Multicaixa',
    TRANSFER: 'Transferência',
};

function fmt(value: number): string {
    return value.toFixed(2).replace('.', ',') + ' AOA';
}

function elapsedMinutes(iso: string): number {
    try {
        const created = new Date(iso).getTime();
        if (Number.isNaN(created)) return 0;
        return Math.max(0, Math.floor((Date.now() - created) / 60000));
    } catch {
        return 0;
    }
}

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

    /* Detail modal state */
    const [detailTable, setDetailTable] = useState<PosTable | null>(null);
    const [consumptions, setConsumptions] = useState<TableConsumption[]>([]);
    const [consumptionsLoading, setConsumptionsLoading] = useState(false);
    const [consumptionTotal, setConsumptionTotal] = useState(0);
    const [detailCategory, setDetailCategory] = useState(CATEGORIES[0].name);
    const [detailCart, setDetailCart] = useState<CartItem[]>([]);
    const [chargeMode, setChargeMode] = useState<ChargeMode | null>(null);
    const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
    const [cashReceived, setCashReceived] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [roomResults, setRoomResults] = useState<RoomTarget[]>([]);
    const [clientResults, setClientResults] = useState<ClientTarget[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<RoomTarget | null>(null);
    const [selectedClient, setSelectedClient] = useState<ClientTarget | null>(null);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);

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

    const loadConsumptions = useCallback(async (tableId: string) => {
        setConsumptionsLoading(true);
        try {
            const data = await localQuery<TableConsumption[]>('pos.tableConsumptions.list', {
                table_id: tableId,
                limit: 200,
            });
            const list = Array.isArray(data) ? data : [];
            setConsumptions(list);
            const total = list
                .filter(c => c.status === 'PENDENTE' || c.status === 'ENVIADO')
                .reduce((sum, c) => sum + c.subtotal, 0);
            setConsumptionTotal(total);
        } catch (err) {
            console.error('[HoloTableMap] erro ao carregar consumos', err);
        } finally {
            setConsumptionsLoading(false);
        }
    }, []);

    const openDetail = useCallback((mesa: PosTable) => {
        setDetailTable(mesa);
        setDetailCart([]);
        setChargeMode(null);
        setPayMethod('CASH');
        setCashReceived('');
        setSearchQuery('');
        setRoomResults([]);
        setClientResults([]);
        setSelectedRoom(null);
        setSelectedClient(null);
        setModalError(null);
        void loadConsumptions(mesa.id);
    }, [loadConsumptions]);

    const closeDetail = useCallback(() => {
        setDetailTable(null);
        setConsumptions([]);
        setConsumptionTotal(0);
        setDetailCart([]);
        setChargeMode(null);
    }, []);

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
        openDetail(mesa);
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

    /* ── Detail modal: cart ── */
    const detailCategoryProducts = useMemo(
        () => PRODUCTS.filter(p => p.category === detailCategory),
        [detailCategory],
    );

    const detailCartTotal = useMemo(
        () => detailCart.reduce((sum, item) => sum + item.product.price * item.qty, 0),
        [detailCart],
    );

    const addToDetailCart = (product: Product) => {
        setDetailCart(prev => {
            const found = prev.find(i => i.product.id === product.id);
            if (found) {
                return prev.map(i =>
                    i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i,
                );
            }
            return [...prev, { product, qty: 1 }];
        });
    };

    const changeDetailQty = (productId: string, delta: number) => {
        setDetailCart(prev =>
            prev
                .map(i =>
                    i.product.id === productId
                        ? { ...i, qty: Math.max(0, i.qty + delta) }
                        : i,
                )
                .filter(i => i.qty > 0),
        );
    };

    const sendToKitchen = async () => {
        if (!detailTable || detailCart.length === 0) return;
        setBusy(true);
        setModalError(null);
        try {
            for (const item of detailCart) {
                await localOperation('pos.tableConsumptions.add', {
                    table_id: detailTable.id,
                    product_name: item.product.name,
                    quantity: item.qty,
                    unit_price: item.product.price,
                    category: item.product.category,
                });
            }
            if (detailTable.status === 'LIVRE') {
                await localOperation('pos.updateTable', {
                    id: detailTable.id,
                    code: detailTable.code,
                    name: detailTable.name,
                    zone: detailTable.zone,
                    seats: detailTable.seats,
                    status: 'OCUPADA',
                    sort_order: detailTable.sort_order,
                });
            }
            setDetailCart([]);
            setFlash('Pedido enviado à cozinha!');
            setTimeout(() => setFlash(null), 2500);
            void loadConsumptions(detailTable.id);
            void carregarMesas();
        } catch (err) {
            console.error('[HoloTableMap] erro ao enviar pedido', err);
            setModalError('Erro ao enviar pedido.');
        } finally {
            setBusy(false);
        }
    };

    const cancelConsumption = async (consumption: TableConsumption) => {
        if (!detailTable) return;
        setBusy(true);
        try {
            await localOperation('pos.tableConsumptions.update', {
                id: consumption.id,
                status: 'CANCELADO',
            });
            setFlash('Item cancelado.');
            setTimeout(() => setFlash(null), 2000);
            void loadConsumptions(detailTable.id);
        } catch (err) {
            console.error('[HoloTableMap] erro ao cancelar item', err);
        } finally {
            setBusy(false);
        }
    };

    const searchChargeTargets = async (query: string) => {
        setSearchQuery(query);
        setSelectedRoom(null);
        setSelectedClient(null);
        if (query.trim().length < 1) {
            setRoomResults([]);
            setClientResults([]);
            return;
        }
        setSearching(true);
        try {
            const data = await localQuery<{ rooms: RoomTarget[]; clients: ClientTarget[] }>(
                'pos.searchChargeTargets',
                { query },
            );
            setRoomResults(Array.isArray(data?.rooms) ? data.rooms : []);
            setClientResults(Array.isArray(data?.clients) ? data.clients : []);
        } catch (err) {
            console.error('[HoloTableMap] erro na pesquisa', err);
        } finally {
            setSearching(false);
        }
    };

    const change = useMemo(() => {
        const received = parseFloat(cashReceived.replace(',', '.'));
        if (Number.isNaN(received) || received < consumptionTotal + detailCartTotal) return null;
        return received - (consumptionTotal + detailCartTotal);
    }, [cashReceived, consumptionTotal, detailCartTotal]);

    const confirmCharge = async () => {
        if (!detailTable) return;
        const grandTotal = consumptionTotal + detailCartTotal;
        if (grandTotal <= 0) return;
        if (chargeMode === 'ROOM' && !selectedRoom && !selectedClient) return;
        if (chargeMode === 'IMMEDIATE' && payMethod === 'CASH' && change === null) return;

        setBusy(true);
        setModalError(null);
        try {
            if (detailCart.length > 0) {
                for (const item of detailCart) {
                    await localOperation('pos.tableConsumptions.add', {
                        table_id: detailTable.id,
                        product_name: item.product.name,
                        quantity: item.qty,
                        unit_price: item.product.price,
                        category: item.product.category,
                    });
                }
            }

            if (chargeMode === 'ROOM' && selectedRoom) {
                await localOperation('pos.tableTransferToRoom', {
                    table_id: detailTable.id,
                    room_id: selectedRoom.id,
                    client_id: selectedClient?.id,
                });
            } else {
                await localOperation('pos.tableConsumptions.clear', {
                    table_id: detailTable.id,
                });
            }

            setFlash(
                chargeMode === 'ROOM'
                    ? `Lançado na conta do quarto ${selectedRoom?.room_number ?? ''}!`
                    : `Pagamento registado — ${PAYMENT_LABELS[payMethod]} ${fmt(grandTotal)}`,
            );
            setTimeout(() => setFlash(null), 3500);
            closeDetail();
            setSelectedTable(null);
            onTableSelect?.(null);
            void carregarMesas();
        } catch (err) {
            console.error('[HoloTableMap] erro ao confirmar cobrança', err);
            setModalError('Erro ao processar pagamento.');
        } finally {
            setBusy(false);
        }
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
    const grandTotal = consumptionTotal + detailCartTotal;

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
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openDetail(selectedTable)}
                                    className="px-4 py-2 bg-[#00F2FF]/20 hover:bg-[#00F2FF]/30 rounded-xl text-[#00F2FF] text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    Ver Detalhe / Cobrar
                                </button>
                                <button
                                    onClick={() => { setSelectedTable(null); onTableSelect?.(null); closeDetail(); }}
                                    className="p-2 bg-white/5 hover:bg-red-500/20 rounded-xl text-white/50 hover:text-red-400 transition-all"
                                    title="Deselecionar mesa"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="none"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
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

            {/* ── Table Detail Modal ── */}
            <AnimatePresence>
                {detailTable && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
                        onClick={closeDetail}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[32px] border border-white/10 bg-[#111111] shadow-2xl sm:rounded-[32px]"
                        >
                            {/* Header */}
                            <div className="border-b border-white/10 px-6 py-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 ${detailTable.status === 'OCUPADA' ? 'border-rose-400/50' : 'border-emerald-400/40'}`}>
                                            <TableIcon className={`h-6 w-6 ${detailTable.status === 'OCUPADA' ? 'text-rose-400' : 'text-emerald-400'}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black uppercase tracking-tight text-white">Mesa {detailTable.name}</h3>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
                                                {detailTable.code} · {detailTable.seats} lugares · {detailTable.zone}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={closeDetail} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white">
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Estado</p>
                                        <p className={`mt-1 flex items-center gap-2 text-sm font-black ${
                                            detailTable.status === 'OCUPADA' ? 'text-rose-300' : 'text-emerald-300'
                                        }`}>
                                            <span className={`h-2.5 w-2.5 rounded-full ${detailTable.status === 'OCUPADA' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                                            {detailTable.status === 'OCUPADA' ? '🔴 Em consumo' : '🟢 Livre'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Permanência</p>
                                        <p className="mt-1 flex items-center gap-2 text-sm font-black text-white/80">
                                            <Clock className="h-4 w-4 text-[#00F2FF]" />
                                            {consumptions.length > 0
                                                ? `Há ${elapsedMinutes(consumptions[consumptions.length - 1]?.created_at ?? new Date().toISOString())} min`
                                                : '—'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-[#00F2FF]/30 bg-[#00F2FF]/10 px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-[#00F2FF]/70">Total em dívida</p>
                                        <p className="mt-1 text-lg font-black text-[#00F2FF]">{fmt(grandTotal)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable body */}
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                {/* Consumption history */}
                                <div className="mb-5">
                                    <h4 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/50">
                                        Histórico de Consumos
                                    </h4>
                                    {consumptionsLoading ? (
                                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-sm text-white/40">
                                            <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
                                        </div>
                                    ) : consumptions.filter(c => c.status !== 'CANCELADO').length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">
                                            Sem consumos registados. Adicione produtos abaixo.
                                        </div>
                                    ) : (
                                        <ul className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                                            {consumptions
                                                .filter(c => c.status !== 'CANCELADO')
                                                .map(c => (
                                                    <li key={c.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5">
                                                        <span className="w-8 text-center text-sm font-black text-[#00F2FF]">{c.quantity}×</span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-xs font-bold text-white">{c.product_name}</p>
                                                            <p className="text-[10px] text-white/40">{fmt(c.unit_price)} / un</p>
                                                        </div>
                                                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                                            c.status === 'ENVIADO' ? 'bg-amber-400/15 text-amber-300'
                                                                : c.status === 'PENDENTE' ? 'bg-sky-400/15 text-sky-300'
                                                                    : 'bg-emerald-400/15 text-emerald-300'
                                                        }`}>
                                                            {c.status === 'ENVIADO' ? 'Enviado' : c.status === 'PENDENTE' ? 'Pendente' : 'Pago'}
                                                        </span>
                                                        <span className="w-20 text-right text-xs font-black text-white/80">{fmt(c.subtotal)}</span>
                                                        {(user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO') ? (
                                                            <button
                                                                onClick={() => void cancelConsumption(c)}
                                                                disabled={busy}
                                                                className="rounded-lg p-1.5 text-white/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
                                                                title="Cancelar item (gerência)"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                    </li>
                                                ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Add products */}
                                <div className="mb-5">
                                    <h4 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/50">
                                        <Plus className="h-3.5 w-3.5 text-[#00F2FF]" />
                                        Adicionar Produtos
                                    </h4>
                                    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                                        {CATEGORIES.map(cat => {
                                            const active = detailCategory === cat.name;
                                            return (
                                                <button
                                                    key={cat.name}
                                                    onClick={() => setDetailCategory(cat.name)}
                                                    className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all ${
                                                        active
                                                            ? 'border-[#00F2FF] bg-[#00F2FF]/15 text-[#00F2FF]'
                                                            : 'border-white/10 bg-white/5 text-white/45 hover:text-white'
                                                    }`}
                                                >
                                                    <span>{cat.icon}</span>
                                                    {cat.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                        {detailCategoryProducts.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => addToDetailCart(p)}
                                                className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 hover:bg-white/[0.08] hover:border-white/25 active:scale-95 transition-all"
                                            >
                                                <span className="text-lg">{p.icon}</span>
                                                <span className="text-center text-[9px] font-bold leading-tight text-white">{p.name}</span>
                                                <span className="text-[9px] font-black text-[#00F2FF]">{fmt(p.price)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Pending cart */}
                                {detailCart.length > 0 && (
                                    <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                                        <div className="mb-2 flex items-center justify-between">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                                                Itens por enviar ({detailCart.reduce((s, i) => s + i.qty, 0)})
                                            </p>
                                            <span className="text-sm font-black text-amber-200">{fmt(detailCartTotal)}</span>
                                        </div>
                                        <ul className="space-y-1.5">
                                            {detailCart.map(item => (
                                                <li key={item.product.id} className="flex items-center gap-2 text-xs">
                                                    <span className="font-black text-amber-300">{item.qty}×</span>
                                                    <span className="flex-1 text-white/80">{item.product.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => changeDetailQty(item.product.id, -1)}
                                                            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px] font-black hover:bg-white/20"
                                                        >−</button>
                                                        <button
                                                            onClick={() => changeDetailQty(item.product.id, 1)}
                                                            className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px] font-black hover:bg-white/20"
                                                        >+</button>
                                                    </div>
                                                    <span className="w-16 text-right font-bold text-white/70">{fmt(item.product.price * item.qty)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <button
                                            onClick={() => void sendToKitchen()}
                                            disabled={busy}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00F2FF] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-black transition-all hover:scale-[1.02] disabled:opacity-40"
                                        >
                                            <ChefHat className="h-3.5 w-3.5" />
                                            {busy ? 'A enviar…' : 'Enviar à Cozinha'}
                                        </button>
                                    </div>
                                )}

                                {/* Charge mode selector */}
                                {chargeMode === null && grandTotal > 0 && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <button
                                            onClick={() => setChargeMode('IMMEDIATE')}
                                            className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-left transition-all hover:bg-emerald-400/15 hover:scale-[1.01]"
                                        >
                                            <Banknote className="h-6 w-6 text-emerald-300" />
                                            <div>
                                                <p className="text-sm font-black uppercase tracking-wider text-emerald-200">💵 Pagamento Imediato</p>
                                                <p className="text-[10px] text-emerald-300/60">Numerário · TPA · Transferência</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => setChargeMode('ROOM')}
                                            className="flex items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-5 py-4 text-left transition-all hover:bg-sky-400/15 hover:scale-[1.01]"
                                        >
                                            <BedDouble className="h-6 w-6 text-sky-300" />
                                            <div>
                                                <p className="text-sm font-black uppercase tracking-wider text-sky-200">🏨 Lançar na Conta do Quarto</p>
                                                <p className="text-[10px] text-sky-300/60">Por quarto ou Nº de cliente / KYC</p>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {/* IMMEDIATE payment panel */}
                                {chargeMode === 'IMMEDIATE' && (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-white/80">Pagamento Imediato — {fmt(grandTotal)}</h4>
                                            <button onClick={() => setChargeMode(null)} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
                                        </div>
                                        <div className="mb-4 grid grid-cols-3 gap-2">
                                            {(['CASH', 'TPA', 'TRANSFER'] as PaymentMethod[]).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setPayMethod(m)}
                                                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-wider transition-all ${
                                                        payMethod === m
                                                            ? 'border-[#00F2FF] bg-[#00F2FF]/15 text-[#00F2FF]'
                                                            : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                                                    }`}
                                                >
                                                    {m === 'CASH' && <Wallet className="h-4 w-4" />}
                                                    {m === 'TPA' && <CreditCard className="h-4 w-4" />}
                                                    {m === 'TRANSFER' && <Home className="h-4 w-4" />}
                                                    {PAYMENT_LABELS[m]}
                                                </button>
                                            ))}
                                        </div>
                                        {payMethod === 'CASH' && (
                                            <div className="mb-4">
                                                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/40">Valor recebido (AOA)</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={cashReceived}
                                                    onChange={e => setCashReceived(e.target.value)}
                                                    placeholder="Ex: 20000"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg font-black text-white placeholder:text-white/25 focus:border-[#00F2FF] focus:outline-none"
                                                />
                                                {change !== null && (
                                                    <p className="mt-2 flex items-center gap-2 text-sm font-black text-emerald-300">
                                                        <CheckCircle className="h-4 w-4" /> Troco: {fmt(change)}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => void confirmCharge()}
                                            disabled={busy || (payMethod === 'CASH' && change === null)}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                            {busy ? 'A processar…' : `Confirmar — ${fmt(grandTotal)}`}
                                        </button>
                                    </div>
                                )}

                                {/* ROOM charge panel */}
                                {chargeMode === 'ROOM' && (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-white/80">Lançar na Conta do Quarto — {fmt(grandTotal)}</h4>
                                            <button onClick={() => setChargeMode(null)} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
                                        </div>
                                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/40">
                                            Pesquisar por Nº do Quarto ou Nº de Cliente / KYC / NIF / Nome
                                        </label>
                                        <div className="relative mb-3">
                                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                                            <input
                                                value={searchQuery}
                                                onChange={e => void searchChargeTargets(e.target.value)}
                                                placeholder="Ex: 101, HR-2026-00001, NIF ou nome…"
                                                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[#00F2FF] focus:outline-none"
                                            />
                                            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />}
                                        </div>
                                        {roomResults.length > 0 && (
                                            <div className="mb-3">
                                                <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Quartos activos</p>
                                                <ul className="max-h-[120px] space-y-1.5 overflow-y-auto">
                                                    {roomResults.map(r => (
                                                        <li key={r.id}>
                                                            <button
                                                                onClick={() => { setSelectedRoom(r); setSelectedClient(null); }}
                                                                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition-all ${
                                                                    selectedRoom?.id === r.id
                                                                        ? 'border-[#00F2FF] bg-[#00F2FF]/15 text-white'
                                                                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2 font-black"><BedDouble className="h-3.5 w-3.5" /> Quarto {r.room_number}</span>
                                                                <span className="truncate text-white/50">{r.guest_name ?? '—'}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {clientResults.length > 0 && (
                                            <div className="mb-3">
                                                <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Clientes KYC</p>
                                                <ul className="max-h-[120px] space-y-1.5 overflow-y-auto">
                                                    {clientResults.map(c => (
                                                        <li key={c.id}>
                                                            <button
                                                                onClick={() => { setSelectedClient(c); setSelectedRoom(null); }}
                                                                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition-all ${
                                                                    selectedClient?.id === c.id
                                                                        ? 'border-[#00F2FF] bg-[#00F2FF]/15 text-white'
                                                                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2 font-black"><User className="h-3.5 w-3.5" /> {c.full_name}</span>
                                                                <span className="flex items-center gap-1 text-white/50"><Hash className="h-3 w-3" /> {c.client_number}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {(selectedRoom || selectedClient) && (
                                            <p className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-300">
                                                <CheckCircle className="h-4 w-4" />
                                                {selectedRoom ? `Quarto ${selectedRoom.room_number} (${selectedRoom.guest_name ?? '—'})` : `${selectedClient?.full_name} — ${selectedClient?.client_number}`}
                                            </p>
                                        )}
                                        <button
                                            onClick={() => void confirmCharge()}
                                            disabled={busy || (!selectedRoom && !selectedClient)}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
                                            {busy ? 'A processar…' : `Lançar na Conta — ${fmt(grandTotal)}`}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {modalError && (
                                <div className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300">
                                    <AlertCircle className="h-4 w-4" /> {modalError}
                                </div>
                            )}
                            {flash && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300">
                                    <CheckCircle className="h-4 w-4" /> {flash}
                                </motion.div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
