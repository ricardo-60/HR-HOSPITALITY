/**
 * Acesso a dados dos módulos administrativos do hotel.
 *
 * Todas as operações passam pelo cliente Supabase autenticado e são filtradas
 * por `tenant_id` do perfil em sessão. A RLS (migrações 005/007/008) é a
 * fronteira real de autorização: mesmo que esta camada fosse alterada, o
 * `tenant_id` errado não devolve nada.
 */

import { supabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

/* ── Tipos ──────────────────────────────────────────────────────────────── */

export type KycStatus = 'PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'REJEITADO';
export type DocumentType = 'BI' | 'PASSAPORTE';
export type PaymentMethod = 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA' | 'TPA' | 'DINHEIRO' | 'CONTA_DO_QUARTO';
export type ProofStatus = 'EM_ANALISE' | 'APROVADO' | 'REJEITADO';
export type MovementType = 'ENTRADA' | 'SAIDA' | 'QUEBRA' | 'INVENTARIO' | 'AJUSTE';

export interface BankAccount {
  id: string;
  bank_name: string;
  iban: string;
  account_holder: string;
  account_type: 'CORRENTE' | 'POUPANCA';
  currency: string;
  supports_multicaixa_express: boolean;
  is_primary: boolean;
  is_active: boolean;
  instructions: string | null;
}

export interface GuestDocument {
  id: string;
  kind: 'BI_FRENTE' | 'BI_VERSO' | 'PASSAPORTE' | 'SELFIE';
  storage_path: string;
  mime_type: string | null;
}

export interface GuestProfile {
  id: string;
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  document_country: string | null;
  birth_date: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: KycStatus;
  kyc_notes: string | null;
  kyc_reviewed_at: string | null;
  created_at: string;
  documents?: GuestDocument[];
}

export interface PaymentProof {
  id: string;
  reservation_id: string | null;
  reservation_reference: string | null;
  guest_name: string | null;
  amount: number;
  method: PaymentMethod;
  payment_reference: string | null;
  transaction_code: string | null;
  storage_path: string;
  mime_type: string | null;
  status: ProofStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  average_cost: number;
  supplier: string | null;
  last_restock_at: string | null;
  is_active: boolean;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  item_name: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  reference_type: string | null;
  balance_after: number | null;
  created_at: string;
}

export interface OccupancyRow {
  room_id: string;
  room_number: string;
  room_type: string;
  status: string;
  price_per_night: number;
  guest_name: string | null;
  reference: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  reservation_status: string | null;
}

/* ── Base ───────────────────────────────────────────────────────────────── */

type Result<T> = { data: T; error: null } | { data: null; error: string };

function db() {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error('Supabase não configurado neste ambiente.');
  }
  return supabaseClient;
}

function message(error: { message: string } | null, fallback: string): string {
  return error?.message ? error.message : fallback;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ── IBANs ──────────────────────────────────────────────────────────────── */

const BANK_COLUMNS =
  'id,bank_name,iban,account_holder,account_type,currency,supports_multicaixa_express,is_primary,is_active,instructions';

export async function listBankAccounts(): Promise<Result<BankAccount[]>> {
  try {
    const { data, error } = await db()
      .from('tenant_bank_accounts')
      .select(BANK_COLUMNS)
      .order('is_primary', { ascending: false })
      .order('bank_name', { ascending: true });
    if (error) return { data: null, error: message(error, 'Falha ao carregar os IBANs.') };
    return { data: (data ?? []) as BankAccount[], error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export interface BankAccountInput {
  bank_name: string;
  iban: string;
  account_holder: string;
  account_type: 'CORRENTE' | 'POUPANCA';
  supports_multicaixa_express: boolean;
  is_primary: boolean;
  is_active: boolean;
  instructions: string;
}

export async function createBankAccount(input: BankAccountInput): Promise<Result<BankAccount>> {
  try {
    const { data, error } = await db()
      .from('tenant_bank_accounts')
      .insert({ ...input, iban: input.iban.replace(/\s+/g, '').toUpperCase() })
      .select(BANK_COLUMNS)
      .single();
    if (error) return { data: null, error: message(error, 'Falha ao registar o IBAN.') };
    return { data: data as BankAccount, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function updateBankAccount(id: string, input: BankAccountInput): Promise<Result<BankAccount>> {
  try {
    const { data, error } = await db()
      .from('tenant_bank_accounts')
      .update({ ...input, iban: input.iban.replace(/\s+/g, '').toUpperCase() })
      .eq('id', id)
      .select(BANK_COLUMNS)
      .single();
    if (error) return { data: null, error: message(error, 'Falha ao actualizar o IBAN.') };
    return { data: data as BankAccount, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function deleteBankAccount(id: string): Promise<Result<null>> {
  try {
    const { error } = await db().from('tenant_bank_accounts').delete().eq('id', id);
    if (error) return { data: null, error: message(error, 'Falha ao remover o IBAN.') };
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/* ── KYC ────────────────────────────────────────────────────────────────── */

const GUEST_COLUMNS =
  'id,full_name,document_type,document_number,document_country,birth_date,nationality,phone,email,kyc_status,kyc_notes,kyc_reviewed_at,created_at';

export async function listGuestProfiles(status?: KycStatus): Promise<Result<GuestProfile[]>> {
  try {
    let query = db()
      .from('guest_profiles')
      .select(GUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('kyc_status', status);
    const { data, error } = await query;
    if (error) return { data: null, error: message(error, 'Falha ao carregar os hóspedes.') };

    // Documentos carregados à parte: uma policy por tabela, e o N+1 fica
    // explícito em vez de escondido numa relação do PostgREST.
    const guests = (data ?? []) as GuestProfile[];
    const withDocs = await Promise.all(
      guests.map(async guest => {
        const { data: docs } = await db()
          .from('guest_documents')
          .select('id,kind,storage_path,mime_type')
          .eq('guest_profile_id', guest.id);
        return { ...guest, documents: (docs ?? []) as GuestDocument[] };
      })
    );
    return { data: withDocs, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/**
 * URL assinada de um documento de KYC.
 *
 * O bucket é privado: sem a assinatura, o ficheiro é inacessível. A assinatura é
 * gerada por pessoa e expira, por isso não pode ser guardada no estado da app.
 */
export async function signedDocumentUrl(storagePath: string): Promise<Result<string>> {
  try {
    const { data, error } = await db()
      .storage.from('kyc-documents')
      .createSignedUrl(storagePath, 300);
    if (error) return { data: null, error: message(error, 'Não foi possível abrir o documento.') };
    return { data: data.signedUrl, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function decideKyc(
  id: string,
  status: Extract<KycStatus, 'APROVADO' | 'REJEITADO' | 'EM_ANALISE'>,
  notes: string,
): Promise<Result<null>> {
  try {
    const { error } = await db()
      .from('guest_profiles')
      .update({ kyc_status: status, kyc_notes: notes || null })
      .eq('id', id);
    if (error) return { data: null, error: message(error, 'Falha ao decidir o KYC.') };
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/* ── Comprovativos ──────────────────────────────────────────────────────── */

const PROOF_COLUMNS =
  'id,reservation_id,amount,method,payment_reference,transaction_code,storage_path,mime_type,status,review_notes,reviewed_at,created_at';

interface ProofJoinRow {
  id: string;
  reservation_id: string | null;
  amount: number | string;
  method: PaymentMethod;
  payment_reference: string | null;
  transaction_code: string | null;
  storage_path: string;
  mime_type: string | null;
  status: ProofStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  hotel_reservations: { reference: string | null; guest_name: string | null } | null;
}

export async function listPaymentProofs(status?: ProofStatus): Promise<Result<PaymentProof[]>> {
  try {
    let query = db()
      .from('payment_proofs')
      .select(`${PROOF_COLUMNS},hotel_reservations(reference,guest_name)`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return { data: null, error: message(error, 'Falha ao carregar os comprovativos.') };

    const rows = (data ?? []) as unknown as ProofJoinRow[];
    return {
      data: rows.map(row => ({
        id: row.id,
        reservation_id: row.reservation_id,
        reservation_reference: row.hotel_reservations?.reference ?? null,
        guest_name: row.hotel_reservations?.guest_name ?? null,
        amount: toNumber(row.amount),
        method: row.method,
        payment_reference: row.payment_reference,
        transaction_code: row.transaction_code,
        storage_path: row.storage_path,
        mime_type: row.mime_type,
        status: row.status,
        review_notes: row.review_notes,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function signedProofUrl(storagePath: string): Promise<Result<string>> {
  try {
    const { data, error } = await db()
      .storage.from('payment-proofs')
      .createSignedUrl(storagePath, 300);
    if (error) return { data: null, error: message(error, 'Não foi possível abrir o comprovativo.') };
    return { data: data.signedUrl, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/**
 * Aprova ou rejeita um comprovativo. A migração 007 força a auditoria da
 * decisão e a 008 liga a reserva a `CONFIRMADA` quando o total é maior que
 * zero — nenhuma das duas é contornável por aqui.
 */
export async function decidePaymentProof(
  id: string,
  status: Extract<ProofStatus, 'APROVADO' | 'REJEITADO'>,
  notes: string,
  confirmReservation: boolean,
): Promise<Result<null>> {
  try {
    const { error } = await db()
      .from('payment_proofs')
      .update({ status, review_notes: notes || null })
      .eq('id', id);
    if (error) return { data: null, error: message(error, 'Falha ao validar o comprovativo.') };

    if (status === 'APROVADO' && confirmReservation) {
      const { data: proof } = await db()
        .from('payment_proofs')
        .select('reservation_id')
        .eq('id', id)
        .maybeSingle();

      if (proof?.reservation_id) {
        const { error: confirmError } = await db()
          .from('hotel_reservations')
          .update({ status: 'CONFIRMADA' })
          .eq('id', proof.reservation_id)
          .eq('status', 'PENDENTE_PAGAMENTO');
        if (confirmError) {
          return { data: null, error: message(confirmError, 'Comprovativo aprovado, mas a reserva não pôde ser confirmada.') };
        }
      }
    }
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/* ── Economato ──────────────────────────────────────────────────────────── */

const ITEM_COLUMNS =
  'id,sku,name,category,unit,current_stock,min_stock,average_cost,supplier,last_restock_at,is_active';

export async function listInventoryItems(): Promise<Result<InventoryItem[]>> {
  try {
    const { data, error } = await db()
      .from('inventory_items')
      .select(ITEM_COLUMNS)
      .order('name', { ascending: true });
    if (error) return { data: null, error: message(error, 'Falha ao carregar o stock.') };
    const rows = (data ?? []) as InventoryItem[];
    return {
      data: rows.map(item => ({
        ...item,
        current_stock: toNumber(item.current_stock),
        min_stock: toNumber(item.min_stock),
        average_cost: toNumber(item.average_cost),
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function createInventoryItem(input: {
  sku: string;
  name: string;
  category: string;
  unit: string;
  min_stock: number;
  supplier: string;
}): Promise<Result<InventoryItem>> {
  try {
    const { data, error } = await db()
      .from('inventory_items')
      .insert({ ...input, current_stock: 0, average_cost: 0, is_active: true })
      .select(ITEM_COLUMNS)
      .single();
    if (error) return { data: null, error: message(error, 'Falha ao criar o artigo.') };
    return { data: data as InventoryItem, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

export async function listInventoryMovements(limit = 60): Promise<Result<InventoryMovement[]>> {
  try {
    const { data, error } = await db()
      .from('inventory_movements')
      .select('id,item_id,movement_type,quantity,unit_cost,reason,reference_type,balance_after,created_at,inventory_items(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { data: null, error: message(error, 'Falha ao carregar os movimentos.') };

    const rows = (data ?? []) as unknown as Array<
      InventoryMovement & { inventory_items: { name: string } | null }
    >;
    return {
      data: rows.map(row => ({
        id: row.id,
        item_id: row.item_id,
        item_name: row.inventory_items?.name ?? '—',
        movement_type: row.movement_type,
        quantity: toNumber(row.quantity),
        unit_cost: row.unit_cost === null ? null : toNumber(row.unit_cost),
        reason: row.reason,
        reference_type: row.reference_type,
        balance_after: row.balance_after === null ? null : toNumber(row.balance_after),
        created_at: row.created_at,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/**
 * Regista um movimento de stock. O saldo NUNCA é enviado: é o trigger
 * `apply_inventory_movement` que o recalcula a partir da linha de histórico.
 */
export async function recordInventoryMovement(input: {
  item_id: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reason: string;
  reference_type: string | null;
}): Promise<Result<null>> {
  try {
    const { error } = await db().from('inventory_movements').insert({
      item_id: input.item_id,
      movement_type: input.movement_type,
      quantity: Math.abs(input.quantity),
      unit_cost: input.unit_cost,
      reason: input.reason || null,
      reference_type: input.reference_type,
    });
    if (error) return { data: null, error: message(error, 'Falha ao registar o movimento.') };
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/* ── Ocupação ───────────────────────────────────────────────────────────── */

export async function listOccupancy(): Promise<Result<OccupancyRow[]>> {
  try {
    const { data, error } = await db()
      .from('hotel_rooms')
      .select(
        'id,room_number,room_type,status,price_per_night,hotel_reservations(reference,guest_name,check_in_date,check_out_date,status)'
      )
      .order('room_number');
    if (error) return { data: null, error: message(error, 'Falha ao carregar a ocupação.') };

    type RoomJoinRow = {
      id: string;
      room_number: string;
      room_type: string;
      status: string;
      price_per_night: number | string;
      hotel_reservations: Array<{
        reference: string | null;
        guest_name: string | null;
        check_in_date: string | null;
        check_out_date: string | null;
        status: string | null;
      }> | null;
    };

    const rows = (data ?? []) as unknown as RoomJoinRow[];
    return {
      data: rows.map(room => {
        const active = (room.hotel_reservations ?? [])[0];
        return {
          room_id: room.id,
          room_number: room.room_number,
          room_type: room.room_type,
          status: room.status,
          price_per_night: toNumber(room.price_per_night),
          guest_name: active?.guest_name ?? null,
          reference: active?.reference ?? null,
          check_in_date: active?.check_in_date ?? null,
          check_out_date: active?.check_out_date ?? null,
          reservation_status: active?.status ?? null,
        };
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}

/* ── Ginásio (catálogo público/admin) ───────────────────────────────────── */

export interface GymPlan {
  id: string;
  name: string;
  plan_type: string;
  price: number;
  duration_days: number;
  guest_discount_pct: number;
  guest_included: boolean;
  description: string | null;
  is_active: boolean;
}

export async function listGymPlans(): Promise<Result<GymPlan[]>> {
  try {
    const { data, error } = await db()
      .from('gym_plans')
      .select('id,name,plan_type,price,duration_days,guest_discount_pct,guest_included,description,is_active')
      .order('sort_order');
    if (error) return { data: null, error: message(error, 'Falha ao carregar o ginásio.') };
    const rows = (data ?? []) as GymPlan[];
    return {
      data: rows.map(plan => ({
        ...plan,
        price: toNumber(plan.price),
        guest_discount_pct: toNumber(plan.guest_discount_pct),
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: message(error as Error, 'Supabase não configurado.') };
  }
}
