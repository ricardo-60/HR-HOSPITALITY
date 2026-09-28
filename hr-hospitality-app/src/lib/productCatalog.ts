/**
 * Catálogo de produtos do POS — constantes, tipos e queries reutilizáveis.
 *
 * Camada de acesso a três fontes:
 *
 *   - `pos_products`             — a carta do tenant (vendável no ponto de venda);
 *   - `inventory_items`          — o economato, dono do saldo (`current_stock`);
 *   - `master_products_catalog`  — o dicionário GLOBAL da migração 011, de leitura
 *     livre para qualquer sessão autenticada e de escrita exclusiva do Master
 *     Global.
 *
 * REGRA DE COMPATIBILIDADE: a produção ainda não tem a migração 011 aplicada.
 * Nada aqui lança excepções: cada operação degrada para o estado mais antigo
 * possível (sem coluna `master_product_id`, sem tabela
 * `master_products_catalog`, sem RPC `hr_pos_stock`) e devolve ao chamador o
 * motivo exacto para poder mostrar um estado vazio informativo.
 */

import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

/* ── Domínio ───────────────────────────────────────────────────────────── */

/** Vocabulário de `pos_products.category` (idêntico ao do catálogo mestre). */
export const POS_CATEGORIES = [
  'BEBIDA',
  'COMIDA',
  'CAFETERIA',
  'SNACK',
  'PISCINA',
  'GINASIO',
  'LAVANDARIA',
  'HOSPEDAGEM',
  'outro',
] as const;

/** Vocabulário de `master_products_catalog.kind`. */
export const MASTER_KINDS = ['BEBIDA', 'PRATO', 'LANCHE', 'SERVICO', 'OUTRO'] as const;

export const POS_CATEGORY_LABELS: Record<string, string> = {
  BEBIDA: 'Bebidas',
  COMIDA: 'Comidas',
  CAFETERIA: 'Cafeteria',
  SNACK: 'Snack',
  PISCINA: 'Piscina',
  GINASIO: 'Ginásio',
  LAVANDARIA: 'Lavandaria',
  HOSPEDAGEM: 'Hospedagem',
  outro: 'Outros',
};

export const MASTER_KIND_LABELS: Record<string, string> = {
  BEBIDA: 'Bebida',
  PRATO: 'Prato',
  LANCHE: 'Lanche',
  SERVICO: 'Serviço',
  OUTRO: 'Outro',
};

export const MASTER_ORIGIN_LABELS: Record<string, string> = {
  LOCAL: 'Local',
  GLOBAL: 'Internacional',
};

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export interface InventoryItemLite {
  id: string;
  sku: string;
  name: string;
  unit: string;
  current_stock: number;
  is_active: boolean;
}

export interface MasterRef {
  id: string;
  name: string;
  kind: string;
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  inventory_item_id: string | null;
  affects_inventory: boolean;
  is_active: boolean;
  /** Só existe com a migração 011 aplicada; `null` = produto da casa. */
  master_product_id: string | null;
  /** Saldo do artigo ligado ao economato; `null` = desconhecido. */
  stock: number | null;
  inventory_item: InventoryItemLite | null;
  master: MasterRef | null;
}

export interface MasterProduct {
  id: string;
  sku: string;
  name: string;
  kind: string;
  category: string;
  unit: string;
  suggested_price: number;
  origin: string;
  description: string | null;
  is_active: boolean;
}

export interface PosProductInput {
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  affects_inventory: boolean;
  inventory_item_id: string | null;
  is_active: boolean;
  master_product_id: string | null;
}

export interface ProductListResult {
  products: PosProduct[];
  /** `false` quando `pos_products.master_product_id` ainda não existe. */
  hasMasterColumn: boolean;
  /** `true` quando nem o economato nem a RPC conseguiram devolver saldos. */
  stockUnavailable: boolean;
  error: string | null;
}

export interface CatalogListResult {
  items: MasterProduct[];
  /** `true` quando `master_products_catalog` ainda não existe (011 em falta). */
  unavailable: boolean;
  error: string | null;
}

export interface SaveResult {
  product: PosProduct | null;
  error: string | null;
}

/* ── Erros ─────────────────────────────────────────────────────────────── */

function message(error: { message: string } | null | undefined, fallback: string): string {
  return error?.message ? error.message : fallback;
}

/** A tabela referenciada ainda não existe no schema cache nem no Postgres. */
export function isMissingRelation(errorText: string): boolean {
  return /\b42P01\b|\b42883\b|PGRST205|relation\s+"[^"]+"\s+does not exist|could not find the table/i
    .test(errorText);
}

/** A coluna referenciada ainda não existe (tipicamente `master_product_id`). */
export function isMissingColumn(errorText: string): boolean {
  return /\b42703\b|PGRST204|column\s+"[^"]+"\s+does not exist|could not find the .* column/i
    .test(errorText);
}

/** Erro 42501 / RLS: escrita recusada pela base de dados. */
export function isPermissionDenied(errorText: string): boolean {
  return /\b42501\b|permission denied|row-level security/i.test(errorText);
}

/** Traduz o erro de uma escrita para uma mensagem accionável em pt-PT. */
export function describeWriteError(errorText: string, fallback: string): string {
  if (isPermissionDenied(errorText)) {
    return 'Sem permissão para escrever (erro 42501): a base de dados recusou a operação. '
      + 'O catálogo mestre só é alterado pelo Master Global e a escrita de produtos do POS '
      + 'exige um perfil com permissão de escrita no módulo.';
  }
  if (isMissingRelation(errorText) || isMissingColumn(errorText)) {
    return 'A base de dados ainda não tem a migração 011 aplicada — a estrutura pedida não '
      + 'existe nesta instância. A operação foi omitida em vez de quebrar a página.';
  }
  if (/\b23505\b|duplicate key/i.test(errorText)) {
    return 'Já existe um produto com este SKU nesta instância. Escolha outro SKU.';
  }
  if (/\b23503\b|foreign key/i.test(errorText)) {
    return 'O artigo de stock indicado já não existe. Escolha outro artigo ou desligue o consumo de stock.';
  }
  if (/\b23514\b|check constraint/i.test(errorText)) {
    return 'Valores fora dos limites aceites (categoria, preço ou ligação ao stock). Reveja o formulário.';
  }
  return `${fallback} ${errorText}`.trim();
}

/* ── Base ──────────────────────────────────────────────────────────────── */

function db() {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error('Supabase não configurado neste ambiente.');
  }
  return supabaseClient;
}

export function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const POS_COLUMNS_BASE =
  'id,sku,name,category,unit,price,inventory_item_id,affects_inventory,is_active,created_at,updated_at';

interface PosProductRaw {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number | string;
  inventory_item_id: string | null;
  affects_inventory: boolean;
  is_active: boolean;
  master_product_id?: string | null;
}

/* ── Produtos do POS ───────────────────────────────────────────────────── */

/**
 * Lista a carta do tenant, já com o saldo do economato e a entrada do catálogo
 * mestre resolvidos do lado do cliente (sem embeds: a chave estrangeira para
 * `inventory_items` só é garantida depois da migração 011).
 */
export async function listPosProducts(): Promise<ProductListResult> {
  try {
    const client = db();

    const fetchRows = async (columns: string) => client
      .from('pos_products')
      .select(columns)
      .order('name', { ascending: true });

    let hasMasterColumn = true;
    let result = await fetchRows(`${POS_COLUMNS_BASE},master_product_id`);

    if (result.error && isMissingColumn(result.error.message)) {
      // Sem migração 011: a coluna `master_product_id` ainda não existe.
      hasMasterColumn = false;
      result = await fetchRows(POS_COLUMNS_BASE);
    }

    const { data, error } = result;
    if (error) {
      return { products: [], hasMasterColumn, stockUnavailable: false, error: message(error, 'Falha ao carregar os produtos.') };
    }

    const rows = ((data ?? []) as unknown as PosProductRaw[]).map(row => ({
      ...row,
      price: toNumber(row.price),
    }));

    // Saldos do economato — a fonte primária de stock.
    let stockUnavailable = false;
    const inventoryMap = new Map<string, InventoryItemLite>();
    const inventoryResult = await client
      .from('inventory_items')
      .select('id,sku,name,unit,current_stock,is_active')
      .order('name', { ascending: true });
    if (inventoryResult.error) {
      stockUnavailable = true;
    } else {
      for (const item of (inventoryResult.data ?? []) as InventoryItemLite[]) {
        inventoryMap.set(item.id, { ...item, current_stock: toNumber(item.current_stock) });
      }
    }

    // Rede de segurança: a RPC só existe com a migração 011 — se falhar,
    // ficamos com `stock = null` e a interface mostra "desconhecido".
    let stockById: Map<string, number> | null = null;
    if (stockUnavailable && rows.length > 0) {
      const ids = rows.map(row => row.id);
      const rpc = await client.rpc('hr_pos_stock', { p_product_ids: ids });
      if (!rpc.error && Array.isArray(rpc.data)) {
        stockById = new Map(
          (rpc.data as { product_id: string; quantity_in_stock: number | string }[])
            .map(entry => [entry.product_id, toNumber(entry.quantity_in_stock)]),
        );
        stockUnavailable = false;
      }
    }

    // Entradas do catálogo mestre — ignoradas em silêncio se a 011 faltar.
    const masterMap = new Map<string, MasterRef>();
    const masterIds = [...new Set(
      rows
        .map(row => row.master_product_id ?? null)
        .filter((id): id is string => Boolean(id)),
    )];
    if (masterIds.length > 0) {
      const catalog = await client
        .from('master_products_catalog')
        .select('id,name,kind')
        .in('id', masterIds);
      if (!catalog.error) {
        for (const entry of (catalog.data ?? []) as MasterRef[]) {
          masterMap.set(entry.id, entry);
        }
      }
    }

    const products: PosProduct[] = rows.map(row => {
      const inventory_item = row.inventory_item_id
        ? inventoryMap.get(row.inventory_item_id) ?? null
        : null;
      let stock: number | null = null;
      if (row.affects_inventory) {
        if (inventory_item) stock = inventory_item.current_stock;
        else if (stockById && row.inventory_item_id) stock = stockById.get(row.id) ?? 0;
      }
      return {
        id: row.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        unit: row.unit,
        price: row.price,
        inventory_item_id: row.inventory_item_id,
        affects_inventory: row.affects_inventory,
        is_active: row.is_active,
        master_product_id: row.master_product_id ?? null,
        stock,
        inventory_item,
        master: row.master_product_id ? masterMap.get(row.master_product_id) ?? null : null,
      };
    });

    return { products, hasMasterColumn, stockUnavailable, error: null };
  } catch (error) {
    return {
      products: [],
      hasMasterColumn: true,
      stockUnavailable: false,
      error: error instanceof Error ? error.message : 'Supabase não configurado.',
    };
  }
}

/** Artigos do economato para o selector "ligar a stock" do formulário. */
export async function listInventoryItemsLite(): Promise<{ items: InventoryItemLite[]; error: string | null }> {
  try {
    const { data, error } = await db()
      .from('inventory_items')
      .select('id,sku,name,unit,current_stock,is_active')
      .order('name', { ascending: true });
    if (error) return { items: [], error: message(error, 'Falha a carregar o economato.') };
    const items = ((data ?? []) as InventoryItemLite[]).map(item => ({
      ...item,
      current_stock: toNumber(item.current_stock),
    }));
    return { items, error: null };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : 'Supabase não configurado.' };
  }
}

/**
 * Cria ou actualiza um produto do tenant. Nunca lança: o chamador decide o que
 * mostrar. `linkMaster` é `false` quando a coluna `master_product_id` ainda não
 * existe — nesse caso o vínculo é simplesmente omitido do payload.
 */
export async function savePosProduct(
  input: PosProductInput,
  options: { tenantId: string; id?: string; linkMaster: boolean },
): Promise<SaveResult> {
  try {
    const client = db();
    const payload: Record<string, unknown> = {
      sku: input.sku,
      name: input.name,
      category: input.category,
      unit: input.unit,
      price: input.price,
      affects_inventory: input.affects_inventory,
      inventory_item_id: input.affects_inventory ? input.inventory_item_id : null,
      is_active: input.is_active,
    };
    if (options.linkMaster) payload.master_product_id = input.master_product_id;
    if (!options.id) payload.tenant_id = options.tenantId;

    const selectColumns = options.linkMaster
      ? `${POS_COLUMNS_BASE},master_product_id`
      : POS_COLUMNS_BASE;

    const result = options.id
      ? await client.from('pos_products').update(payload).eq('id', options.id).select(selectColumns).single()
      : await client.from('pos_products').insert(payload).select(selectColumns).single();

    if (result.error) {
      // Update sem linhas afectadas (RLS escondeu a linha) chega como PGRST116.
      if (result.error.code === 'PGRST116') {
        return {
          product: null,
          error: 'Nenhuma linha foi alterada: o produto não existe mais ou a sessão não tem permissão de escrita.',
        };
      }
      return { product: null, error: describeWriteError(result.error.message, 'Falha ao gravar o produto.') };
    }

    const row = result.data as unknown as PosProductRaw | null;
    if (!row) return { product: null, error: 'A base de dados não devolveu o produto gravado.' };

    const inventory_item = row.inventory_item_id
      ? (await listInventoryItemById(row.inventory_item_id))
      : null;

    return {
      product: {
        id: row.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        unit: row.unit,
        price: toNumber(row.price),
        inventory_item_id: row.inventory_item_id,
        affects_inventory: row.affects_inventory,
        is_active: row.is_active,
        master_product_id: row.master_product_id ?? null,
        stock: inventory_item?.current_stock ?? null,
        inventory_item,
        master: null,
      },
      error: null,
    };
  } catch (error) {
    return {
      product: null,
      error: error instanceof Error ? error.message : 'Supabase não configurado.',
    };
  }
}

async function listInventoryItemById(id: string): Promise<InventoryItemLite | null> {
  try {
    const { data, error } = await db()
      .from('inventory_items')
      .select('id,sku,name,unit,current_stock,is_active')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const item = data as InventoryItemLite;
    return { ...item, current_stock: toNumber(item.current_stock) };
  } catch {
    return null;
  }
}

/** Activa ou desactiva um produto (deixa de aparecer no ecrã de vendas). */
export async function setPosProductActive(id: string, isActive: boolean): Promise<{ error: string | null }> {
  try {
    const { error } = await db()
      .from('pos_products')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) return { error: describeWriteError(error.message, 'Falha ao alterar o estado do produto.') };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Supabase não configurado.' };
  }
}

/* ── Catálogo mestre ───────────────────────────────────────────────────── */

interface MasterProductRaw {
  id: string;
  sku: string;
  name: string;
  kind: string;
  category: string;
  unit: string;
  suggested_price: number | string;
  origin: string;
  description: string | null;
  is_active: boolean;
}

/**
 * Procura no catálogo global (pesquisa por nome/SKU + filtros de tipo e
 * categoria). Quando a tabela ainda não existe devolve
 * `unavailable: true` com `error: null` — o chamador mostra um estado
 * informativo, não um erro.
 */
export async function listMasterCatalog(filter: {
  search?: string;
  kind?: string;
  category?: string;
} = {}): Promise<CatalogListResult> {
  try {
    let query = db()
      .from('master_products_catalog')
      .select('id,sku,name,kind,category,unit,suggested_price,origin,description,is_active')
      .order('name', { ascending: true })
      .limit(60);

    const term = (filter.search ?? '').trim().replace(/[(),*%]/g, ' ').trim();
    if (term) query = query.or(`name.ilike.*${term}*,sku.ilike.*${term}*`);
    if (filter.kind && filter.kind !== 'ALL') query = query.eq('kind', filter.kind);
    if (filter.category && filter.category !== 'ALL') query = query.eq('category', filter.category);

    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error.message) || isMissingColumn(error.message)) {
        return { items: [], unavailable: true, error: null };
      }
      return { items: [], unavailable: false, error: message(error, 'Falha ao carregar o catálogo mestre.') };
    }

    const items = ((data ?? []) as MasterProductRaw[]).map(row => ({
      ...row,
      suggested_price: toNumber(row.suggested_price),
    }));
    return { items, unavailable: false, error: null };
  } catch (error) {
    return {
      items: [],
      unavailable: false,
      error: error instanceof Error ? error.message : 'Supabase não configurado.',
    };
  }
}

/* ── Classificação para os relatórios ──────────────────────────────────── */

export type ProductGroup = 'PRATO' | 'BEBIDA' | 'OUTRO';

export const PRODUCT_GROUP_LABELS: Record<ProductGroup, string> = {
  PRATO: 'Pratos',
  BEBIDA: 'Bebidas',
  OUTRO: 'Outros',
};

/**
 * Divide a venda entre pratos, bebidas e outros.
 *
 * Precedência: o `kind` do catálogo mestre (`PRATO`/`LANCHE` → prato,
 * `BEBIDA` → bebida) e, quando o produto não está ligado ao catálogo, a
 * categoria local do POS (`COMIDA`/`SNACK`/`CAFETERIA` → prato,
 * `BEBIDA` → bebida). Tudo o resto fica em "Outros".
 */
export function classifyProductGroup(
  kind: string | null | undefined,
  category: string | null | undefined,
): ProductGroup {
  if (kind) {
    if (kind === 'PRATO' || kind === 'LANCHE') return 'PRATO';
    if (kind === 'BEBIDA') return 'BEBIDA';
    return 'OUTRO';
  }
  switch ((category ?? '').toUpperCase()) {
    case 'COMIDA':
    case 'SNACK':
    case 'CAFETERIA':
      return 'PRATO';
    case 'BEBIDA':
      return 'BEBIDA';
    default:
      return 'OUTRO';
  }
}
