/** Tipos do painel executivo. Espelham as tabelas das migrações 007 e 008. */

export type UserRole = 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO' | 'POS' | 'EXECUTIVO';

export type PaymentMethod = 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA' | 'TPA' | 'DINHEIRO' | 'CONTA_DO_QUARTO';

export type MovementType = 'ENTRADA' | 'SAIDA' | 'QUEBRA' | 'INVENTARIO' | 'AJUSTE';

export type StockState = 'RUTURA' | 'BAIXO' | 'OK';

/** Tipologia da propriedade, migrada em 010 para `tenants.property_type`. */
export type PropertyType = 'HOTEL' | 'HOSPEDARIA' | 'RESORT' | 'COMPLEXO';

/** Serviços ativos da propriedade, migrados em 010 para `tenants.active_services`. */
export type TenantService = 'ROOMS' | 'BAR' | 'RESTAURANT' | 'POOL' | 'GYM' | 'LAUNDRY' | 'EVENTS';

/**
 * Identidade comercial do tenant para o cabeçalho dinâmico.
 *
 * `propertyType` e `activeServices` são `null`/vazios quando a migração 010
 * ainda não foi aplicada: o cabeçalho degrada para o nome, sem partir.
 */
export interface TenantIdentity {
  name: string | null;
  companyName: string | null;
  propertyType: PropertyType | null;
  activeServices: TenantService[];
}

export const PROPERTY_LABEL: Record<PropertyType, string> = {
  HOTEL: 'Hotel',
  HOSPEDARIA: 'Hospedaria',
  RESORT: 'Resort',
  COMPLEXO: 'Complexo',
};

export const SERVICE_LABEL: Record<TenantService, string> = {
  ROOMS: 'Quartos',
  BAR: 'Bar',
  RESTAURANT: 'Restaurante',
  POOL: 'Piscina',
  GYM: 'Ginásio',
  LAUNDRY: 'Lavandaria',
  EVENTS: 'Eventos',
};

/** Ordem fixa dos chips de serviços no cabeçalho. */
export const SERVICE_ORDER: TenantService[] = ['ROOMS', 'BAR', 'RESTAURANT', 'POOL', 'GYM', 'LAUNDRY', 'EVENTS'];

/** Receita por meio de pagamento num período. */
export interface RevenueByMethod {
  method: PaymentMethod;
  total: number;
  orders: number;
}

export interface PeriodSummary {
  day: number;
  week: number;
  month: number;
  byMethod: RevenueByMethod[];
  /** Comparação homóloga: mesmo período do mês anterior. */
  previousMonth: number;
}

export interface OccupancySummary {
  totalRooms: number;
  occupied: number;
  available: number;
  outOfService: number;
  rate: number;
  pendingPayment: number;
  expectedArrivals: number;
  expectedDepartures: number;
}

export interface TopProduct {
  product_name: string;
  category: string;
  quantity: number;
  total: number;
}

export interface SalesBreakdown {
  byTable: { name: string; total: number }[];
  byRoom: { room_number: string | null; total: number }[];
}

export interface StockAlert {
  id: string;
  sku: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  state: StockState;
}

export interface StockMovementRow {
  id: string;
  item_name: string;
  movement_type: MovementType;
  quantity: number;
  balance_after: number | null;
  reason: string | null;
  created_at: string;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  MULTICAIXA_EXPRESS: 'Multicaixa Express',
  TRANSFERENCIA: 'Transferências',
  TPA: 'TPA',
  DINHEIRO: 'Dinheiro',
  CONTA_DO_QUARTO: 'Conta do quarto',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  QUEBRA: 'Quebra',
  INVENTARIO: 'Inventário',
  AJUSTE: 'Ajuste',
};

/** Sinal do movimento no histórico, para a coluna da tabela. */
export const MOVEMENT_SIGN: Record<MovementType, '+' | '−' | '='> = {
  ENTRADA: '+',
  SAIDA: '−',
  QUEBRA: '−',
  INVENTARIO: '=',
  AJUSTE: '=',
};

/* ── Relatórios ─────────────────────────────────────────────────────────── */

/** Janela de análise do ecrã de relatórios, em dias (inclusive o dia atual). */
export type ReportPeriod = 7 | 30 | 90;

/** Fluxo consolidado de um dia: entradas e saídas do razão. */
export interface DailyFlow {
  date: string;
  receita: number;
  despesa: number;
}

/** Linha de decomposição: total agrupado por uma origem ou categoria. */
export interface FlowBreakdown {
  key: string;
  label: string;
  total: number;
}

/** Resumo completo do ecrã de relatórios, já agregado e pronto a desenhar. */
export interface ReportsSummary {
  days: number;
  receitas: number;
  despesas: number;
  lucro: number;
  occupancyRate: number;
  series: DailyFlow[];
  receitasPorOrigem: FlowBreakdown[];
  despesasPorCategoria: FlowBreakdown[];
}
