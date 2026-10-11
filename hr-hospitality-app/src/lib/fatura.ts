/**
 * Domínio da fatura / extrato de conta do check-out.
 *
 * Fonte única de verdade para o ecrã de Fast Check-out e para as folhas
 * imprimíveis (A4 e bobina térmica de 80 mm): formatos de dinheiro, data/hora
 * no padrão DD/MM/AAAA HH:MM, rótulos das zonas de consumo e o contrato de
 * dados que a página de Alojamento prepara a partir do SQLite local.
 */
import { DEFAULT_TENANT, TenantConfig } from '@/config/tenants';

/* ── Formatos ────────────────────────────────────────────────────────────── */

export type FormatoFatura = 'A4' | 'TERMICO';

export type MetodoPagamento = 'NUMERARIO' | 'TPA' | 'TRANSFERENCIA';

export const METODOS_PAGAMENTO: ReadonlyArray<{ id: MetodoPagamento; label: string; curto: string }> = [
    { id: 'NUMERARIO', label: 'Numerário / Troco', curto: 'NUMERARIO' },
    { id: 'TPA', label: 'TPA / Multicaixa', curto: 'TPA' },
    { id: 'TRANSFERENCIA', label: 'Transferência', curto: 'TRANSFERENCIA' },
];

export const ROTULO_METODO: Record<MetodoPagamento, string> = {
    NUMERARIO: 'Numerário',
    TPA: 'TPA / Multicaixa',
    TRANSFERENCIA: 'Transferência',
};

/* ── Linhas do extrato ───────────────────────────────────────────────────── */

export interface LinhaFatura {
    /** 'ALOJAMENTO' agrupa-se à parte no resumo; o resto são extras/POS. */
    kind: 'ALOJAMENTO' | 'EXTRA';
    description: string;
    quantity: number;
    unitPrice: number;
    /** Total da linha (quantity × unitPrice). */
    value: number;
    category: string;
    /** ISO ou "YYYY-MM-DD HH:MM:SS" — o momento exacto do consumo. */
    registeredAt: string | null;
    /** Zona / ponto de venda: SNACK_BAR, RESTAURANTE, PISCINA, ... */
    zone: string | null;
    /** Mesa/dispositivo de origem: "Mesa Piscina 2", "Balcão 1", ... */
    origin: string | null;
}

export interface ClienteFatura {
    nome: string | null;
    numero: string | null;
    /** Documento KYC: "BI 004812345LA042", "NIF 5412345678", ... */
    documento: string | null;
    email: string | null;
}

export interface PagamentoFatura {
    method: MetodoPagamento;
    /** Valor introduzido pelo operador (só faz sentido em Numerário). */
    received: number;
    paid: number;
    change: number;
    pending: number;
}

export interface DadosFatura {
    numero: string;
    emitidoEm: string;
    guestName: string;
    roomNumber: string;
    /** Período da estadia: entrada e saída (datas ISO ou "YYYY-MM-DD"). */
    periodo: { entrada: string | null; saida: string | null };
    cliente: ClienteFatura;
    linhas: LinhaFatura[];
    alojamento: number;
    extras: number;
    taxas: number;
    total: number;
    pagamento: PagamentoFatura;
    auditToken: string;
}

/* ── Empresa (fatura oficial) ────────────────────────────────────────────── */

export interface EmpresaFatura {
    nome: string;
    nif: string;
    morada: string;
}

export function empresaFatura(tenant: TenantConfig = DEFAULT_TENANT): EmpresaFatura {
    return {
        nome: tenant.name,
        nif: tenant.nif ?? '',
        morada: [tenant.address, tenant.city].filter(Boolean).join(' - '),
    };
}

/* ── Formatação ──────────────────────────────────────────────────────────── */

/** 150 -> "150.00 Kz" */
export function money(valor: number | null | undefined): string {
    const numero = Number(valor ?? 0);
    return `${numero.toFixed(2)} ${DEFAULT_TENANT.currency}`;
}

/** 150 -> "150.00" (para campos alinhados em coluna) */
export function moneySemUnidade(valor: number | null | undefined): string {
    return Number(valor ?? 0).toFixed(2);
}

/**
 * Aceita ISO ("2026-10-10T13:45:00.000Z") e o formato SQLite
 * ("2026-10-10 13:45:00", que é UTC por omissão em `datetime('now')`).
 */
export function paraData(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const texto = String(iso).trim();
    if (!texto) return null;
    let normalizado = texto.includes('T') ? texto : texto.replace(' ', 'T');
    const temFuso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalizado);
    if (!temFuso) normalizado += 'Z';
    const data = new Date(normalizado);
    return Number.isNaN(data.getTime()) ? null : data;
}

const doisDigitos = (valor: number) => String(valor).padStart(2, '0');

/** DD/MM/AAAA */
export function formatarData(iso: string | null | undefined): string {
    const data = paraData(iso);
    if (!data) return '—';
    return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;
}

/** HH:MM */
export function formatarHora(iso: string | null | undefined): string {
    const data = paraData(iso);
    if (!data) return '—';
    return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

/** DD/MM/AAAA HH:MM — padrão obrigatório no extrato. */
export function formatarDataHora(iso: string | null | undefined): string {
    const data = paraData(iso);
    if (!data) return '—';
    return `${formatarData(iso)} ${formatarHora(iso)}`;
}

/* ── Zonas de consumo ────────────────────────────────────────────────────── */

const ROTULOS_ZONA: Record<string, string> = {
    RESTAURANTE: 'Restaurante Principal',
    SNACK_BAR: 'Snack-Bar',
    ESPLANADA: 'Esplanada',
    BALCAO: 'Balcão',
    PISCINA: 'Bar da Piscina',
    ROOM_SERVICE: 'Room Service',
    MINIBAR: 'Minibar',
    RECEPCAO: 'Recepção',
};

/** SNACK_BAR -> "Snack-Bar"; valor desconhecido -> próprio valor legível. */
export function rotuloZona(zone: string | null | undefined): string | null {
    if (!zone) return null;
    const chave = String(zone).trim().toUpperCase();
    if (!chave) return null;
    return ROTULOS_ZONA[chave] ?? chave.replace(/_/g, ' ').toLowerCase()
        .replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

/**
 * Origem legível de um consumo lançado a partir de uma mesa:
 *   "Mesa Piscina 2 (Bar da Piscina) → Transferido p/ Quarto 102"
 * Sem mesa, devolve apenas a zona; sem zona nem mesa, null.
 */
export function origemConsumo(
    zone: string | null | undefined,
    origin: string | null | undefined,
    roomNumber?: string | null,
): string | null {
    const zona = rotuloZona(zone);
    const mesa = origin ? String(origin).trim() : '';
    const destino = roomNumber ? `Transferido p/ Quarto ${roomNumber}` : null;
    if (mesa && zona) return `${mesa} (${zona})${destino ? ` → ${destino}` : ''}`;
    if (mesa) return destino ? `${mesa} → ${destino}` : mesa;
    if (zona) return destino ? `${zona} → ${destino}` : zona;
    return destino || null;
}

/* ── Resumo financeiro ───────────────────────────────────────────────────── */

export function resumoFatura(linhas: LinhaFatura[], taxas: number) {
    const alojamento = linhas
        .filter(linha => linha.kind === 'ALOJAMENTO')
        .reduce((acc, linha) => acc + linha.value, 0);
    const extras = linhas
        .filter(linha => linha.kind !== 'ALOJAMENTO')
        .reduce((acc, linha) => acc + linha.value, 0);
    const total = alojamento + extras + Number(taxas ?? 0);
    return { alojamento, extras, taxas: Number(taxas ?? 0), total };
}

/**
 * Troco só existe em numerário; em TPA/Transferência o valor aprovado é pago
 * na totalidade e nunca devolve troco.
 */
export function calcularPagamento(
    method: MetodoPagamento,
    recebido: number,
    total: number,
): PagamentoFatura {
    const recebidoSeguro = Number.isFinite(recebido) ? Math.max(0, recebido) : 0;
    const pago = Math.min(recebidoSeguro, total);
    return {
        method,
        received: recebidoSeguro,
        paid: pago,
        change: method === 'NUMERARIO' ? Math.max(0, recebidoSeguro - total) : 0,
        pending: Math.max(0, total - pago),
    };
}

/** FAC-20261010-143022 — legível, ordenável e único por segundo de emissão. */
export function gerarNumeroFatura(agora: Date = new Date()): string {
    const data = `${agora.getFullYear()}${doisDigitos(agora.getMonth() + 1)}${doisDigitos(agora.getDate())}`;
    const hora = `${doisDigitos(agora.getHours())}${doisDigitos(agora.getMinutes())}${doisDigitos(agora.getSeconds())}`;
    return `FAC-${data}-${hora}`;
}
