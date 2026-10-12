/* eslint-disable */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, BedDouble, Calculator, CheckCircle, CreditCard, Home, Loader2,
    ShoppingCart, Store, Table as TableIcon, UtensilsCrossed, Wallet, X,
    ChefHat, Coffee, GlassWater, Wine, Pizza, Soup, IceCreamCone,
    AlertCircle, Search, User, Hash, Clock, Plus, Trash2, Banknote,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { localQuery, localOperation } from '@/lib/db/localDB';
import { printThermalReceipt as sendThermalReceipt } from '@/lib/thermalPrint';
import { useAuth } from '@/context/AuthContext';

/* ─────────────────────────────────────────────
   Tipos
   ───────────────────────────────────────────── */
interface PosTable {
    id: string;
    code: string;
    name: string;
    zone: string;
    seats: number;
    status: 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'MANUTENCAO';
    sort_order: number;
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

type ZoneFilter = 'ALL' | 'RESTAURANTE' | 'SNACK_BAR' | 'ESPLANADA' | 'BALCAO' | 'PISCINA';
type PaymentMethod = 'CASH' | 'TPA' | 'TRANSFER' | 'ROOM';
type ChargeMode = 'IMMEDIATE' | 'ROOM';

/* ─────────────────────────────────────────────
   Constantes visuais
   ───────────────────────────────────────────── */
const ZONE_LABELS: Record<string, string> = {
    RESTAURANTE: 'Restaurante',
    SNACK_BAR: 'Snack Bar',
    ESPLANADA: 'Esplanada',
    BALCAO: 'Balcão',
    PISCINA: 'Piscina',
};

const STATUS_LABELS: Record<string, string> = {
    LIVRE: 'Livre',
    OCUPADA: 'Ocupada',
    RESERVADA: 'Reservada',
    MANUTENCAO: 'Manutenção',
};

const STATUS_DOT: Record<string, string> = {
    LIVRE: 'bg-emerald-400',
    OCUPADA: 'bg-rose-400',
    RESERVADA: 'bg-amber-400',
    MANUTENCAO: 'bg-zinc-500',
};

const STATUS_RING: Record<string, string> = {
    LIVRE: 'border-emerald-400/40',
    OCUPADA: 'border-rose-400/50',
    RESERVADA: 'border-amber-400/40',
    MANUTENCAO: 'border-zinc-600/40',
};

const ZONE_ICONS: Record<string, string> = {
    RESTAURANTE: '🍽️',
    SNACK_BAR: '🍔',
    ESPLANADA: '🌿',
    BALCAO: '🍸',
    PISCINA: '🏊',
};

const CATEGORIES: { name: string; icon: typeof UtensilsCrossed }[] = [
    { name: 'Bebidas', icon: GlassWater },
    { name: 'Snacks', icon: Pizza },
    { name: 'Pratos', icon: UtensilsCrossed },
    { name: 'Sobremesas', icon: IceCreamCone },
    { name: 'Cafés', icon: Coffee },
    { name: 'Vinhos', icon: Wine },
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
    ROOM: 'Conta do Quarto',
};

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   Componente principal
   ───────────────────────────────────────────── */
export default function POSTabletPage() {
    const [zone, setZone] = useState<ZoneFilter>('ALL');
    const [tables, setTables] = useState<PosTable[]>([]);
    const [tablesLoading, setTablesLoading] = useState(true);

    /* Table detail modal */
    const [detailTable, setDetailTable] = useState<PosTable | null>(null);
    const [consumptions, setConsumptions] = useState<TableConsumption[]>([]);
    const [consumptionsLoading, setConsumptionsLoading] = useState(false);
    const [consumptionTotal, setConsumptionTotal] = useState(0);
    const [detailCategory, setDetailCategory] = useState(CATEGORIES[0].name);
    const [detailCart, setDetailCart] = useState<CartItem[]>([]);

    /* Charge flow */
    const [chargeMode, setChargeMode] = useState<ChargeMode | null>(null);
    const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
    const [cashReceived, setCashReceived] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [roomResults, setRoomResults] = useState<RoomTarget[]>([]);
    const [clientResults, setClientResults] = useState<ClientTarget[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<RoomTarget | null>(null);
    const [selectedClient, setSelectedClient] = useState<ClientTarget | null>(null);
    const [searching, setSearching] = useState(false);

    /* Misc */
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { user } = useAuth();
    const router = useRouter();

    const goBack = useCallback(() => {
        router.push('/');
    }, [router]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') goBack();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [goBack]);

    const loadTables = useCallback(async () => {
        setTablesLoading(true);
        try {
            const data = await localQuery<PosTable[]>('pos.listTables', {});
            setTables(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[POSTablet] erro ao carregar mesas', err);
        } finally {
            setTablesLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTables();
    }, [loadTables]);

    const visibleTables = useMemo(() => {
        const list = zone === 'ALL' ? tables : tables.filter(t => t.zone === zone);
        return [...list].sort((a, b) => a.sort_order - b.sort_order);
    }, [tables, zone]);

    const zoneCounts = useMemo(() => {
        const counts: Record<string, { livre: number; ocupada: number; reservada: number }> = {};
        for (const z of Object.keys(ZONE_LABELS)) {
            counts[z] = { livre: 0, ocupada: 0, reservada: 0 };
        }
        for (const t of tables) {
            if (!counts[t.zone]) continue;
            if (t.status === 'LIVRE') counts[t.zone].livre += 1;
            else if (t.status === 'OCUPADA') counts[t.zone].ocupada += 1;
            else if (t.status === 'RESERVADA') counts[t.zone].reservada += 1;
        }
        return counts;
    }, [tables]);

    /* ── Detail modal: load consumptions ── */
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
            console.error('[POSTablet] erro ao carregar consumos', err);
        } finally {
            setConsumptionsLoading(false);
        }
    }, []);

    const openDetail = useCallback((table: PosTable) => {
        setDetailTable(table);
        setDetailCart([]);
        setChargeMode(null);
        setPayMethod('CASH');
        setCashReceived('');
        setSearchQuery('');
        setRoomResults([]);
        setClientResults([]);
        setSelectedRoom(null);
        setSelectedClient(null);
        setError(null);
        void loadConsumptions(table.id);
    }, [loadConsumptions]);

    const closeDetail = useCallback(() => {
        setDetailTable(null);
        setConsumptions([]);
        setConsumptionTotal(0);
        setDetailCart([]);
        setChargeMode(null);
    }, []);

    /* ── Detail modal: cart management ── */
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

    /* ── Send items to kitchen (persist to pos_table_consumptions) ── */
    const sendToKitchen = async () => {
        if (!detailTable || detailCart.length === 0) return;
        setBusy(true);
        setError(null);
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
            setFlash('Pedido enviado à cozinha/bar!');
            setTimeout(() => setFlash(null), 2500);
            void loadConsumptions(detailTable.id);
            void loadTables();
        } catch (err) {
            console.error('[POSTablet] erro ao enviar pedido', err);
            setError('Erro ao enviar pedido. Tente novamente.');
        } finally {
            setBusy(false);
        }
    };

    /* ── Cancel a consumption item (manager permission) ── */
    const cancelConsumption = async (consumption: TableConsumption) => {
        if (!detailTable) return;
        setBusy(true);
        setError(null);
        try {
            await localOperation('pos.tableConsumptions.update', {
                id: consumption.id,
                status: 'CANCELADO',
            });
            setFlash('Item cancelado.');
            setTimeout(() => setFlash(null), 2000);
            void loadConsumptions(detailTable.id);
        } catch (err) {
            console.error('[POSTablet] erro ao cancelar item', err);
            setError('Erro ao cancelar item.');
        } finally {
            setBusy(false);
        }
    };

    /* ── Dual search: rooms + clients ── */
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
            console.error('[POSTablet] erro na pesquisa', err);
        } finally {
            setSearching(false);
        }
    };

    /* ── Cash change calculation ── */
    const change = useMemo(() => {
        const received = parseFloat(cashReceived.replace(',', '.'));
        if (Number.isNaN(received) || received < consumptionTotal + detailCartTotal) return null;
        return received - (consumptionTotal + detailCartTotal);
    }, [cashReceived, consumptionTotal, detailCartTotal]);

    /* ── Rótulos e formatação de pagamento ───────────────────────────────────── */
const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Dinheiro',
    TPA: 'TPA',
    TRANSFER: 'Transferência',
    ROOM: 'Conta do Quarto',
};
const fmt = (v: number) => Number(v).toFixed(2).replace('.', ',');

/* ─────────────────────────────────────────────
   Impressão térmica de talão
   ───────────────────────────────────────────── */
const printThermalReceipt = async (table: PosTable, items: Array<{product: Product; qty: number}>, total: number, payMethod: string, payLabel: string) => {
    const impressaoOK = await sendThermalReceipt({
        title: 'HR-HOSPITALITY POS',
        headerLines: [
            `Data/Hora: ${new Date().toLocaleString('pt-PT', { hour12: false })}`,
            `Mesa: ${table.code}`,
            `Garçom: ${user?.name ?? 'Garçom'}`,
        ],
        items: items.map(i => ({ name: i.product.name, qty: i.qty, total: i.product.price * i.qty })),
        total: fmt(total),
        payLabel,
        footerLines: ['Obrigado e volte sempre!'],
    });

    if (impressaoOK) {
        setFlash(`Talão térmico impresso — ${payLabel} ${fmt(total)}`);
    } else {
        setFlash(`Falha na impressão — ${payLabel} ${fmt(total)} (verificar impressora)`);
    }
};

/* ── Confirm payment / close table ── */
const confirmCharge = async () => {
        if (!detailTable) return;
        const grandTotal = consumptionTotal + detailCartTotal;
        if (grandTotal <= 0) return;
        if (chargeMode === 'ROOM' && !selectedRoom && !selectedClient) return;
        // O troco só faz sentido no pagamento imediato — em modo QUARTO o
        // valor recebido em numerário é irrelevante. Antes este guard bloqueava
        // silenciosamente o "Lançar na Conta" (payMethod nasce em CASH e o
        // campo de numerário está vazio → change === null → retorno silencioso).
        if (chargeMode !== 'ROOM' && payMethod === 'CASH' && change === null) return;

        setBusy(true);
        setError(null);
        try {
            /* If there are unsent cart items, persist them first — e depois
               sincroniza o total local: uma nova tentativa (ex.: erro de
               validacao) re-executa este bloco e duplicaria os artigos. */
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
                setDetailCart([]);
                await loadConsumptions(detailTable.id);
            }

            if (chargeMode === 'ROOM') {
                // O lançamento exige um quarto com estadia activa. Se só o
                // cliente KYC foi seleccionado, resolve-se a estadia activa
                // desse cliente. (Antes, a selecção sem quarto caía no ramo de
                // pagamento imediato: a comanda era baixada sem lançar nada.)
                let alvo = selectedRoom;
                if (!alvo && selectedClient) {
                    const estadias = await localQuery<{ data?: Array<{ room_id: string | null; room_number: string | null; guest_name: string | null }> } | Array<{ room_id: string | null; room_number: string | null; guest_name: string | null }>>(
                        'data.select',
                        {
                            resource: 'hotel_reservations',
                            columns: ['room_id', 'room_number', 'guest_name'],
                            filters: [
                                { column: 'client_id', op: 'eq', value: selectedClient.id },
                                { column: 'status', op: 'in', value: ['CHECKED_IN'] },
                            ],
                            orderBy: [{ column: 'created_at', ascending: false }],
                            limit: 1,
                        },
                    );
                    const linhas = Array.isArray(estadias) ? estadias : (estadias?.data ?? []);
                    const estadia = linhas[0];
                    if (estadia?.room_id) {
                        alvo = {
                            id: estadia.room_id,
                            room_number: estadia.room_number ?? '',
                            guest_name: estadia.guest_name ?? selectedClient.full_name,
                            status: 'OCUPADO',
                        };
                    }
                }
                if (!alvo) {
                    setError('Sem estadia activa para este cliente — seleccione o quarto onde lançar a conta.');
                    return;
                }
                await localOperation('pos.tableTransferToRoom', {
                    table_id: detailTable.id,
                    room_id: alvo.id,
                    client_id: selectedClient?.id,
                });
                setFlash(`Lançado na conta do quarto ${alvo.room_number} — comanda liquidada!`);
            } else {
                /* Immediate payment: mark all as PAGO and free the table */
                await localOperation('pos.tableConsumptions.clear', {
                    table_id: detailTable.id,
                });
                printThermalReceipt(detailTable, detailCart, grandTotal, payMethod, PAYMENT_LABELS[payMethod]);
                setFlash(`Pagamento registado — ${PAYMENT_LABELS[payMethod]} ${fmt(grandTotal)}`);
            }
            setTimeout(() => setFlash(null), 3500);
            closeDetail();
            void loadTables();
        } catch (err) {
            // A mensagem real do servidor (ex.: "No active reservation for this
            // room.") é mostrada — antes só aparecia um genérico e parecia que
            // o botão não fazia nada.
            console.error('[POSTablet] erro ao confirmar cobrança', err);
            setError(err instanceof Error && err.message ? err.message : 'Erro ao processar pagamento. Tente novamente.');
        } finally {
            setBusy(false);
        }
    };

    /* ── Pré-computed classNames ── */
    const clsPanel = 'rounded-[28px] border border-white/10 bg-[#111111] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.6)]';
    const clsZoneBtn = (active: boolean) =>
        `flex items-center gap-2 px-4 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-wider transition-all ${
            active
                ? 'bg-[var(--brand-secondary)] border-[var(--brand-secondary)] text-black'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/25'
        }`;
    const clsTableCard = (selected: boolean, ring: string) =>
        `relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 min-h-[84px] cursor-pointer transition-all ${
            selected
                ? 'bg-[var(--brand-secondary)]/20 border-[var(--brand-secondary)] scale-[1.03] shadow-[0_0_24px_rgba(255,215,0,0.25)]'
                : `bg-white/[0.03] ${ring} hover:bg-white/[0.07] hover:scale-[1.02]`
        }`;

    const waiterName = user?.name ?? 'Garçom';
    const grandTotal = consumptionTotal + detailCartTotal;
    const isBalcão = zone === 'BALCAO';

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* ── Header ── */}
            <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">
                <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={goBack}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/10 transition-all"
                            title="Voltar ao Menu Principal (ESC)"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Voltar</span>
                        </button>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-secondary)]">
                            <Store className="h-5 w-5 text-black" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">POS Tablet</p>
                            <h1 className="text-base font-black uppercase tracking-tight">HR Gastro</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:flex">
                            <BedDouble className="h-4 w-4 text-[var(--brand-secondary)]" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                                {waiterName}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 pb-24">
                {/* ── Zone selector ── */}
                <section className="flex flex-wrap items-center gap-2">
                    {(['ALL', ...Object.keys(ZONE_LABELS)] as ZoneFilter[]).map(z => {
                        const active = zone === z;
                        const label = z === 'ALL' ? 'Todas' : ZONE_LABELS[z];
                        const counts = z === 'ALL' ? null : zoneCounts[z];
                        return (
                            <button key={z} onClick={() => setZone(z)} className={clsZoneBtn(active)}>
                                <span>{z === 'ALL' ? '🏠' : ZONE_ICONS[z]}</span>
                                <span>{label}</span>
                                {counts && (
                                    <span className="ml-1 flex items-center gap-1 text-[9px] opacity-80">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{counts.livre}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </section>

                {/* ── Balcão: quick-sale direct-sales cards ── */}
                {isBalcão ? (
                    <section className={clsPanel}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/70">
                                <Store className="h-4 w-4 text-[var(--brand-secondary)]" />
                                Balcão — Venda Rápida
                            </h2>
                            <button
                                onClick={() => void loadTables()}
                                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/50 hover:text-white"
                            >
                                <Loader2 className={`h-3 w-3 ${tablesLoading ? 'animate-spin' : ''}`} />
                                Actualizar
                            </button>
                        </div>
                        <p className="mb-4 text-xs text-white/40">
                            Selecione um posto de balcão para venda directa e fecho imediato.
                        </p>
                        {visibleTables.length === 0 ? (
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-white/40">
                                {tablesLoading ? 'A carregar…' : 'Sem postos de balcão.'}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                                {visibleTables.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => openDetail(t)}
                                        className={clsTableCard(false, STATUS_RING[t.status])}
                                    >
                                        <span className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`} />
                                        <span className="text-lg font-black leading-none">{t.name}</span>
                                        <span className="text-[9px] font-black uppercase tracking-wider text-white/40">
                                            {t.code}
                                        </span>
                                        <span
                                            className={`mt-0.5 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                                t.status === 'LIVRE'
                                                    ? 'bg-emerald-400/15 text-emerald-300'
                                                    : t.status === 'OCUPADA'
                                                      ? 'bg-rose-400/15 text-rose-300'
                                                      : 'bg-zinc-500/15 text-zinc-400'
                                            }`}
                                        >
                                            {STATUS_LABELS[t.status]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                ) : (
                    /* ── Restaurant zones: visual table map ── */
                    <section className={clsPanel}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/70">
                                <TableIcon className="h-4 w-4 text-[var(--brand-secondary)]" />
                                Mapa de Mesas
                            </h2>
                            <button
                                onClick={() => void loadTables()}
                                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/50 hover:text-white"
                            >
                                <Loader2 className={`h-3 w-3 ${tablesLoading ? 'animate-spin' : ''}`} />
                                Actualizar
                            </button>
                        </div>

                        <div className="mb-4 flex flex-wrap gap-3 text-[9px] font-black uppercase tracking-wider text-white/40">
                            {(['LIVRE', 'OCUPADA', 'RESERVADA', 'MANUTENCAO'] as const).map(s => (
                                <span key={s} className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                                    {STATUS_LABELS[s]}
                                </span>
                            ))}
                        </div>

                        {visibleTables.length === 0 ? (
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-white/40">
                                {tablesLoading ? 'A carregar mesas…' : 'Sem mesas nesta zona.'}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {visibleTables.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => openDetail(t)}
                                        className={clsTableCard(false, STATUS_RING[t.status])}
                                    >
                                        <span className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`} />
                                        <span className="text-lg font-black leading-none">{t.name}</span>
                                        <span className="text-[9px] font-black uppercase tracking-wider text-white/40">
                                            {t.code} · {t.seats} lugares
                                        </span>
                                        <span
                                            className={`mt-0.5 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                                t.status === 'LIVRE'
                                                    ? 'bg-emerald-400/15 text-emerald-300'
                                                    : t.status === 'OCUPADA'
                                                      ? 'bg-rose-400/15 text-rose-300'
                                                      : t.status === 'RESERVADA'
                                                        ? 'bg-amber-400/15 text-amber-300'
                                                        : 'bg-zinc-500/15 text-zinc-400'
                                            }`}
                                        >
                                            {STATUS_LABELS[t.status]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </main>

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
                            {/* Modal header: table status + elapsed + total */}
                            <div className="border-b border-white/10 px-6 py-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 ${STATUS_RING[detailTable.status]}`}>
                                            <TableIcon className={`h-6 w-6 ${detailTable.status === 'OCUPADA' ? 'text-rose-400' : 'text-emerald-400'}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black uppercase tracking-tight">{detailTable.name}</h3>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
                                                {detailTable.code} · {detailTable.seats} lugares · {ZONE_LABELS[detailTable.zone]}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={closeDetail} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white">
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    {/* Status pill */}
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Estado</p>
                                        <p className={`mt-1 flex items-center gap-2 text-sm font-black ${
                                            detailTable.status === 'OCUPADA' ? 'text-rose-300' : 'text-emerald-300'
                                        }`}>
                                            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[detailTable.status]}`} />
                                            {detailTable.status === 'OCUPADA' ? '🔴 Em consumo' : '🟢 Livre'}
                                        </p>
                                    </div>

                                    {/* Elapsed time */}
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Permanência</p>
                                        <p className="mt-1 flex items-center gap-2 text-sm font-black text-white/80">
                                            <Clock className="h-4 w-4 text-[var(--brand-secondary)]" />
                                            {consumptions.length > 0
                                                ? `Há ${elapsedMinutes(consumptions[consumptions.length - 1]?.created_at ?? new Date().toISOString())} min`
                                                : '—'}
                                        </p>
                                    </div>

                                    {/* Total accumulated */}
                                    <div className="rounded-2xl border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/10 px-4 py-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--brand-secondary)]/70">Total em dívida</p>
                                        <p className="mt-1 text-lg font-black text-[var(--brand-secondary)]">
                                            {fmt(grandTotal)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable body */}
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                {/* ── Consumption history ── */}
                                <div className="mb-5">
                                    <h4 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/50">
                                        <ShoppingCart className="h-3.5 w-3.5 text-[var(--brand-secondary)]" />
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
                                                    <li
                                                        key={c.id}
                                                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5"
                                                    >
                                                        <span className="w-8 text-center text-sm font-black text-[var(--brand-secondary)]">
                                                            {c.quantity}×
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-xs font-bold">{c.product_name}</p>
                                                            <p className="text-[10px] text-white/40">{fmt(c.unit_price)} / un</p>
                                                        </div>
                                                        <span
                                                            className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                                                c.status === 'ENVIADO'
                                                                    ? 'bg-amber-400/15 text-amber-300'
                                                                    : c.status === 'PENDENTE'
                                                                      ? 'bg-sky-400/15 text-sky-300'
                                                                      : 'bg-emerald-400/15 text-emerald-300'
                                                            }`}
                                                        >
                                                            {c.status === 'ENVIADO' ? 'Enviado' : c.status === 'PENDENTE' ? 'Pendente' : 'Pago'}
                                                        </span>
                                                        <span className="w-20 text-right text-xs font-black text-white/80">
                                                            {fmt(c.subtotal)}
                                                        </span>
                                                        {user?.role === 'ADMINISTRATOR' || user?.role === 'PERMISSAO' ? (
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

                                {/* ── Add products ── */}
                                <div className="mb-5">
                                    <h4 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/50">
                                        <Plus className="h-3.5 w-3.5 text-[var(--brand-secondary)]" />
                                        Adicionar Produtos
                                    </h4>
                                    <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                        {CATEGORIES.map(cat => {
                                            const Icon = cat.icon;
                                            const active = detailCategory === cat.name;
                                            return (
                                                <button
                                                    key={cat.name}
                                                    onClick={() => setDetailCategory(cat.name)}
                                                    className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all ${
                                                        active
                                                            ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]'
                                                            : 'border-white/10 bg-white/5 text-white/45 hover:text-white'
                                                    }`}
                                                >
                                                    <Icon className="h-3 w-3" />
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
                                                <span className="text-center text-[9px] font-bold leading-tight">{p.name}</span>
                                                <span className="text-[9px] font-black text-[var(--brand-secondary)]">{fmt(p.price)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Pending cart ── */}
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
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.02] disabled:opacity-40"
                                        >
                                            <ChefHat className="h-3.5 w-3.5" />
                                            {busy ? 'A enviar…' : 'Enviar à Cozinha'}
                                        </button>
                                    </div>
                                )}

                                {/* ── Charge mode selector ── */}
                                {chargeMode === null && grandTotal > 0 && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <button
                                            onClick={() => setChargeMode('IMMEDIATE')}
                                            className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-left transition-all hover:bg-emerald-400/15 hover:scale-[1.01]"
                                        >
                                            <Banknote className="h-6 w-6 text-emerald-300" />
                                            <div>
                                                <p className="text-sm font-black uppercase tracking-wider text-emerald-200">
                                                    💵 Pagamento Imediato
                                                </p>
                                                <p className="text-[10px] text-emerald-300/60">Numerário · TPA · Transferência</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => setChargeMode('ROOM')}
                                            className="flex items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-5 py-4 text-left transition-all hover:bg-sky-400/15 hover:scale-[1.01]"
                                        >
                                            <BedDouble className="h-6 w-6 text-sky-300" />
                                            <div>
                                                <p className="text-sm font-black uppercase tracking-wider text-sky-200">
                                                    🏨 Lançar na Conta do Quarto
                                                </p>
                                                <p className="text-[10px] text-sky-300/60">Por quarto ou Nº de cliente / KYC</p>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {/* ── IMMEDIATE payment panel ── */}
                                {chargeMode === 'IMMEDIATE' && (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-white/80">
                                                Pagamento Imediato — {fmt(grandTotal)}
                                            </h4>
                                            <button onClick={() => setChargeMode(null)} className="text-white/40 hover:text-white">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="mb-4 grid grid-cols-3 gap-2">
                                            {(['CASH', 'TPA', 'TRANSFER'] as PaymentMethod[]).map(m => {
                                                const active = payMethod === m;
                                                return (
                                                    <button
                                                        key={m}
                                                        onClick={() => setPayMethod(m)}
                                                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-wider transition-all ${
                                                            active
                                                                ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]'
                                                                : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                                                        }`}
                                                    >
                                                        {m === 'CASH' && <Wallet className="h-4 w-4" />}
                                                        {m === 'TPA' && <CreditCard className="h-4 w-4" />}
                                                        {m === 'TRANSFER' && <Home className="h-4 w-4" />}
                                                        {PAYMENT_LABELS[m]}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {payMethod === 'CASH' && (
                                            <div className="mb-4">
                                                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/40">
                                                    Valor recebido (AOA)
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={cashReceived}
                                                    onChange={e => setCashReceived(e.target.value)}
                                                    placeholder="Ex: 20000"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg font-black text-white placeholder:text-white/25 focus:border-[var(--brand-secondary)] focus:outline-none"
                                                />
                                                {change !== null && (
                                                    <p className="mt-2 flex items-center gap-2 text-sm font-black text-emerald-300">
                                                        <CheckCircle className="h-4 w-4" />
                                                        Troco: {fmt(change)}
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

                                {/* ── ROOM charge panel ── */}
                                {chargeMode === 'ROOM' && (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-white/80">
                                                Lançar na Conta do Quarto — {fmt(grandTotal)}
                                            </h4>
                                            <button onClick={() => setChargeMode(null)} className="text-white/40 hover:text-white">
                                                <X className="h-4 w-4" />
                                            </button>
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
                                                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[var(--brand-secondary)] focus:outline-none"
                                            />
                                            {searching && (
                                                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
                                            )}
                                        </div>

                                        {/* Rooms results */}
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
                                                                        ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-white'
                                                                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2 font-black">
                                                                    <BedDouble className="h-3.5 w-3.5" />
                                                                    Quarto {r.room_number}
                                                                </span>
                                                                <span className="truncate text-white/50">{r.guest_name ?? '—'}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Client results (KYC) */}
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
                                                                        ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-white'
                                                                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2 font-black">
                                                                    <User className="h-3.5 w-3.5" />
                                                                    {c.full_name}
                                                                </span>
                                                                <span className="flex items-center gap-1 text-white/50">
                                                                    <Hash className="h-3 w-3" />
                                                                    {c.client_number}
                                                                </span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {(selectedRoom || selectedClient) && (
                                            <p className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-300">
                                                <CheckCircle className="h-4 w-4" />
                                                {selectedRoom
                                                    ? `Quarto ${selectedRoom.room_number} (${selectedRoom.guest_name ?? '—'})`
                                                    : `${selectedClient?.full_name} — ${selectedClient?.client_number}`}
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

                            {/* Error / flash messages */}
                            {error && (
                                <div className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}
                            {flash && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300"
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    {flash}
                                </motion.div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {flash && !detailTable && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-6 py-4 shadow-2xl backdrop-blur-xl"
                    >
                        <CheckCircle className="h-6 w-6 text-emerald-300" />
                        <p className="text-sm font-black text-emerald-200">{flash}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
