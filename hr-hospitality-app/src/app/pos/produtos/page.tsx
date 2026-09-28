'use client';

/**
 * Gestão de produtos do POS — `/pos/produtos`.
 *
 * O ponto de venda esconde automaticamente o artigo cujo stock chegou a zero;
 * aqui a regra inverte-se: os produtos com stock ≤ 0 continuam totalmente
 * visíveis e editáveis, marcados com o selo "Sem stock" para o gestor perceber
 * por que razão o artigo não aparece na tela de caixa.
 *
 * Fontes de dados:
 *   - `pos_products`             — carta do tenant (criar / editar / desactivar);
 *   - `inventory_items`          — selector de stock e saldos correntes;
 *   - `master_products_catalog`  — catálogo global (migração 011), importável
 *     com um clique; leitura livre, escrita exclusiva do Master Global.
 *
 * Compatibilidade: sem a migração 011 aplicada a página continua a funcionar —
 * a coluna `master_product_id` e a tabela `master_products_catalog` são
 * detectadas e removidas do fluxo, com aviso explícito na interface.
 */

import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Check,
    Package,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    Search,
    TriangleAlert,
    Upload,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import {
    MASTER_KINDS,
    MASTER_KIND_LABELS,
    MASTER_ORIGIN_LABELS,
    POS_CATEGORIES,
    POS_CATEGORY_LABELS,
    listInventoryItemsLite,
    listMasterCatalog,
    listPosProducts,
    savePosProduct,
    setPosProductActive,
    type InventoryItemLite,
    type MasterProduct,
    type PosProduct,
} from '@/lib/productCatalog';

/* ── Formatação ────────────────────────────────────────────────────────── */

const CURRENCY_FMT = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'AOA' });
const STOCK_FMT = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });

const fmtCurrency = (value: number): string => CURRENCY_FMT.format(value);
const fmtStock = (value: number): string => STOCK_FMT.format(value);

/* ── Formulário ────────────────────────────────────────────────────────── */

interface ProductFormState {
    name: string;
    sku: string;
    category: string;
    unit: string;
    price: string;
    affects_inventory: boolean;
    inventory_item_id: string;
    is_active: boolean;
    master_product_id: string | null;
    master_name: string | null;
}

const EMPTY_FORM: ProductFormState = {
    name: '',
    sku: '',
    category: 'COMIDA',
    unit: 'un',
    price: '',
    affects_inventory: false,
    inventory_item_id: '',
    is_active: true,
    master_product_id: null,
    master_name: null,
};

type StatusFilter = 'TODOS' | 'ACTIVOS' | 'INACTIVOS' | 'SEM_STOCK';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'TODOS', label: 'Todos' },
    { key: 'ACTIVOS', label: 'Activos' },
    { key: 'INACTIVOS', label: 'Inactivos' },
    { key: 'SEM_STOCK', label: 'Sem stock' },
];

function isOutOfStock(product: PosProduct): boolean {
    return product.affects_inventory && product.stock !== null && product.stock <= 0;
}

/* ── Página ────────────────────────────────────────────────────────────── */

export default function PosProdutosPage() {
    const { user, hasPermission } = useAuth();
    const canWrite = hasPermission('pos_cashier') && user?.role !== 'EXECUTIVO';

    /* Produtos + economato */
    const [products, setProducts] = useState<PosProduct[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([]);
    const [inventoryError, setInventoryError] = useState<string | null>(null);
    const [hasMasterColumn, setHasMasterColumn] = useState(true);
    const [stockUnavailable, setStockUnavailable] = useState(false);
    const [loading, setLoading] = useState(true);

    /* Mensagens */
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    /* Catálogo mestre */
    const [catalogItems, setCatalogItems] = useState<MasterProduct[]>([]);
    const [catalogUnavailable, setCatalogUnavailable] = useState(false);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogKind, setCatalogKind] = useState('ALL');
    const [catalogCategory, setCatalogCategory] = useState('ALL');

    /* Filtros da lista */
    const [filterText, setFilterText] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('TODOS');

    /* Formulário */
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [produtosResult, inventarioResult] = await Promise.all([
            listPosProducts(),
            listInventoryItemsLite(),
        ]);
        setLoading(false);

        setHasMasterColumn(produtosResult.hasMasterColumn);
        setStockUnavailable(produtosResult.stockUnavailable);
        if (produtosResult.error) {
            setError(produtosResult.error);
            setProducts([]);
        } else {
            setError(null);
            setProducts(produtosResult.products);
        }

        setInventoryItems(inventarioResult.items);
        setInventoryError(inventarioResult.error);
    }, []);

    const refreshCatalog = useCallback(async () => {
        setCatalogLoading(true);
        const result = await listMasterCatalog({
            search: catalogSearch,
            kind: catalogKind,
            category: catalogCategory,
        });
        setCatalogLoading(false);
        setCatalogUnavailable(result.unavailable);
        setCatalogError(result.error);
        setCatalogItems(result.items);
    }, [catalogSearch, catalogKind, catalogCategory]);

    // Carregamento diferido: o estado inicial é sempre a lista vazia, pelo que
    // o HTML exportado não depende de rede.
    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refreshCatalog(); }, 300);
        return () => window.clearTimeout(timer);
    }, [refreshCatalog]);

    const stats = useMemo(() => {
        const activos = products.filter(product => product.is_active).length;
        const semStock = products.filter(isOutOfStock).length;
        const doCatalogo = products.filter(product => Boolean(product.master_product_id)).length;
        return {
            total: products.length,
            activos,
            inactivos: products.length - activos,
            semStock,
            doCatalogo,
        };
    }, [products]);

    const filtered = useMemo(() => {
        const term = filterText.trim().toLowerCase();
        return products.filter(product => {
            if (term && !`${product.name} ${product.sku}`.toLowerCase().includes(term)) return false;
            if (filterCategory !== 'ALL' && product.category !== filterCategory) return false;
            if (filterStatus === 'ACTIVOS' && !product.is_active) return false;
            if (filterStatus === 'INACTIVOS' && product.is_active) return false;
            if (filterStatus === 'SEM_STOCK' && !isOutOfStock(product)) return false;
            return true;
        });
    }, [products, filterText, filterCategory, filterStatus]);

    const selectedInventory = useMemo(
        () => inventoryItems.find(item => item.id === form.inventory_item_id) ?? null,
        [inventoryItems, form.inventory_item_id],
    );
    const linkedStockZero = form.affects_inventory
        && selectedInventory !== null
        && selectedInventory.current_stock <= 0;

    /* ── Acções ─────────────────────────────────────────────────────────── */

    const clearMessages = () => {
        setError(null);
        setNotice(null);
        setWarning(null);
    };

    const openNew = () => {
        clearMessages();
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormOpen(true);
    };

    const openEdit = (product: PosProduct) => {
        clearMessages();
        setEditingId(product.id);
        setForm({
            name: product.name,
            sku: product.sku,
            category: product.category,
            unit: product.unit,
            price: String(product.price),
            affects_inventory: product.affects_inventory,
            inventory_item_id: product.inventory_item_id ?? '',
            is_active: product.is_active,
            master_product_id: product.master_product_id,
            master_name: product.master?.name ?? null,
        });
        setFormOpen(true);
    };

    /** Importa uma entrada do catálogo mestre: pré-preenche e deixa o gestor ajustar. */
    const importFromCatalog = (entry: MasterProduct) => {
        clearMessages();
        setEditingId(null);
        setForm({
            name: entry.name,
            sku: entry.sku,
            category: entry.category,
            unit: entry.unit,
            price: String(entry.suggested_price),
            affects_inventory: false,
            inventory_item_id: '',
            is_active: true,
            master_product_id: entry.id,
            master_name: entry.name,
        });
        setFormOpen(true);
        setNotice(
            `A importar "${entry.name}" do catálogo mestre — confirme o preço sugerido ` +
            `(${fmtCurrency(entry.suggested_price)}) antes de gravar.`,
        );
    };

    const save = async () => {
        if (!user) return;
        clearMessages();

        const name = form.name.trim();
        const sku = form.sku.trim().toUpperCase();
        const price = Number(form.price.replace(',', '.'));
        if (name.length < 2) { setError('O nome do produto deve ter pelo menos 2 caracteres.'); return; }
        if (!sku) { setError('O SKU é obrigatório.'); return; }
        if (!Number.isFinite(price) || price < 0) { setError('Indique um preço válido.'); return; }
        if (form.affects_inventory && !form.inventory_item_id) {
            setError('Escolha o artigo de economato ligado ou desligue "consome stock".');
            return;
        }

        setSaving(true);
        const result = await savePosProduct(
            {
                name,
                sku,
                category: form.category,
                unit: form.unit.trim() || 'un',
                price,
                affects_inventory: form.affects_inventory,
                inventory_item_id: form.affects_inventory ? form.inventory_item_id : null,
                is_active: form.is_active,
                master_product_id: form.master_product_id,
            },
            { tenantId: user.tenantId, id: editingId ?? undefined, linkMaster: hasMasterColumn },
        );
        setSaving(false);
        if (result.error) { setError(result.error); return; }

        // Avisos não bloqueantes: o produto é gravado na mesma.
        const avisos: string[] = [];
        if (form.affects_inventory && selectedInventory && selectedInventory.current_stock <= 0) {
            avisos.push(
                `O artigo "${selectedInventory.name}" está sem stock — o produto fica registado, ` +
                'mas permanece oculto no ecrã de vendas até haver reposição.',
            );
        }
        if (form.master_product_id && !hasMasterColumn) {
            avisos.push('A ligação ao catálogo mestre não foi gravada: a migração 011 ainda não está aplicada.');
        }

        setNotice(editingId ? `Produto "${name}" actualizado.` : `Produto "${name}" criado.`);
        setWarning(avisos.length > 0 ? avisos.join(' ') : null);
        setFormOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        await refresh();
    };

    const toggleActive = async (product: PosProduct) => {
        if (!canWrite) return;
        clearMessages();
        const { error: toggleError } = await setPosProductActive(product.id, !product.is_active);
        if (toggleError) { setError(toggleError); return; }
        setNotice(`Produto "${product.name}" ${product.is_active ? 'desactivado' : 'activado'}.`);
        await refresh();
    };

    /* ── Render ─────────────────────────────────────────────────────────── */

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-8 pb-20 px-4">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-b border-white/10 pb-8">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <Package className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">Produtos do POS</h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                Carta, preços e stock
                            </p>
                        </div>
                        <Link
                            href="/pos"
                            className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao POS
                        </Link>
                    </div>
                </motion.div>

                {/* Indicadores */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Produtos</p>
                        <p className="text-4xl font-black text-white mt-2">{stats.total}</p>
                        <p className="text-xs text-white/40 mt-1">na carta desta instância</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Activos</p>
                        <p className="text-4xl font-black text-emerald-400 mt-2">{stats.activos}</p>
                        <p className="text-xs text-white/40 mt-1">{stats.inactivos} inactivo(s) fora da venda</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Sem stock</p>
                        <p className={`text-4xl font-black mt-2 ${stats.semStock > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {stats.semStock}
                        </p>
                        <p className="text-xs text-white/40 mt-1">ocultos no ecrã de vendas, visíveis aqui</p>
                    </div>
                    <div className="glass-panel rounded-[24px] border border-white/5 p-6">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Do catálogo mestre</p>
                        <p className="text-4xl font-black text-[var(--brand-primary)] mt-2">{stats.doCatalogo}</p>
                        <p className="text-xs text-white/40 mt-1">
                            {hasMasterColumn ? 'ligações ao catálogo global' : 'migração 011 por aplicar'}
                        </p>
                    </div>
                </div>

                {/* Mensagens */}
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
                        <button onClick={() => setNotice(null)} className="ml-auto" aria-label="Fechar">
                            <X className="w-4 h-4 text-emerald-300" />
                        </button>
                    </div>
                ) : null}
                {warning ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                        <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0" />
                        <p className="text-sm text-amber-200">{warning}</p>
                        <button onClick={() => setWarning(null)} className="ml-auto" aria-label="Fechar">
                            <X className="w-4 h-4 text-amber-300" />
                        </button>
                    </div>
                ) : null}

                {stockUnavailable ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <TriangleAlert className="w-4 h-4 text-white/40 shrink-0" />
                        <p className="text-sm text-white/50">
                            Saldo de stock indisponível: a função <span className="font-mono text-white/70">hr_pos_stock</span>{' '}
                            exige a migração 011. Os produtos continuam listados, com o stock marcado como desconhecido.
                        </p>
                    </div>
                ) : null}

                {/* Formulário + catálogo mestre */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {canWrite ? (
                        <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4 self-start">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    {editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    {editingId ? 'Editar produto' : 'Novo produto'}
                                </h2>
                                {formOpen ? (
                                    <button
                                        onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM); clearMessages(); }}
                                        className="text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white"
                                    >
                                        Fechar
                                    </button>
                                ) : (
                                    <button
                                        onClick={openNew}
                                        className="text-[10px] font-black uppercase tracking-wider text-[var(--brand-primary)] hover:text-white"
                                    >
                                        Criar produto
                                    </button>
                                )}
                            </div>

                            {formOpen ? (
                                <div className="space-y-4">
                                    {form.master_product_id ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--brand-primary)]">
                                                Catálogo mestre
                                            </span>
                                            <span className="text-xs text-white/70 truncate">{form.master_name ?? form.master_product_id}</span>
                                            <button
                                                onClick={() => setForm(f => ({ ...f, master_product_id: null, master_name: null }))}
                                                className="ml-auto text-white/40 hover:text-rose-300"
                                                aria-label="Desligar do catálogo mestre"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-white/35 leading-relaxed">
                                            Produto da casa: sem ligação ao catálogo mestre. Use o painel ao lado para importar
                                            uma entrada existente em vez de a recriar.
                                        </p>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Nome do produto"
                                            className="col-span-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                        />
                                        <input
                                            value={form.sku}
                                            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                                            placeholder="SKU"
                                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
                                        />
                                        <select
                                            value={form.category}
                                            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                        >
                                            {POS_CATEGORIES.map(category => (
                                                <option key={category} value={category}>
                                                    {POS_CATEGORY_LABELS[category] ?? category}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            value={form.unit}
                                            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                                            placeholder="un, kg, L"
                                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                        />
                                        <input
                                            value={form.price}
                                            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                            placeholder="Preço (Kz)"
                                            inputMode="decimal"
                                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, affects_inventory: !f.affects_inventory }))}
                                            className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-colors ${
                                                form.affects_inventory
                                                    ? 'bg-[var(--brand-primary)]/15 border-[var(--brand-primary)]/40 text-white'
                                                    : 'bg-white/5 border-white/10 text-white/50'
                                            }`}
                                        >
                                            Consome stock do economato
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                            className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-colors ${
                                                form.is_active
                                                    ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
                                                    : 'bg-white/5 border-white/10 text-white/50'
                                            }`}
                                        >
                                            {form.is_active ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </div>

                                    {form.affects_inventory ? (
                                        <div className="space-y-3">
                                            <select
                                                value={form.inventory_item_id}
                                                onChange={e => setForm(f => ({ ...f, inventory_item_id: e.target.value }))}
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                            >
                                                <option value="">Escolher artigo do economato…</option>
                                                {inventoryItems.map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} ({item.sku}) — {fmtStock(item.current_stock)} {item.unit}
                                                        {item.is_active ? '' : ' · inactivo'}
                                                    </option>
                                                ))}
                                            </select>

                                            {inventoryError ? (
                                                <p className="text-[11px] text-amber-300">
                                                    Economato indisponível ({inventoryError}) — não é possível escolher um artigo.
                                                </p>
                                            ) : inventoryItems.length === 0 && !inventoryError ? (
                                                <p className="text-[11px] text-white/40">
                                                    Sem artigos no economato.{' '}
                                                    <Link href="/economato" className="text-[var(--brand-primary)] hover:underline">
                                                        Criar no módulo Economato
                                                    </Link>
                                                    .
                                                </p>
                                            ) : null}

                                            {selectedInventory ? (
                                                <div className="grid grid-cols-3 gap-3 text-xs rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                                    <div>
                                                        <p className="text-white/35">Artigo</p>
                                                        <p className="font-black text-white mt-0.5 truncate">{selectedInventory.name}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-white/35">SKU</p>
                                                        <p className="font-black text-white/70 mt-0.5 font-mono">{selectedInventory.sku}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-white/35">Stock actual</p>
                                                        <p className={`font-black mt-0.5 ${selectedInventory.current_stock <= 0 ? 'text-rose-300' : 'text-white'}`}>
                                                            {fmtStock(selectedInventory.current_stock)} {selectedInventory.unit}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : null}

                                            {linkedStockZero ? (
                                                <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5">
                                                    <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-amber-200 leading-relaxed">
                                                        O artigo ligado já está sem stock. Pode gravar na mesma — o produto fica
                                                        registado, mas só volta a aparecer na caixa depois de uma entrada de stock.
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => void save()}
                                            disabled={saving}
                                            className="flex-1 px-5 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
                                        >
                                            {saving ? 'A gravar…' : editingId ? 'Guardar alterações' : 'Criar produto'}
                                        </button>
                                        <button
                                            onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM); clearMessages(); }}
                                            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-wider"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={openNew}
                                    className="w-full px-5 py-4 rounded-xl border border-dashed border-white/15 text-white/50 text-xs font-black uppercase tracking-wider hover:border-[var(--brand-primary)]/50 hover:text-white transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Criar um prato ou produto novo
                                </button>
                            )}
                        </div>
                    ) : null}

                    {/* Catálogo mestre */}
                    <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-4 self-start">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-black text-white uppercase tracking-wider">Catálogo mestre</h2>
                                <p className="text-[11px] text-white/35 mt-1">
                                    Dicionário global de produtos — leitura livre, escrita apenas do Master Global.
                                </p>
                            </div>
                            <button
                                onClick={() => void refreshCatalog()}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-wider hover:text-white"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <div className="relative flex-1 min-w-[180px]">
                                <Search className="w-3.5 h-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={catalogSearch}
                                    onChange={e => setCatalogSearch(e.target.value)}
                                    placeholder="Procurar por nome ou SKU…"
                                    className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                />
                            </div>
                            <select
                                value={catalogKind}
                                onChange={e => setCatalogKind(e.target.value)}
                                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            >
                                <option value="ALL">Todos os tipos</option>
                                {MASTER_KINDS.map(kind => (
                                    <option key={kind} value={kind}>{MASTER_KIND_LABELS[kind] ?? kind}</option>
                                ))}
                            </select>
                            <select
                                value={catalogCategory}
                                onChange={e => setCatalogCategory(e.target.value)}
                                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            >
                                <option value="ALL">Todas as categorias</option>
                                {POS_CATEGORIES.map(category => (
                                    <option key={category} value={category}>
                                        {POS_CATEGORY_LABELS[category] ?? category}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {catalogUnavailable ? (
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <p className="text-xs font-black text-white/60 uppercase tracking-widest mb-1">
                                    Catálogo mestre indisponível
                                </p>
                                <p className="text-[11px] text-white/45 leading-relaxed">
                                    A tabela <span className="font-mono">master_products_catalog</span> ainda não existe nesta
                                    base de dados — a migração 011 não foi aplicada. Pode criar produtos da casa no formulário
                                    ao lado; a importação fica disponível assim que a migração correr.
                                </p>
                            </div>
                        ) : catalogError ? (
                            <p className="text-xs text-rose-300">{catalogError}</p>
                        ) : catalogLoading ? (
                            <p className="text-sm text-white/40">A carregar o catálogo…</p>
                        ) : catalogItems.length === 0 ? (
                            <p className="text-sm text-white/40">Sem resultados para os filtros escolhidos.</p>
                        ) : (
                            <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {catalogItems.map(entry => (
                                    <li
                                        key={entry.id}
                                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-black text-white truncate">{entry.name}</p>
                                                {!entry.is_active ? (
                                                    <span className="px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[9px] font-black uppercase text-white/40">
                                                        inactivo
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-[10px] text-white/35 font-mono mt-0.5">
                                                {entry.sku} · {MASTER_KIND_LABELS[entry.kind] ?? entry.kind} ·{' '}
                                                {POS_CATEGORY_LABELS[entry.category] ?? entry.category} ·{' '}
                                                {MASTER_ORIGIN_LABELS[entry.origin] ?? entry.origin}
                                            </p>
                                            {entry.description ? (
                                                <p className="text-[11px] text-white/30 truncate mt-0.5">{entry.description}</p>
                                            ) : null}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-black text-white">{fmtCurrency(entry.suggested_price)}</p>
                                            <p className="text-[9px] text-white/30 uppercase tracking-widest">sugerido</p>
                                        </div>
                                        <button
                                            onClick={() => importFromCatalog(entry)}
                                            disabled={!canWrite}
                                            title={canWrite ? 'Importar para a carta deste tenant' : 'Sem permissão de escrita'}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/35 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[var(--brand-primary)]/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                        >
                                            <Upload className="w-3.5 h-3.5" /> Importar
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Lista de produtos */}
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Carta do POS</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={filterText}
                                    onChange={e => setFilterText(e.target.value)}
                                    placeholder="Procurar produto ou SKU…"
                                    className="pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                                />
                            </div>
                            <select
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
                            >
                                <option value="ALL">Todas as categorias</option>
                                {POS_CATEGORIES.map(category => (
                                    <option key={category} value={category}>
                                        {POS_CATEGORY_LABELS[category] ?? category}
                                    </option>
                                ))}
                            </select>
                            {STATUS_FILTERS.map(option => (
                                <button
                                    key={option.key}
                                    onClick={() => setFilterStatus(option.key)}
                                    className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-colors ${
                                        filterStatus === option.key
                                            ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                            <button
                                onClick={() => void refresh()}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-wider hover:text-white"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--brand-secondary)]/20 bg-[var(--brand-secondary)]/5 px-4 py-3">
                        <p className="text-[11px] text-white/55 leading-relaxed">
                            <span className="font-black uppercase tracking-widest text-[var(--brand-secondary)]">Regra de stock zero — </span>
                            os produtos com stock ≤ 0 continuam visíveis e editáveis aqui, com o selo
                            <span className="text-rose-300 font-black"> Sem stock</span>. Só ficam ocultos na tela de vendas do POS,
                            até o economato registar uma entrada.
                        </p>
                    </div>

                    {loading ? (
                        <div className="glass-panel rounded-[24px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/40">A carregar a carta…</p>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="glass-panel rounded-[24px] border border-white/5 p-10 text-center space-y-3">
                            <p className="text-sm text-white/50">Ainda não existem produtos registados no POS.</p>
                            {canWrite ? (
                                <button
                                    onClick={openNew}
                                    className="px-5 py-3 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-black uppercase tracking-wider"
                                >
                                    Criar o primeiro produto
                                </button>
                            ) : null}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="glass-panel rounded-[24px] border border-white/5 p-10 text-center">
                            <p className="text-sm text-white/50">Nenhum produto corresponde aos filtros actuais.</p>
                        </div>
                    ) : (
                        <div className="glass-panel rounded-[24px] border border-white/5 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 px-5">Produto</th>
                                        <th className="py-3 pr-4">Categoria</th>
                                        <th className="py-3 pr-4 text-right">Preço</th>
                                        <th className="py-3 pr-4">Stock</th>
                                        <th className="py-3 pr-4">Catálogo mestre</th>
                                        <th className="py-3 pr-4">Estado</th>
                                        <th className="py-3 pr-5 text-right">Acções</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(product => (
                                        <tr key={product.id} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 px-5">
                                                <p className="text-white font-black truncate max-w-[240px]">{product.name}</p>
                                                <p className="text-[10px] text-white/35 font-mono">{product.sku}</p>
                                            </td>
                                            <td className="py-3 pr-4 text-white/55">
                                                {POS_CATEGORY_LABELS[product.category] ?? product.category}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-white/75 whitespace-nowrap">
                                                {fmtCurrency(product.price)}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {product.affects_inventory ? (
                                                    product.stock === null ? (
                                                        <span className="px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[10px] font-black uppercase text-white/45">
                                                            desconhecido
                                                        </span>
                                                    ) : product.stock <= 0 ? (
                                                        <span className="inline-block">
                                                            <span className="px-2 py-0.5 rounded-full border border-rose-400/30 bg-rose-500/10 text-[10px] font-black uppercase text-rose-300">
                                                                sem stock
                                                            </span>
                                                            <span className="block text-[9px] text-rose-300/70 uppercase tracking-wider mt-1">
                                                                oculto no POS
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-white/70 whitespace-nowrap">
                                                            {fmtStock(product.stock)} {product.unit}
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-white/30">n/a</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {product.master ? (
                                                    <span className="text-white/60 truncate block max-w-[180px]">
                                                        {product.master.name}
                                                    </span>
                                                ) : product.master_product_id ? (
                                                    <span className="text-white/35 text-xs">ligado (indisponível)</span>
                                                ) : (
                                                    <span className="text-white/30 text-xs">produto da casa</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${
                                                    product.is_active
                                                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                                        : 'border-white/15 bg-white/5 text-white/40'
                                                }`}>
                                                    {product.is_active ? 'activo' : 'inactivo'}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-5">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openEdit(product)}
                                                        disabled={!canWrite}
                                                        className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                                        aria-label={`Editar ${product.name}`}
                                                        title="Editar"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => void toggleActive(product)}
                                                        disabled={!canWrite}
                                                        className={`p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            product.is_active
                                                                ? 'bg-white/5 border-white/10 text-white/50 hover:text-rose-300'
                                                                : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
                                                        }`}
                                                        aria-label={`${product.is_active ? 'Desactivar' : 'Activar'} ${product.name}`}
                                                        title={product.is_active ? 'Desactivar' : 'Activar'}
                                                    >
                                                        <Power className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Nota explicativa */}
                <div className="glass-panel rounded-[28px] border border-white/5 p-6 space-y-2">
                    <p className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Como funciona</p>
                    <p className="text-sm text-white/60 leading-relaxed">
                        O saldo nunca é escrito aqui: vem de <span className="text-white">inventory_items.current_stock</span>,
                        mantido pelos movimentos do economato. Um produto ligado ao stock com saldo zero fica oculto na caixa e
                        continua editável neste ecrã. As entradas do <span className="text-white">master_products_catalog</span>{' '}
                        são somente de leitura para a instância — só o Master Global altera o catálogo global; importar uma
                        entrada apenas cria (ou liga) o produto local com o preço sugerido.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
