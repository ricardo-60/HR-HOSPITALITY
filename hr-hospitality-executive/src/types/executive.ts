/** Tipos do painel executivo. Espelham as tabelas das migrações 007 e 008. */

export type UserRole = 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO' | 'POS' | 'EXECUTIVO';

export type PaymentMethod = 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA' | 'TPA' | 'DINHEIRO' | 'CONTA_DO_QUARTO';

export type MovementType = 'ENTRADA' | 'SAIDA' | 'QUEBRA' | 'INVENTARIO' | 'AJUSTE';

export type StockState = 'RUTURA' | 'BAIXO' | 'OK';

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
