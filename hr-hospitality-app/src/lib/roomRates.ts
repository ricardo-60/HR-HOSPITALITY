/**
 * Tarifas de quarto e sessões horárias — contrato da migração 011.
 *
 * A tabela `room_rates`, a tabela `hourly_billing` e as funções `hr_*` só
 * passam a existir depois de a migração 011 ser aplicada. Em produção essa
 * migração ainda não correu, por isso TODAS as funções devolvem um resultado
 * tipado com o sinalizador `missing: true` quando a base de dados não conhece
 * a tabela ou a função. O painel mostra então um estado vazio explicativo e
 * nunca quebra a página.
 *
 * O RLS é a fronteira real de autorização (migração 011, secção 10): leitura
 * para a staff da instância, escrita para quem pode escrever no módulo de
 * alojamento e apagamento apenas para administradores.
 */

import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export type BillingMode = 'PER_DAY' | 'PER_HOUR';
export type RateScope = 'ROOM' | 'TYPE' | 'PROPERTY';
/** `0` = não se aplica (tarifa diária); `1 | 2 | 3` = bloco horário vendido. */
export type BlockHours = 0 | 1 | 2 | 3;

export interface RoomRate {
  id: string;
  room_id: string | null;
  room_type: string | null;
  label: string;
  billing_mode: BillingMode;
  block_hours: BlockHours;
  price: number;
  extra_hour_price: number | null;
  is_default: boolean;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

/** Linha a gravar (o `tenant_id` é sempre da sessão, nunca do formulário). */
export type RoomRateWrite = Omit<RoomRate, 'id'>;

export interface PickedRate {
  rate_id: string;
  price: number;
  extra: number | null;
  label: string;
  scope: RateScope;
}

export interface HourlyBillingSession {
  id: string;
  room_id: string;
  room_number: string | null;
  reservation_id: string | null;
  block_hours: number;
  rate: number;
  extra_hour_rate: number | null;
  started_at: string;
  ends_at: string;
  extensions: number;
  status: string;
}

export interface StartHourlyResult {
  hourly_billing_id: string;
  room_id: string;
  room_number: string;
  block_hours: number;
  rate: number;
  extra_hour_rate: number;
  started_at: string;
  ends_at: string;
  seconds_left: number;
}

export interface ExtendHourlyResult {
  hourly_billing_id: string;
  room_number: string;
  extra_hours: number;
  extensions: number;
  ends_at: string;
  seconds_left: number;
  extra_hour_rate: number;
  extra_amount: number;
}

export interface CloseHourlyResult {
  hourly_billing_id: string;
  room_number: string;
  hours_used: number;
  block_hours: number;
  extensions: number;
  amount_paid: number;
  closed_at: string;
}

export interface DbResult<T> {
  data: T | null;
  error: string | null;
  /** `true` quando a tabela/função da migração 011 ainda não existe. */
  missing: boolean;
}

export const MIGRATION_011_HINT =
  'A migração 011 (tarifas por hora e sessões horárias) ainda não foi aplicada a esta base de dados.';

/* ── Erros ────────────────────────────────────────────────────────────────── */

interface RawError {
  code?: unknown;
  message?: unknown;
}

function asError(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const raw = error as RawError;
    return {
      code: typeof raw.code === 'string' ? raw.code : '',
      message: typeof raw.message === 'string' ? raw.message : '',
    };
  }
  if (typeof error === 'string') return { code: '', message: error };
  return { code: '', message: '' };
}

/** Erro estrutural: a tabela ou a função da migração 011 ainda não existe. */
export function isMissingFeatureError(error: unknown): boolean {
  const { code, message } = asError(error);
  if (code === '42P01' || code === '42883' || code === 'PGRST202') return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('could not find the function') ||
    lower.includes('nonexistent table') ||
    lower.includes('não disponível offline') ||
    lower.includes('not available offline')
  );
}

function isNetworkError(message: string): boolean {
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|econnrefused|econnreset/i
    .test(message);
}

/**
 * Mensagem amigável (pt-PT) para o erro devolvido pela base de dados.
 * Os códigos conhecidos da migração 011 são traduzidos e o código é sempre
 * mostrado ao operador para facilitar o suporte.
 */
export function friendlyDbError(error: unknown, fallback: string, duplicate?: string): string {
  const { code, message } = asError(error);
  const clean = message.trim();
  const detail = clean && !/row-level security|permission denied for|violates/i.test(clean)
    ? ` Detalhe: ${clean}`
    : '';

  if (isMissingFeatureError(error)) return MIGRATION_011_HINT;

  switch (code) {
    case '42501':
      return `Sem permissão para esta operação: é necessária uma conta administrativa com escrita no módulo de Alojamento (código 42501).${detail}`;
    case '23505':
      return duplicate ?? 'Já existe um registo equivalente para este âmbito (código 23505).';
    case 'P0002':
      return 'Registo não encontrado — pode ter sido removido entretanto. Recarregue a página (código P0002).';
    case '23514':
      return 'A sessão horária já foi encerrada e não pode ser alterada (código 23514).';
    case '22023':
      return clean ? `${clean} (código 22023)` : `Parâmetro inválido (código 22023).`;
    case '23503':
      return 'O registo referenciado já não existe (código 23503).';
    default:
      if (isNetworkError(clean)) {
        return 'Sem ligação ao servidor. Verifique a rede e tente novamente.';
      }
      if (clean) return clean;
      return fallback;
  }
}

function ok<T>(data: T): DbResult<T> {
  return { data, error: null, missing: false };
}

function fail<T>(error: unknown, fallback: string, duplicate?: string): DbResult<T> {
  return {
    data: null,
    error: friendlyDbError(error, fallback, duplicate),
    missing: isMissingFeatureError(error),
  };
}

function unavailable<T>(): DbResult<T> {
  return {
    data: null,
    error: 'Supabase não configurado neste ambiente.',
    missing: false,
  };
}

/* ── Utilitários ──────────────────────────────────────────────────────────── */

function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normaliseRate(row: RoomRate): RoomRate {
  return {
    ...row,
    billing_mode: (row.billing_mode === 'PER_HOUR' ? 'PER_HOUR' : 'PER_DAY') as BillingMode,
    block_hours: (Number(row.block_hours) || 0) as BlockHours,
    price: toNumber(row.price),
    extra_hour_price: row.extra_hour_price == null ? null : toNumber(row.extra_hour_price),
    room_id: row.room_id ?? null,
    room_type: row.room_type ?? null,
    label: row.label || 'Tarifa',
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    valid_from: row.valid_from ?? null,
    valid_to: row.valid_to ?? null,
  };
}

/** Etiqueta do âmbito de aplicação da tarifa (quarto → tipo → propriedade). */
export function rateScopeLabel(scope: RateScope): string {
  switch (scope) {
    case 'ROOM': return 'Quarto';
    case 'TYPE': return 'Tipo de quarto';
    default: return 'Propriedade';
  }
}

/** Formatação de dinheiro alinhada com o resto do painel. */
export function formatAmount(value: number | null | undefined): string {
  const amount = value == null ? 0 : toNumber(value);
  return `${amount.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

/** Segundos até `endsAt` (ISO com timezone) relativos a `now` (epoch ms). */
export function secondsUntil(endsAt: string, now: number): number {
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return 0;
  return Math.floor((end - now) / 1000);
}

/** Contagem decrescente em mm:ss. Quem chamou trata do "expirado" (< 0). */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Horas cobradas: tecto de horas inteiras desde o arranque, mínimo 1. */
export function hoursUsed(startedAt: string, now: number): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.ceil((now - start) / 3_600_000));
}

/**
 * Pré-visualização do valor de fecho. Espelha a fórmula de
 * `hr_close_hourly_billing` (bloco contratado + hora extra ao tempo) para que
 * o operador veja o valor antes de confirmar; o valor final é sempre o que a
 * base de dados devolver.
 */
export function previewCloseAmount(session: HourlyBillingSession, now: number): number {
  const used = hoursUsed(session.started_at, now);
  const extra = session.extra_hour_rate == null ? 0 : toNumber(session.extra_hour_rate);
  return round2(toNumber(session.rate) + Math.max(used - session.block_hours, 0) * extra);
}

/* ── Permissões (espelho client-side das funções da migração 007) ─────────── */

export interface AlojamentoProfile {
  role: string;
  restrictions: string[];
  allowedModules: string[];
}

function mentionsModule(list: string[], module: string): boolean {
  return list.some(value =>
    value === module || value === `/${module}` || value.startsWith(`/${module}/`)
  );
}

/** Espelho de `hr_can_write_module('alojamento')` para desactivar botões. */
export function canWriteAlojamento(profile: AlojamentoProfile | null): boolean {
  if (!profile) return false;
  switch (profile.role) {
    case 'ADMINISTRATOR':
      return true;
    case 'PERMISSAO':
      return !mentionsModule(profile.restrictions, 'alojamento');
    case 'ACESSO':
      return profile.allowedModules.includes('*') || mentionsModule(profile.allowedModules, 'alojamento');
    default:
      // POS e EXECUTIVO não escrevem em alojamento.
      return false;
  }
}

/** Espelho de `hr_is_admin()` — exige o papel ADMINISTRATOR. */
export function isAdministrator(profile: AlojamentoProfile | null): boolean {
  return profile?.role === 'ADMINISTRATOR';
}

/* ── Consultas ────────────────────────────────────────────────────────────── */

const RATE_COLUMNS =
  'id,room_id,room_type,label,billing_mode,block_hours,price,extra_hour_price,is_default,is_active,valid_from,valid_to';

function client() {
  if (!isSupabaseConfigured || !supabaseClient) return null;
  return supabaseClient;
}

export async function listRoomRates(): Promise<DbResult<RoomRate[]>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const { data, error } = await db
      .from('room_rates')
      .select(RATE_COLUMNS)
      .order('billing_mode', { ascending: true })
      .order('block_hours', { ascending: true })
      .order('label', { ascending: true });
    if (error) return fail<RoomRate[]>(error, 'Não foi possível carregar as tarifas.');
    const rows = (data ?? []) as RoomRate[];
    return ok(rows.map(normaliseRate));
  } catch (error) {
    return fail<RoomRate[]>(error, 'Não foi possível carregar as tarifas.');
  }
}

export async function createRoomRate(draft: RoomRateWrite, tenantId: string): Promise<DbResult<RoomRate>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const { data, error } = await db
      .from('room_rates')
      .insert({ ...draft, tenant_id: tenantId })
      .select(RATE_COLUMNS)
      .single();
    if (error) {
      return fail<RoomRate>(
        error,
        'Não foi possível criar a tarifa.',
        'Já existe uma tarifa com este âmbito, modo de cobrança e bloco (código 23505).'
      );
    }
    return ok(normaliseRate(data as RoomRate));
  } catch (error) {
    return fail<RoomRate>(error, 'Não foi possível criar a tarifa.');
  }
}

export async function updateRoomRate(id: string, draft: RoomRateWrite): Promise<DbResult<RoomRate>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const { data, error } = await db
      .from('room_rates')
      .update(draft)
      .eq('id', id)
      .select(RATE_COLUMNS)
      .single();
    if (error) {
      return fail<RoomRate>(
        error,
        'Não foi possível actualizar a tarifa.',
        'Já existe uma tarifa com este âmbito, modo de cobrança e bloco (código 23505).'
      );
    }
    return ok(normaliseRate(data as RoomRate));
  } catch (error) {
    return fail<RoomRate>(error, 'Não foi possível actualizar a tarifa.');
  }
}

export async function deleteRoomRate(id: string): Promise<DbResult<null>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const { error } = await db.from('room_rates').delete().eq('id', id);
    if (error) return fail<null>(error, 'Não foi possível remover a tarifa.');
    return ok(null);
  } catch (error) {
    return fail<null>(error, 'Não foi possível remover a tarifa.');
  }
}

/**
 * `hr_pick_room_rate` — resolve a tarifa efectiva (quarto → tipo →
 * propriedade). `null` significa "sem tarifa registada" e não é um erro.
 */
export async function pickRoomRate(
  roomId: string,
  blockHours: BlockHours
): Promise<DbResult<PickedRate | null>> {
  return rpcCall<PickedRate | null>(
    'hr_pick_room_rate',
    { p_room_id: roomId, p_billing_mode: 'PER_HOUR', p_block_hours: blockHours },
    'Não foi possível resolver a tarifa horária.',
    undefined,
    raw => {
      if (raw == null || typeof raw !== 'object') return null;
      const row = raw as unknown as PickedRate;
      return {
        rate_id: String(row.rate_id ?? ''),
        price: toNumber(row.price),
        extra: row.extra == null ? null : toNumber(row.extra),
        label: String(row.label || 'Tarifa'),
        scope: (row.scope === 'ROOM' || row.scope === 'TYPE' ? row.scope : 'PROPERTY') as RateScope,
      };
    }
  );
}

/** `hr_room_rate` — preço efectivo com a rede de segurança do preço diário. */
export async function resolveRoomRate(
  roomId: string,
  billingMode: BillingMode,
  blockHours: BlockHours
): Promise<DbResult<number>> {
  return rpcCall<number>(
    'hr_room_rate',
    { p_room_id: roomId, p_billing_mode: billingMode, p_block_hours: blockHours },
    'Não foi possível calcular o preço efectivo.',
    undefined,
    raw => toNumber(raw)
  );
}

interface HourlyRow {
  id: string;
  room_id: string;
  reservation_id: string | null;
  block_hours: number;
  rate: number;
  extra_hour_rate: number | null;
  started_at: string;
  ends_at: string;
  extensions: number;
  status: string;
  hotel_rooms?: unknown;
}

function embeddedRoomNumber(value: unknown): string | null {
  const entry: unknown = Array.isArray(value) ? value[0] : value;
  if (entry && typeof entry === 'object' && 'room_number' in entry) {
    const roomNumber = (entry as { room_number?: unknown }).room_number;
    if (typeof roomNumber === 'string') return roomNumber;
  }
  return null;
}

/** Sessões horárias ainda em curso (o quadro desenha a contagem a partir daqui). */
export async function listActiveHourlyBilling(): Promise<DbResult<HourlyBillingSession[]>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const { data, error } = await db
      .from('hourly_billing')
      .select(
        'id,room_id,reservation_id,block_hours,rate,extra_hour_rate,started_at,ends_at,extensions,status,hotel_rooms(room_number)'
      )
      .eq('status', 'EM_CURSO')
      .order('ends_at', { ascending: true });
    if (error) return fail<HourlyBillingSession[]>(error, 'Não foi possível carregar as sessões horárias.');

    const rows = (data ?? []) as HourlyRow[];
    const sessions: HourlyBillingSession[] = rows.map(row => ({
      id: row.id,
      room_id: row.room_id,
      room_number: embeddedRoomNumber(row.hotel_rooms),
      reservation_id: row.reservation_id ?? null,
      block_hours: Number(row.block_hours) || 1,
      rate: toNumber(row.rate),
      extra_hour_rate: row.extra_hour_rate == null ? null : toNumber(row.extra_hour_rate),
      started_at: String(row.started_at ?? ''),
      ends_at: String(row.ends_at ?? ''),
      extensions: Number(row.extensions) || 0,
      status: String(row.status ?? 'EM_CURSO'),
    }));
    return ok(sessions);
  } catch (error) {
    return fail<HourlyBillingSession[]>(error, 'Não foi possível carregar as sessões horárias.');
  }
}

/* ── Sessões horárias (RPCs da migração 011) ──────────────────────────────── */

export async function startHourlyBilling(
  roomId: string,
  blockHours: 1 | 2 | 3,
  reservationId?: string | null
): Promise<DbResult<StartHourlyResult>> {
  return rpcCall<StartHourlyResult>(
    'hr_start_hourly_billing',
    {
      p_room_id: roomId,
      p_block_hours: blockHours,
      p_reservation_id: reservationId ?? null,
    },
    'Não foi possível abrir a sessão horária.',
    'Já existe uma sessão horária activa neste quarto (código 23505).',
    raw => ({
      hourly_billing_id: String(raw.hourly_billing_id ?? ''),
      room_id: String(raw.room_id ?? roomId),
      room_number: String(raw.room_number ?? ''),
      block_hours: Number(raw.block_hours) || blockHours,
      rate: toNumber(raw.rate),
      extra_hour_rate: toNumber(raw.extra_hour_rate),
      started_at: String(raw.started_at ?? ''),
      ends_at: String(raw.ends_at ?? ''),
      seconds_left: Number(raw.seconds_left) || 0,
    })
  );
}

export async function extendHourlyBilling(
  billingId: string,
  extraHours: 1 | 2 | 3
): Promise<DbResult<ExtendHourlyResult>> {
  return rpcCall<ExtendHourlyResult>(
    'hr_extend_hourly_billing',
    { p_billing_id: billingId, p_extra_hours: extraHours },
    'Não foi possível estender a sessão horária.',
    undefined,
    raw => ({
      hourly_billing_id: String(raw.hourly_billing_id ?? billingId),
      room_number: String(raw.room_number ?? ''),
      extra_hours: Number(raw.extra_hours) || extraHours,
      extensions: Number(raw.extensions) || 0,
      ends_at: String(raw.ends_at ?? ''),
      seconds_left: Number(raw.seconds_left) || 0,
      extra_hour_rate: toNumber(raw.extra_hour_rate),
      extra_amount: toNumber(raw.extra_amount),
    })
  );
}

export async function closeHourlyBilling(
  billingId: string,
  amountPaid?: number | null,
  notes?: string | null
): Promise<DbResult<CloseHourlyResult>> {
  return rpcCall<CloseHourlyResult>(
    'hr_close_hourly_billing',
    { p_billing_id: billingId, p_amount_paid: amountPaid ?? null, p_notes: notes ?? null },
    'Não foi possível fechar a sessão horária.',
    undefined,
    raw => ({
      hourly_billing_id: String(raw.hourly_billing_id ?? billingId),
      room_number: String(raw.room_number ?? ''),
      hours_used: Number(raw.hours_used) || 0,
      block_hours: Number(raw.block_hours) || 0,
      extensions: Number(raw.extensions) || 0,
      amount_paid: toNumber(raw.amount_paid),
      closed_at: String(raw.closed_at ?? ''),
    })
  );
}

/* ── Motor de RPC ─────────────────────────────────────────────────────────── */

interface RpcResponse {
  data: unknown;
  error: unknown;
}

async function rpcCall<T>(
  name: string,
  args: Record<string, unknown>,
  fallback: string,
  duplicate: string | undefined,
  map: (raw: Record<string, unknown>) => T
): Promise<DbResult<T>> {
  const db = client();
  if (!db) return unavailable();
  try {
    const response = (await db.rpc(name, args)) as unknown as RpcResponse;
    if (response.error) return fail<T>(response.error, fallback, duplicate);
    if (response.data == null) {
      return fail<T>(new Error(fallback), fallback, duplicate);
    }
    return ok<T>(map(response.data as Record<string, unknown>));
  } catch (error) {
    return fail<T>(error, fallback, duplicate);
  }
}
