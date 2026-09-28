'use client';

/**
 * Suite de Relatórios Gerenciais — `/relatorios`.
 *
 * Sete relatórios de apenas leitura sobre os dados do tenant em sessão (a
 * RLS do Supabase continua a fronteira real de autorização):
 *
 *   A. Financeiro Executivo — DRE simplificado do razão consolidado. O razão
 *      é reconstruído por `hr_sync_financial_entries()` antes da leitura
 *      (função idempotente da migração 010).
 *   B. Ocupação e Diárias — taxa de ocupação, receita de diárias, RevPAR e
 *      origem/estado das reservas.
 *   C. POS e Vendas — comandas liquidadas, ticket médio, produtos mais
 *      vendidos e distribuição por forma de pagamento.
 *   D. Auditoria Operacional — rasto de auditoria e estado da licença.
 *   E. Horas vs Diárias — sessões de facturação horária (`hourly_billing`,
 *      migração 011) contra a receita de diárias, pelo período.
 *   F. Top Pratos / Top Bebidas — a carta mais vendida, classificada pelo
 *      `kind` do catálogo mestre com recurso à categoria local.
 *   G. Pré-contas Emitidas — visibilidade anti-fraude dos documentos
 *      (`pre_bill_logs`, migração 011): quantidade, valor e contextos.
 *
 * Os relatórios E, F e G degradam sem a migração 011 aplicada: mostram um
 * estado informativo e continuam a servir as partes que já existem.
 *
 * Gráficos SVG feitos à mão (sem bibliotecas de charts) e carregamento
 * diferido no cliente, compatível com `output: 'export'`.
 */

import { motion } from 'framer-motion';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Banknote,
    BarChart3,
    BedDouble,
    CalendarDays,
    ChefHat,
    Clock,
    FileText,
    Hourglass,
    Receipt,
    RefreshCw,
    ScrollText,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    TriangleAlert,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import {
    PRODUCT_GROUP_LABELS,
    classifyProductGroup,
    isMissingColumn,
    isMissingRelation,
    type ProductGroup,
} from '@/lib/productCatalog';
import {
    fetchHourlyBilling,
    fetchPreBills,
    type HourlyBillingRow,
    type PreBillFetchResult,
    type PreBillRow,
} from '@/lib/reportQueries';
import { isSupabaseConfigured, supabaseClient } from '@/lib/supabaseClient';

/* ── Formatação ──────────────────────────────────────────────────────────── */

const CURRENCY_FMT = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'AOA' });
const NUMBER_FMT = new Intl.NumberFormat('pt-PT');
const PERCENT_FMT = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 });
const DECIMAL_FMT = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });

/** Paleta dos gráficos: cores de marca + tons de apoio legíveis em fundo escuro. */
const CHART_PALETTE = ['#40E0D0', '#FFD700', '#0047AB', '#8B5CF6', '#F59E0B', '#34D399', '#FB7185', '#EC4899'];
const COR_ENTRADAS = '#34D399';
const COR_SAIDAS = '#FB7185';

function toNumber(value: unknown): number {
    const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    return Number.isFinite(n) ? n : 0;
}

const fmtCurrency = (value: number): string => CURRENCY_FMT.format(value);
const fmtNumber = (value: number): string => NUMBER_FMT.format(value);
const fmtPercent = (ratio: number): string => PERCENT_FMT.format(ratio);
const fmtDecimal = (value: number): string => DECIMAL_FMT.format(value);

/** "1234567" → "1,2M" para os eixos dos gráficos. */
function fmtCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
    if (abs >= 1000) return `${(Math.round(value / 100) / 10).toFixed(1).replace('.', ',')}k`;
    return String(Math.round(value));
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
}

function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('pt-PT')} ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ── Datas do período ──────────────────────────────────────────────────────── */

/** Data local em `yyyy-mm-dd` (formato dos inputs `date` e das colunas DATE). */
function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
}

/** Dias inclusivos entre duas datas ISO (`yyyy-mm-dd`). */
function periodDays(from: string, to: string): number {
    const a = Date.parse(`${from}T00:00:00`);
    const b = Date.parse(`${to}T00:00:00`);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
    return Math.round((b - a) / 86_400_000) + 1;
}

/** "2026-09-27" → "27/09" (rótulos dos eixos dos gráficos). */
function axisLabel(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}

/* ── Rótulos de domínio ──────────────────────────────────────────────────── */

const SOURCE_LABELS: Record<string, string> = {
    POS: 'POS — Vendas',
    DIARIA: 'Diárias — Alojamento',
    DESPESA: 'Despesas',
    MANUAL: 'Lançamentos Manuais',
};

const CATEGORY_LABELS: Record<string, string> = {
    POS: 'Vendas POS',
    DIARIA: 'Diárias',
    MANUAL: 'Manual',
    FORNECEDOR: 'Fornecedores',
    MANUTENCAO: 'Manutenção',
    COMPRA: 'Compras',
    SANGRIA: 'Sangria',
    SERVICOS: 'Serviços',
    SALARIOS: 'Salários',
    IMPOSTOS: 'Impostos',
    TRANSPORTE: 'Transportes',
    ENERGIA: 'Energia',
    OUTRO: 'Outras',
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
    quarto: 'Quarto',
    conferencia: 'Conferência',
    restaurante: 'Restaurante',
    transfer: 'Transfer',
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
    PENDENTE_PAGAMENTO: 'Pagamento Pendente',
    CONFIRMADA: 'Confirmada',
    CHECKED_IN: 'Check-in',
    CHECKED_OUT: 'Check-out',
    CANCELADA: 'Cancelada',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    MULTICAIXA_EXPRESS: 'Multicaixa Express',
    TRANSFERENCIA: 'Transferência',
    TPA: 'TPA',
    DINHEIRO: 'Dinheiro',
    CONTA_DO_QUARTO: 'Conta do Quarto',
};

const LICENSE_TYPE_LABELS: Record<string, string> = {
    TRAINING_GRACE: 'Formação (Grace)',
    MONTHLY: 'Mensal',
    QUARTERLY: 'Trimestral',
    SEMI_ANNUAL: 'Semestral',
    ANNUAL: 'Anual',
};

const HOURLY_STATUS_LABELS: Record<string, string> = {
    EM_CURSO: 'Em curso',
    PAGO: 'Paga',
    CANCELADA: 'Cancelada',
};

const PRE_BILL_DOC_TYPE_LABELS: Record<string, string> = {
    PRE_CONTA: 'Pré-conta',
    EXTRATO: 'Extrato do hóspede',
};

const PRE_BILL_CONTEXT_LABELS: Record<string, string> = {
    MESA: 'Mesa',
    QUARTO: 'Quarto',
    CONTA: 'Conta do hóspede',
};

/** Tom do "pill" de estado da reserva. */
function statusTone(status: string): string {
    switch (status) {
        case 'CONFIRMADA':
            return 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-300';
        case 'CHECKED_IN':
            return 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 text-[var(--brand-primary)]';
        case 'CHECKED_OUT':
            return 'bg-white/5 border border-white/15 text-white/50';
        case 'CANCELADA':
            return 'bg-rose-500/10 border border-rose-400/30 text-rose-300';
        default:
            return 'bg-amber-500/10 border border-amber-400/30 text-amber-300';
    }
}

/* ── Componentes de UI genéricos ─────────────────────────────────────────── */

/** Tom do "pill" de estado de uma sessão horária (migração 011). */
function hourlyTone(status: string): string {
    switch (status) {
        case 'PAGO':
            return 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-300';
        case 'EM_CURSO':
            return 'bg-amber-500/10 border border-amber-400/30 text-amber-300';
        case 'CANCELADA':
            return 'bg-rose-500/10 border border-rose-400/30 text-rose-300';
        default:
            return 'bg-white/5 border border-white/15 text-white/50';
    }
}

type KpiTone = 'default' | 'positive' | 'negative' | 'brand';

const KPI_TONE_CLASSES: Record<KpiTone, string> = {
    default: 'text-white',
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    brand: 'text-[var(--brand-accent)]',
};

function KpiCard({ label, value, hint, icon, tone = 'default' }: {
    label: string;
    value: string;
    hint?: string;
    icon: LucideIcon;
    tone?: KpiTone;
}) {
    const Icon = icon;
    return (
        <div className="glass-panel rounded-[24px] border border-white/5 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/25 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[var(--brand-primary)]" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black text-white/35 uppercase tracking-[0.25em]">{label}</p>
                <p className={`text-xl sm:text-2xl font-black mt-1 truncate ${KPI_TONE_CLASSES[tone]}`}>{value}</p>
                {hint ? <p className="text-[11px] text-white/35 mt-0.5">{hint}</p> : null}
            </div>
        </div>
    );
}

function SectionCard({ title, subtitle, children }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
}) {
    return (
        <div className="glass-panel rounded-[28px] border border-white/5 p-6 sm:p-8">
            <div className="mb-5">
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">{title}</h3>
                {subtitle ? <p className="text-[11px] text-white/35 mt-1">{subtitle}</p> : null}
            </div>
            {children}
        </div>
    );
}

function ErrorBanner({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
            <TriangleAlert className="w-4 h-4 text-rose-300 shrink-0" />
            <p className="text-sm text-rose-200">{message}</p>
        </div>
    );
}

/** Aviso informativo âmbar — usado quando falta a migração 011, não um erro. */
function InfoBanner({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0" />
            <p className="text-sm text-amber-200">{message}</p>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="glass-panel rounded-[24px] border border-white/5 p-10 text-center">
            <p className="text-sm text-white/45">Sem dados para o período seleccionado.</p>
        </div>
    );
}

function LoadingState({ label = 'A carregar…' }: { label?: string }) {
    return (
        <div className="glass-panel rounded-[24px] border border-white/5 p-10 flex items-center justify-center gap-3">
            <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />
            <p className="text-sm text-white/40">{label}</p>
        </div>
    );
}

interface BreakdownItem {
    label: string;
    total: number;
}

/** Lista de composição com barra proporcional — origem, categorias, estados, tabelas. */
function BreakdownList({ items, formatValue = fmtCurrency }: {
    items: BreakdownItem[];
    formatValue?: (value: number) => string;
}) {
    if (items.length === 0) {
        return <p className="text-sm text-white/35">Sem dados para o período seleccionado.</p>;
    }
    const max = Math.max(1, ...items.map(i => i.total));
    return (
        <ul className="space-y-3.5">
            {items.map(item => (
                <li key={item.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-white/60 truncate">{item.label}</span>
                        <span className="font-black text-white shrink-0">{formatValue(item.total)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${(item.total / max) * 100}%`, background: 'var(--brand-primary)' }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/* ── Gráficos SVG (sem dependências) ─────────────────────────────────────── */

interface RankEntry {
    name: string;
    units: number;
    revenue: number;
}

/** Lista ranqueada com barra proporcional — Top Pratos e Top Bebidas. */
function RankedList({ entries, formatValue = fmtCurrency }: {
    entries: RankEntry[];
    formatValue?: (value: number) => string;
}) {
    if (entries.length === 0) {
        return <p className="text-sm text-white/35">Sem vendas deste tipo no período seleccionado.</p>;
    }
    const max = Math.max(1, ...entries.map(entry => entry.revenue));
    return (
        <ol className="space-y-3.5">
            {entries.map((entry, index) => (
                <li key={entry.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-white/60 truncate">
                            <span className="text-white/30 font-mono mr-2">{index + 1}</span>
                            {entry.name}
                        </span>
                        <span className="text-xs text-white/40 shrink-0">{fmtNumber(entry.units)} un</span>
                        <span className="font-black text-white shrink-0">{formatValue(entry.revenue)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${(entry.revenue / max) * 100}%`, background: 'var(--brand-primary)' }}
                        />
                    </div>
                </li>
            ))}
        </ol>
    );
}

interface BarChartSeries {
    name: string;
    color: string;
    values: number[];
}

function BarChart({ labels, series, height = 260, formatValue = fmtCompact }: {
    labels: string[];
    series: BarChartSeries[];
    height?: number;
    formatValue?: (value: number) => string;
}) {
    const margin = { top: 30, right: 12, bottom: 34, left: 56 };
    const width = Math.max(640, labels.length * 56 + margin.left + margin.right);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const rawMax = Math.max(1, ...series.flatMap(s => s.values));
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const max = Math.ceil(rawMax / (magnitude / 2)) * (magnitude / 2);

    const band = innerW / Math.max(labels.length, 1);
    const barW = Math.max(2, (band * 0.62) / series.length);
    const labelStep = Math.max(1, Math.ceil(labels.length / 30));
    const showValues = labels.length <= 31;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
            {/* Grelhas horizontais + eixo Y */}
            {Array.from({ length: 5 }, (_, i) => {
                const y = margin.top + innerH - (innerH * i) / 4;
                const value = (max * i) / 4;
                return (
                    <g key={i}>
                        <line
                            x1={margin.left}
                            x2={width - margin.right}
                            y1={y}
                            y2={y}
                            stroke="rgba(255,255,255,0.07)"
                            strokeDasharray={i === 0 ? undefined : '3 4'}
                        />
                        <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.35)">
                            {formatValue(value)}
                        </text>
                    </g>
                );
            })}
            {/* Legenda (várias séries) */}
            {series.length > 1 ? (
                <g transform={`translate(${margin.left}, 12)`}>
                    {series.map((s, i) => (
                        <g key={s.name} transform={`translate(${i * 140}, 0)`}>
                            <rect x={0} y={-8} width={10} height={10} rx={2} fill={s.color} />
                            <text x={15} y={0} fontSize={10} fill="rgba(255,255,255,0.6)">{s.name}</text>
                        </g>
                    ))}
                </g>
            ) : null}
            {/* Barras + rótulos do eixo X */}
            {labels.map((label, i) => {
                const groupX = margin.left + band * i + band * 0.19;
                return (
                    <g key={label}>
                        {series.map((s, si) => {
                            const value = s.values[i] ?? 0;
                            const barH = (value / max) * innerH;
                            return (
                                <g key={s.name}>
                                    <rect
                                        x={groupX + si * barW}
                                        y={margin.top + innerH - barH}
                                        width={Math.max(1, barW - 2)}
                                        height={barH}
                                        rx={2}
                                        fill={s.color}
                                        opacity={value > 0 ? 0.95 : 0.2}
                                    />
                                    {showValues && value > 0 ? (
                                        <text
                                            x={groupX + si * barW + barW / 2 - 1}
                                            y={margin.top + innerH - barH - 6}
                                            textAnchor="middle"
                                            fontSize={9}
                                            fill="rgba(255,255,255,0.55)"
                                        >
                                            {formatValue(value)}
                                        </text>
                                    ) : null}
                                </g>
                            );
                        })}
                        {i % labelStep === 0 || i === labels.length - 1 ? (
                            <text
                                x={margin.left + band * i + band / 2}
                                y={height - 12}
                                textAnchor="middle"
                                fontSize={10}
                                fill="rgba(255,255,255,0.35)"
                            >
                                {label}
                            </text>
                        ) : null}
                    </g>
                );
            })}
        </svg>
    );
}

function HorizontalBarChart({ items, formatValue = fmtNumber }: {
    items: { label: string; value: number }[];
    formatValue?: (value: number) => string;
}) {
    const rowH = 36;
    const height = Math.max(60, items.length * rowH + 8);
    const max = Math.max(1, ...items.map(i => i.value));
    const labelW = 150;
    const barMaxW = 560 - labelW - 80;

    return (
        <svg viewBox={`0 0 560 ${height}`} className="w-full" role="img">
            {items.map((item, i) => {
                const y = i * rowH + 6;
                const w = Math.max(2, (barMaxW * item.value) / max);
                return (
                    <g key={item.label}>
                        <text x={0} y={y + 15} fontSize={11} fill="rgba(255,255,255,0.65)">
                            {truncate(item.label, 20)}
                        </text>
                        <rect
                            x={labelW}
                            y={y + 4}
                            width={w}
                            height={20}
                            rx={5}
                            style={{ fill: 'var(--brand-accent)' }}
                            opacity={0.9}
                        />
                        <text x={labelW + w + 8} y={y + 18} fontSize={11} fontWeight={700} fill="#ffffff">
                            {formatValue(item.value)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

interface DonutSlice {
    label: string;
    value: number;
    color: string;
}

function DonutChart({ slices, size = 220 }: { slices: DonutSlice[]; size?: number }) {
    const total = slices.reduce((acc, s) => acc + s.value, 0);
    const cx = 100;
    const cy = 100;
    const radius = 70;

    if (total <= 0) {
        return (
            <div className="flex flex-col sm:flex-row items-center gap-6">
                <svg viewBox="0 0 200 200" style={{ width: size, height: size }} className="shrink-0">
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={26} />
                </svg>
                <p className="text-sm text-white/40">Sem dados para o período seleccionado.</p>
            </div>
        );
    }

    // Deslocamentos acumulados de cada fatia, calculados sem mutação durante
    // a renderização (o linter react-hooks/immutability proíbe reatribuir
    // variáveis depois de o render completar).
    const offsets: number[] = [];
    slices.reduce((acc, slice) => {
        offsets.push(acc);
        return acc + (slice.value / total) * 100;
    }, 0);

    return (
        <div className="flex flex-col sm:flex-row items-center gap-6">
            <svg viewBox="0 0 200 200" style={{ width: size, height: size }} className="shrink-0">
                <g transform="rotate(-90 100 100)">
                    {slices.map((slice, i) => {
                        const pct = (slice.value / total) * 100;
                        return (
                            <circle
                                key={slice.label}
                                cx={cx}
                                cy={cy}
                                r={radius}
                                fill="none"
                                stroke={slice.color}
                                strokeWidth={26}
                                pathLength={100}
                                strokeDasharray={`${pct} ${100 - pct}`}
                                strokeDashoffset={-offsets[i]}
                            />
                        );
                    })}
                </g>
                <text
                    x={cx}
                    y={cy - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="rgba(255,255,255,0.45)"
                    style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
                >
                    Total
                </text>
                <text x={cx} y={cy + 16} textAnchor="middle" fontSize={16} fontWeight={800} fill="#ffffff">
                    {fmtCompact(total)}
                </text>
            </svg>
            <ul className="space-y-2.5 w-full sm:w-auto">
                {slices.map(slice => (
                    <li key={slice.label} className="flex items-center gap-2.5 text-sm">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: slice.color }} />
                        <span className="text-white/60">{slice.label}</span>
                        <span className="ml-auto pl-4 font-black text-white">{fmtCurrency(slice.value)}</span>
                        <span className="text-white/35 text-xs w-12 text-right">{fmtPercent(slice.value / total)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ── Tipos de linha (colunas efectivamente lidas na base) ────────────────── */

interface FinancialTransactionRow {
    id: string;
    direction: 'ENTRADA' | 'SAIDA';
    source: string;
    category: string;
    description: string;
    amount: number;
    transaction_date: string;
}

interface RoomRow {
    id: string;
    room_number: string;
    type: string | null;
    status: string;
    price: number;
}

interface ReservationRow {
    id: string;
    guest_name: string;
    service_type: string;
    room_number: string | null;
    status: string;
    reservation_date: string;
    total_amount: number;
}

interface PosOrderRow {
    id: string;
    order_number: string;
    customer_name: string | null;
    payment_method: string | null;
    total: number;
    closed_at: string | null;
}

interface PosOrderItemRow {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
}

interface PosProductRow {
    id: string;
    sku: string | null;
    name: string;
    category: string | null;
    price: number;
}

interface AuditRow {
    id: string;
    actor_role: string | null;
    action: string;
    entity_table: string;
    entity_id: string | null;
    created_at: string;
}

/* ── Relatório A — Financeiro Executivo ──────────────────────────────────── */

function FinanceiroReport({ from, to, tenantId }: { from: string; to: string; tenantId?: string }) {
    const [rows, setRows] = useState<FinancialTransactionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!from || !to) { setLoading(false); return; }
        if (!isSupabaseConfigured || !supabaseClient) {
            setError('Supabase não configurado neste ambiente.');
            setLoading(false);
            return;
        }
        try {
            // O razão é reconstruído (idempotente) antes da leitura: sem isto o
            // relatório podia reflectir um razão incompleto ou divergente.
            const sync = await supabaseClient.rpc('hr_sync_financial_entries', {
                p_tenant_id: tenantId,
            });
            if (sync.error) throw new Error(sync.error.message);

            const { data, error: queryError } = await supabaseClient
                .from('financial_transactions')
                .select('id,direction,source,category,description,amount,transaction_date')
                .gte('transaction_date', from)
                .lte('transaction_date', to)
                .order('transaction_date', { ascending: true });
            if (queryError) throw new Error(queryError.message);

            setRows(
                ((data ?? []) as FinancialTransactionRow[]).map(row => ({ ...row, amount: toNumber(row.amount) })),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o relatório financeiro.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [from, to, tenantId]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const entradas = rows.filter(r => r.direction === 'ENTRADA');
        const saidas = rows.filter(r => r.direction === 'SAIDA');
        const totalEntradas = entradas.reduce((acc, r) => acc + r.amount, 0);
        const totalSaidas = saidas.reduce((acc, r) => acc + r.amount, 0);
        const lucro = totalEntradas - totalSaidas;

        const porDiaMap = new Map<string, { entradas: number; saidas: number }>();
        for (const row of rows) {
            const dia = porDiaMap.get(row.transaction_date) ?? { entradas: 0, saidas: 0 };
            if (row.direction === 'ENTRADA') dia.entradas += row.amount;
            else dia.saidas += row.amount;
            porDiaMap.set(row.transaction_date, dia);
        }
        const porDia = [...porDiaMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([data, valores]) => ({ data: axisLabel(data), entradas: valores.entradas, saidas: valores.saidas }));

        const fonteMap = new Map<string, number>();
        for (const row of entradas) fonteMap.set(row.source, (fonteMap.get(row.source) ?? 0) + row.amount);
        const entradasPorFonte = [...fonteMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([fonte, total]) => ({ label: SOURCE_LABELS[fonte] ?? fonte, total }));

        const categoriaMap = new Map<string, number>();
        for (const row of saidas) categoriaMap.set(row.category, (categoriaMap.get(row.category) ?? 0) + row.amount);
        const saidasPorCategoria = [...categoriaMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([categoria, total]) => ({ label: CATEGORY_LABELS[categoria] ?? categoria, total }));

        const movimentos = [...rows]
            .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
            .slice(0, 15);

        return {
            totalEntradas,
            totalSaidas,
            lucro,
            saldoPorDia: lucro / periodDays(from, to),
            porDia,
            entradasPorFonte,
            saidasPorCategoria,
            movimentos,
        };
    }, [rows, from, to]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard label="Total de Entradas" value={fmtCurrency(dados.totalEntradas)} icon={ArrowDownLeft} tone="positive" />
                <KpiCard label="Total de Saídas" value={fmtCurrency(dados.totalSaidas)} icon={ArrowUpRight} tone="negative" />
                <KpiCard label="Lucro Líquido" value={fmtCurrency(dados.lucro)} icon={Banknote} tone="brand" />
                <KpiCard label="Saldo por Dia" value={fmtCurrency(dados.saldoPorDia)} hint="média diária do período" icon={CalendarDays} />
            </div>

            <ErrorBanner message={error} />

            {loading ? (
                <LoadingState label="A sincronizar o razão financeiro…" />
            ) : rows.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <SectionCard title="Entradas vs Saídas por Dia" subtitle="Movimentos do razão consolidado no período">
                        <BarChart
                            labels={dados.porDia.map(d => d.data)}
                            series={[
                                { name: 'Entradas', color: COR_ENTRADAS, values: dados.porDia.map(d => d.entradas) },
                                { name: 'Saídas', color: COR_SAIDAS, values: dados.porDia.map(d => d.saidas) },
                            ]}
                            formatValue={fmtCompact}
                        />
                    </SectionCard>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard title="Entradas por Origem" subtitle="POS, diárias e lançamentos manuais">
                            <BreakdownList items={dados.entradasPorFonte} />
                        </SectionCard>
                        <SectionCard title="Saídas por Categoria" subtitle="Composição das despesas no período">
                            <BreakdownList items={dados.saidasPorCategoria} />
                        </SectionCard>
                    </div>

                    <SectionCard title="Movimentos Recentes" subtitle="Últimos 15 lançamentos do período">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 pr-4">Data</th>
                                        <th className="py-3 pr-4">Descrição</th>
                                        <th className="py-3 pr-4">Origem</th>
                                        <th className="py-3 pr-4">Categoria</th>
                                        <th className="py-3 text-right">Montante</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dados.movimentos.map(mov => (
                                        <tr key={mov.id} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 pr-4 text-white/50 whitespace-nowrap">{fmtDate(mov.transaction_date)}</td>
                                            <td className="py-3 pr-4 text-white/75 max-w-[280px] truncate">{mov.description}</td>
                                            <td className="py-3 pr-4 text-white/50">{SOURCE_LABELS[mov.source] ?? mov.source}</td>
                                            <td className="py-3 pr-4 text-white/50">{CATEGORY_LABELS[mov.category] ?? mov.category}</td>
                                            <td className={`py-3 text-right font-black whitespace-nowrap ${mov.direction === 'ENTRADA' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                {mov.direction === 'ENTRADA' ? '+' : '−'}{fmtCurrency(mov.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

/* ── Relatório B — Ocupação e Diárias ────────────────────────────────────── */

function OcupacaoReport({ from, to }: { from: string; to: string }) {
    const [rooms, setRooms] = useState<RoomRow[]>([]);
    const [reservas, setReservas] = useState<ReservationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!from || !to) { setLoading(false); return; }
        if (!isSupabaseConfigured || !supabaseClient) {
            setError('Supabase não configurado neste ambiente.');
            setLoading(false);
            return;
        }
        try {
            const [roomsResult, reservasResult] = await Promise.all([
                supabaseClient.from('hotel_rooms').select('id,room_number,type,status,price'),
                supabaseClient.from('hotel_reservations')
                    .select('id,guest_name,service_type,room_number,status,reservation_date,total_amount')
                    .gte('reservation_date', from)
                    .lte('reservation_date', to),
            ]);
            if (roomsResult.error) throw new Error(roomsResult.error.message);
            if (reservasResult.error) throw new Error(reservasResult.error.message);

            setRooms(
                ((roomsResult.data ?? []) as RoomRow[]).map(row => ({ ...row, price: toNumber(row.price) })),
            );
            setReservas(
                ((reservasResult.data ?? []) as ReservationRow[]).map(row => ({ ...row, total_amount: toNumber(row.total_amount) })),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o relatório de ocupação.');
            setRooms([]);
            setReservas([]);
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const totalQuartos = rooms.length;
        const quartosOcupados = rooms.filter(r => r.status === 'OCUPADO').length;
        const taxaOcupacao = totalQuartos > 0 ? quartosOcupados / totalQuartos : 0;

        // Mesma regra do razão: só diárias confirmadas ou em curso contam receita.
        const estadosReceita = new Set(['CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT']);
        const receitaDiarias = reservas
            .filter(r => estadosReceita.has(r.status))
            .reduce((acc, r) => acc + r.total_amount, 0);

        const dias = periodDays(from, to);
        const quartosDisponiveis = totalQuartos * dias;
        const revpar = quartosDisponiveis > 0 ? receitaDiarias / quartosDisponiveis : 0;

        const porDiaMap = new Map<string, number>();
        for (const r of reservas) {
            if (!r.reservation_date) continue;
            porDiaMap.set(r.reservation_date, (porDiaMap.get(r.reservation_date) ?? 0) + 1);
        }
        const porDia = [...porDiaMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([data, total]) => ({ data: axisLabel(data), total }));

        const origemMap = new Map<string, number>();
        for (const r of reservas) {
            const origem = r.service_type.trim() || 'N/D';
            origemMap.set(origem, (origemMap.get(origem) ?? 0) + 1);
        }
        const porOrigem = [...origemMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([origem, total]) => ({ label: SERVICE_TYPE_LABELS[origem] ?? origem, total }));

        const estadoMap = new Map<string, number>();
        for (const r of reservas) estadoMap.set(r.status, (estadoMap.get(r.status) ?? 0) + 1);
        const porEstado = [...estadoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([status, total]) => ({ label: RESERVATION_STATUS_LABELS[status] ?? status, total }));

        const reservasTabela = [...reservas]
            .sort((a, b) => b.reservation_date.localeCompare(a.reservation_date))
            .slice(0, 25);

        return {
            totalQuartos,
            quartosOcupados,
            taxaOcupacao,
            receitaDiarias,
            revpar,
            totalReservas: reservas.length,
            porDia,
            porOrigem,
            porEstado,
            reservasTabela,
        };
    }, [rooms, reservas, from, to]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Taxa de Ocupação"
                    value={fmtPercent(dados.taxaOcupacao)}
                    hint={`${dados.quartosOcupados} de ${dados.totalQuartos} quartos`}
                    icon={BedDouble}
                    tone="brand"
                />
                <KpiCard label="Receita de Diárias" value={fmtCurrency(dados.receitaDiarias)} hint="reservas confirmadas no período" icon={Banknote} tone="positive" />
                <KpiCard label="RevPAR" value={fmtCurrency(dados.revpar)} hint="receita de diárias / quartos disponíveis" icon={CalendarDays} />
                <KpiCard label="Reservas no Período" value={fmtNumber(dados.totalReservas)} hint="com data no período" icon={Receipt} />
            </div>

            <ErrorBanner message={error} />

            {loading ? (
                <LoadingState />
            ) : rooms.length === 0 && reservas.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <SectionCard title="Reservas por Dia" subtitle="Nº de reservas com data no período">
                        <BarChart
                            labels={dados.porDia.map(d => d.data)}
                            series={[{ name: 'Reservas', color: '#40E0D0', values: dados.porDia.map(d => d.total) }]}
                            formatValue={fmtNumber}
                        />
                    </SectionCard>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard title="Origem das Reservas" subtitle="Contagem por tipo de serviço">
                            <BreakdownList items={dados.porOrigem} formatValue={fmtNumber} />
                        </SectionCard>
                        <SectionCard title="Estado das Reservas" subtitle="Contagem por estado">
                            <BreakdownList items={dados.porEstado} formatValue={fmtNumber} />
                        </SectionCard>
                    </div>

                    <SectionCard title="Reservas no Período" subtitle="Até 25 reservas mais recentes">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 pr-4">Hóspede</th>
                                        <th className="py-3 pr-4">Quarto</th>
                                        <th className="py-3 pr-4">Origem</th>
                                        <th className="py-3 pr-4">Estado</th>
                                        <th className="py-3 pr-4">Data</th>
                                        <th className="py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dados.reservasTabela.map(r => (
                                        <tr key={r.id} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 pr-4 text-white/75 max-w-[220px] truncate">{r.guest_name}</td>
                                            <td className="py-3 pr-4 text-white/50">{r.room_number ?? '—'}</td>
                                            <td className="py-3 pr-4 text-white/50">{SERVICE_TYPE_LABELS[r.service_type] ?? r.service_type}</td>
                                            <td className="py-3 pr-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${statusTone(r.status)}`}>
                                                    {RESERVATION_STATUS_LABELS[r.status] ?? r.status}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-white/50 whitespace-nowrap">{fmtDate(r.reservation_date)}</td>
                                            <td className="py-3 text-right font-black text-white whitespace-nowrap">{fmtCurrency(r.total_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

/* ── Relatório C — POS e Vendas ──────────────────────────────────────────── */

function PosReport({ from, to }: { from: string; to: string }) {
    const [orders, setOrders] = useState<PosOrderRow[]>([]);
    const [items, setItems] = useState<PosOrderItemRow[]>([]);
    const [products, setProducts] = useState<PosProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!from || !to) { setLoading(false); return; }
        if (!isSupabaseConfigured || !supabaseClient) {
            setError('Supabase não configurado neste ambiente.');
            setLoading(false);
            return;
        }
        try {
            // Comandas liquidadas (PAGA) cujo fechamento cai no período. O
            // filtro por instante em UTC é equivalente ao `closed_at::date`
            // usado pelo razão (migração 010).
            const { data: ordersData, error: ordersError } = await supabaseClient
                .from('pos_orders')
                .select('id,order_number,customer_name,payment_method,total,closed_at')
                .eq('status', 'PAGA')
                .gte('closed_at', `${from}T00:00:00.000Z`)
                .lte('closed_at', `${to}T23:59:59.999Z`);
            if (ordersError) throw new Error(ordersError.message);
            const orderRows = ((ordersData ?? []) as PosOrderRow[]).map(row => ({ ...row, total: toNumber(row.total) }));
            setOrders(orderRows);

            const orderIds = orderRows.map(o => o.id);
            if (orderIds.length === 0) {
                setItems([]);
                setProducts([]);
                return;
            }

            const { data: itemsData, error: itemsError } = await supabaseClient
                .from('pos_order_items')
                .select('id,order_id,product_id,product_name,unit_price,quantity,line_total')
                .in('order_id', orderIds);
            if (itemsError) throw new Error(itemsError.message);
            const itemRows = ((itemsData ?? []) as PosOrderItemRow[]).map(row => ({
                ...row,
                unit_price: toNumber(row.unit_price),
                quantity: toNumber(row.quantity),
                line_total: toNumber(row.line_total),
            }));
            setItems(itemRows);

            const productIds = [...new Set(
                itemRows.map(i => i.product_id).filter((id): id is string => Boolean(id)),
            )];
            if (productIds.length === 0) {
                setProducts([]);
                return;
            }
            const { data: productsData, error: productsError } = await supabaseClient
                .from('pos_products')
                .select('id,sku,name,category,price')
                .in('id', productIds);
            if (productsError) throw new Error(productsError.message);
            setProducts(
                ((productsData ?? []) as PosProductRow[]).map(row => ({ ...row, price: toNumber(row.price) })),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o relatório de vendas.');
            setOrders([]);
            setItems([]);
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const receitaTotal = orders.reduce((acc, o) => acc + o.total, 0);
        const ticketMedio = orders.length > 0 ? receitaTotal / orders.length : 0;
        const itensVendidos = items.reduce((acc, i) => acc + i.quantity, 0);

        const produtoPorId = new Map(products.map(p => [p.id, p]));
        const produtoMap = new Map<string, { name: string; category: string; unitPrice: number; quantity: number; revenue: number }>();
        for (const item of items) {
            const produto = item.product_id ? produtoPorId.get(item.product_id) : undefined;
            const chave = item.product_id ?? `item-${item.id}`;
            const atual = produtoMap.get(chave) ?? {
                // `product_name` é a cópia do nome no momento da venda (migração 008).
                name: produto?.name ?? item.product_name,
                category: produto?.category ?? '—',
                unitPrice: item.unit_price,
                quantity: 0,
                revenue: 0,
            };
            atual.quantity += item.quantity;
            atual.revenue += item.line_total;
            produtoMap.set(chave, atual);
        }
        const topProdutos = [...produtoMap.values()]
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 8);

        const pagamentoMap = new Map<string, { count: number; amount: number }>();
        for (const order of orders) {
            const metodo = order.payment_method ?? 'OUTRO';
            const atual = pagamentoMap.get(metodo) ?? { count: 0, amount: 0 };
            atual.count += 1;
            atual.amount += order.total;
            pagamentoMap.set(metodo, atual);
        }
        const porPagamento = [...pagamentoMap.entries()]
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([metodo, valores], index) => ({
                label: PAYMENT_METHOD_LABELS[metodo] ?? metodo,
                value: valores.amount,
                count: valores.count,
                color: CHART_PALETTE[index % CHART_PALETTE.length],
            }));

        return {
            receitaTotal,
            ticketMedio,
            itensVendidos,
            totalComandas: orders.length,
            topProdutos,
            porPagamento,
        };
    }, [orders, items, products]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard label="Receita Total" value={fmtCurrency(dados.receitaTotal)} icon={Banknote} tone="positive" />
                <KpiCard label="Ticket Médio" value={fmtCurrency(dados.ticketMedio)} hint="por comanda liquidada" icon={Receipt} tone="brand" />
                <KpiCard label="Comandas Pagas" value={fmtNumber(dados.totalComandas)} hint="no período" icon={ShoppingCart} />
                <KpiCard label="Itens Vendidos" value={fmtNumber(dados.itensVendidos)} hint="unidades faturadas" icon={ShoppingBag} />
            </div>

            <ErrorBanner message={error} />

            {loading ? (
                <LoadingState />
            ) : orders.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <SectionCard title="Produtos Mais Vendidos" subtitle="Top 8 por quantidade">
                        {dados.topProdutos.length === 0 ? (
                            <p className="text-sm text-white/35">Sem itens de comanda no período.</p>
                        ) : (
                            <HorizontalBarChart
                                items={dados.topProdutos.map(p => ({ label: p.name, value: p.quantity }))}
                                formatValue={fmtNumber}
                            />
                        )}
                    </SectionCard>

                    <SectionCard title="Distribuição por Forma de Pagamento" subtitle="Montante liquidado por método">
                        <DonutChart slices={dados.porPagamento} />
                    </SectionCard>

                    <SectionCard title="Top 8 Produtos" subtitle="Posição, quantidade e montante">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 pr-4">#</th>
                                        <th className="py-3 pr-4">Produto</th>
                                        <th className="py-3 pr-4">Categoria</th>
                                        <th className="py-3 pr-4 text-right">Qtd.</th>
                                        <th className="py-3 pr-4 text-right">Preço Unit.</th>
                                        <th className="py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dados.topProdutos.map((p, index) => (
                                        <tr key={p.name} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 pr-4 text-white/35">{index + 1}</td>
                                            <td className="py-3 pr-4 text-white/75 max-w-[240px] truncate">{p.name}</td>
                                            <td className="py-3 pr-4 text-white/50">{p.category}</td>
                                            <td className="py-3 pr-4 text-right text-white/75">{fmtNumber(p.quantity)}</td>
                                            <td className="py-3 pr-4 text-right text-white/50">{fmtCurrency(p.unitPrice)}</td>
                                            <td className="py-3 text-right font-black text-white whitespace-nowrap">{fmtCurrency(p.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

/* ── Relatório D — Auditoria Operacional ─────────────────────────────────── */

function AuditoriaReport({ from, to }: { from: string; to: string }) {
    const { license } = useAuth();
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [totalAcoes, setTotalAcoes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!isSupabaseConfigured || !supabaseClient) {
            setError('Supabase não configurado neste ambiente.');
            setLoading(false);
            return;
        }
        try {
            const janela = {
                gte: `${from}T00:00:00.000Z`,
                lte: `${to}T23:59:59.999Z`,
            };
            const [countResult, listResult] = await Promise.all([
                supabaseClient
                    .from('tenant_audit_log')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', janela.gte)
                    .lte('created_at', janela.lte),
                supabaseClient
                    .from('tenant_audit_log')
                    .select('id,actor_role,action,entity_table,entity_id,created_at')
                    .gte('created_at', janela.gte)
                    .lte('created_at', janela.lte)
                    .order('created_at', { ascending: false })
                    .limit(25),
            ]);
            if (countResult.error) throw new Error(countResult.error.message);
            if (listResult.error) throw new Error(listResult.error.message);

            setTotalAcoes(countResult.count ?? 0);
            setRows((listResult.data ?? []) as AuditRow[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o relatório de auditoria.');
            setRows([]);
            setTotalAcoes(0);
        } finally {
            setLoading(false);
        }
        // `from`/`to` entram nas dependências para reexecutar com o período.
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const tabelaMap = new Map<string, number>();
        for (const row of rows) {
            tabelaMap.set(row.entity_table, (tabelaMap.get(row.entity_table) ?? 0) + 1);
        }
        const porTabela = [...tabelaMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([label, total]) => ({ label, total }));
        const ultimaAccao = rows.length > 0 ? rows[0].created_at : null;
        return { porTabela, ultimaAccao, tabelasDistintas: porTabela.length };
    }, [rows]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiCard label="Total de Ações" value={fmtNumber(totalAcoes)} hint="no período seleccionado" icon={ScrollText} tone="brand" />
                <KpiCard label="Tabelas Auditadas" value={fmtNumber(dados.tabelasDistintas)} hint="distintas no período" icon={ShieldCheck} />
                <KpiCard label="Última Ação" value={dados.ultimaAccao ? fmtDateTime(dados.ultimaAccao) : '—'} icon={Clock} />
            </div>

            <ErrorBanner message={error} />

            {loading ? (
                <LoadingState />
            ) : rows.length === 0 && totalAcoes === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard title="Ações por Tabela" subtitle="Entidades auditadas no período">
                            <BreakdownList items={dados.porTabela} formatValue={fmtNumber} />
                        </SectionCard>

                        <SectionCard title="Licença da Instância" subtitle="Apenas leitura — estado actual">
                            {license ? (
                                <dl className="space-y-3 text-sm">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-white/40 uppercase tracking-widest text-[10px] font-black">Tipo</dt>
                                        <dd className="text-white font-bold">
                                            {license.license_type
                                                ? (LICENSE_TYPE_LABELS[license.license_type] ?? license.license_type)
                                                : '—'}
                                        </dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-white/40 uppercase tracking-widest text-[10px] font-black">Estado</dt>
                                        <dd className="text-white font-bold">{license.effective_status ?? '—'}</dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-white/40 uppercase tracking-widest text-[10px] font-black">Expira em</dt>
                                        <dd className="text-white font-bold">{fmtDate(license.expires_at)}</dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-white/40 uppercase tracking-widest text-[10px] font-black">Dias restantes</dt>
                                        <dd className="text-white font-bold">
                                            {license.days_left !== null && license.days_left !== undefined ? fmtNumber(license.days_left) : '—'}
                                        </dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-white/40 uppercase tracking-widest text-[10px] font-black">Licença paga</dt>
                                        <dd className="text-white font-bold">{license.is_paid ? 'Sim' : 'Não'}</dd>
                                    </div>
                                </dl>
                            ) : (
                                <p className="text-sm text-white/40">
                                    Informação de licença indisponível — a migração 010 pode ainda não ter sido aplicada.
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <SectionCard title="Últimos 25 Registos" subtitle="Mais recentes primeiro">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 pr-4">Data / Hora</th>
                                        <th className="py-3 pr-4">Perfil</th>
                                        <th className="py-3 pr-4">Acção</th>
                                        <th className="py-3 pr-4">Tabela</th>
                                        <th className="py-3">Entidade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row.id} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 pr-4 text-white/50 whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                                            <td className="py-3 pr-4 text-white/75">{row.actor_role ?? '—'}</td>
                                            <td className="py-3 pr-4 text-white/75">{row.action}</td>
                                            <td className="py-3 pr-4 text-white/50 font-mono text-xs">{row.entity_table}</td>
                                            <td className="py-3 text-white/50 font-mono text-xs max-w-[180px] truncate">{row.entity_id ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

/* ── Página ──────────────────────────────────────────────────────────────── */

/* ── Relatório E — Horas vs Diárias ──────────────────────────────────────── */

function HorasDiariasReport({ from, to }: { from: string; to: string }) {
    const [sessoes, setSessoes] = useState<HourlyBillingRow[]>([]);
    const [reservasDiaria, setReservasDiaria] = useState<number | null>(null);
    const [indisponivel, setIndisponivel] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIndisponivel(false);
        setReservasDiaria(null);
        if (!from || !to) { setLoading(false); return; }

        // Sessões horárias (migração 011). Sem a tabela o `fetchHourlyBilling`
        // devolve `unavailable` sem erro: o relatório degrada, não falha.
        const resultado = await fetchHourlyBilling(from, to);
        if (resultado.error) {
            setError(resultado.error);
            setSessoes([]);
            setLoading(false);
            return;
        }
        setSessoes(resultado.rows);
        setIndisponivel(resultado.unavailable);

        // Reservas com diária no período — melhor esforço, nunca bloqueia.
        if (supabaseClient) {
            const { data, error: reservasError } = await supabaseClient
                .from('hotel_reservations')
                .select('id,reservation_date,status')
                .gte('reservation_date', from)
                .lte('reservation_date', to)
                .limit(3000);
            if (!reservasError && data) {
                setReservasDiaria(
                    (data as { status: string }[]).filter(r => r.status !== 'CANCELADA').length,
                );
            }
        }
        setLoading(false);
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const horasVendidas = sessoes.reduce((acc, s) => acc + s.block_hours + s.extensions, 0);
        const receita = sessoes.reduce((acc, s) => acc + s.amount_paid, 0);
        const activas = sessoes.filter(s => s.status === 'EM_CURSO').length;

        const diaMap = new Map<string, { sessoes: number; receita: number }>();
        for (const sessao of sessoes) {
            const dia = sessao.started_at.slice(0, 10);
            if (!dia) continue;
            const actual = diaMap.get(dia) ?? { sessoes: 0, receita: 0 };
            actual.sessoes += 1;
            actual.receita += sessao.amount_paid;
            diaMap.set(dia, actual);
        }
        const porDia = [...diaMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dia, valores]) => ({ dia: axisLabel(dia), ...valores }));

        const estadoMap = new Map<string, number>();
        for (const sessao of sessoes) {
            estadoMap.set(sessao.status, (estadoMap.get(sessao.status) ?? 0) + 1);
        }
        const porEstado = [...estadoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([estado, total]) => ({ label: HOURLY_STATUS_LABELS[estado] ?? estado, total }));

        const recentes = [...sessoes]
            .sort((a, b) => b.started_at.localeCompare(a.started_at))
            .slice(0, 60);

        return { horasVendidas, receita, activas, porDia, porEstado, recentes };
    }, [sessoes]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Sessões Horárias"
                    value={fmtNumber(sessoes.length)}
                    hint={`${fmtNumber(dados.activas)} em curso`}
                    icon={Clock}
                />
                <KpiCard
                    label="Horas Vendidas"
                    value={fmtDecimal(dados.horasVendidas)}
                    hint="blocos mais extensões"
                    icon={Hourglass}
                    tone="brand"
                />
                <KpiCard
                    label="Receita Horária"
                    value={fmtCurrency(dados.receita)}
                    hint="liquidado nas sessões"
                    icon={Banknote}
                    tone="positive"
                />
                <KpiCard
                    label="Reservas com Diária"
                    value={reservasDiaria === null ? '—' : fmtNumber(reservasDiaria)}
                    hint="não canceladas no período"
                    icon={BedDouble}
                />
            </div>

            <ErrorBanner message={error} />
            {indisponivel ? (
                <InfoBanner message="A tabela hourly_billing não existe nesta base de dados — a migração 011 ainda não foi aplicada. As sessões horárias ficam indisponíveis; a contagem de reservas com diária continua a ser apresentada." />
            ) : null}

            {loading ? (
                <LoadingState label="A carregar as sessões horárias…" />
            ) : (
                <>
                    {sessoes.length === 0 && !indisponivel ? <EmptyState /> : null}

                    {sessoes.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <SectionCard title="Sessões por Dia" subtitle="Sessões iniciadas em cada dia do período">
                                    <BarChart
                                        labels={dados.porDia.map(d => d.dia)}
                                        series={[{ name: 'Sessões', color: CHART_PALETTE[0], values: dados.porDia.map(d => d.sessoes) }]}
                                        formatValue={fmtNumber}
                                    />
                                </SectionCard>
                                <SectionCard title="Receita Horária por Dia" subtitle="Valor liquidado nas sessões de cada dia">
                                    <BarChart
                                        labels={dados.porDia.map(d => d.dia)}
                                        series={[{ name: 'Receita', color: CHART_PALETTE[1], values: dados.porDia.map(d => d.receita) }]}
                                        formatValue={fmtCompact}
                                    />
                                </SectionCard>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <SectionCard title="Sessões por Estado" subtitle="Composição das sessões do período">
                                    <BreakdownList items={dados.porEstado} formatValue={fmtNumber} />
                                </SectionCard>
                                <SectionCard title="Horas vs Diárias" subtitle="Sessões horárias e reservas com diária no mesmo período">
                                    {reservasDiaria === null ? (
                                        <p className="text-sm text-white/35">Contagem de reservas indisponível.</p>
                                    ) : (
                                        <BreakdownList
                                            items={[
                                                { label: 'Sessões horárias', total: sessoes.length },
                                                { label: 'Reservas com diária', total: reservasDiaria },
                                            ]}
                                            formatValue={fmtNumber}
                                        />
                                    )}
                                </SectionCard>
                            </div>

                            <SectionCard title="Sessões do Período" subtitle={`${fmtNumber(sessoes.length)} sessões — últimas 60`}>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                                <th className="py-3 pr-4">Início</th>
                                                <th className="py-3 pr-4">Quarto</th>
                                                <th className="py-3 pr-4 text-right">Horas</th>
                                                <th className="py-3 pr-4">Estado</th>
                                                <th className="py-3 text-right">Liquidado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dados.recentes.map(sessao => (
                                                <tr key={sessao.id} className="border-b border-white/5 last:border-0">
                                                    <td className="py-3 pr-4 text-white/50 whitespace-nowrap">{fmtDateTime(sessao.started_at)}</td>
                                                    <td className="py-3 pr-4 text-white/75">{sessao.room_number ?? '—'}</td>
                                                    <td className="py-3 pr-4 text-right text-white/75">
                                                        {fmtDecimal(sessao.block_hours + sessao.extensions)} h
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${hourlyTone(sessao.status)}`}>
                                                            {HOURLY_STATUS_LABELS[sessao.status] ?? sessao.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-right font-black text-white whitespace-nowrap">
                                                        {fmtCurrency(sessao.amount_paid)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SectionCard>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}

/* ── Relatório F — Top Pratos e Top Bebidas ──────────────────────────────── */

/** Nível de detalhe conseguido na classificação da carta. */
type Classificacao = 'completa' | 'parcial' | 'indisponivel';

interface CartaRow {
    id: string;
    name: string;
    category: string | null;
    master_product_id?: string | null;
}

function TopProdutosReport({ from, to }: { from: string; to: string }) {
    const [items, setItems] = useState<PosOrderItemRow[]>([]);
    const [produtos, setProdutos] = useState<Map<string, { name: string; group: ProductGroup }>>(() => new Map());
    const [classificacao, setClassificacao] = useState<Classificacao>('completa');
    const [avisoMestre, setAvisoMestre] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        setClassificacao('completa');
        setAvisoMestre(null);
        if (!from || !to) { setLoading(false); return; }
        if (!isSupabaseConfigured || !supabaseClient) {
            setError('Supabase não configurado neste ambiente.');
            setLoading(false);
            return;
        }
        try {
            const { data: ordersData, error: ordersError } = await supabaseClient
                .from('pos_orders')
                .select('id')
                .eq('status', 'PAGA')
                .gte('closed_at', `${from}T00:00:00.000Z`)
                .lte('closed_at', `${to}T23:59:59.999Z`)
                .order('closed_at', { ascending: false })
                .limit(800);
            if (ordersError) throw new Error(ordersError.message);
            const orderIds = ((ordersData ?? []) as { id: string }[]).map(row => row.id);
            if (orderIds.length === 0) {
                setItems([]);
                setProdutos(new Map());
                setLoading(false);
                return;
            }

            const { data: itemsData, error: itemsError } = await supabaseClient
                .from('pos_order_items')
                .select('id,order_id,product_id,product_name,unit_price,quantity,line_total')
                .in('order_id', orderIds)
                .order('created_at', { ascending: false })
                .limit(5000);
            if (itemsError) throw new Error(itemsError.message);
            const itemRows = ((itemsData ?? []) as PosOrderItemRow[]).map(row => ({
                ...row,
                unit_price: toNumber(row.unit_price),
                quantity: toNumber(row.quantity),
                line_total: toNumber(row.line_total),
            }));
            setItems(itemRows);

            // Classificação em três níveis: `kind` do catálogo mestre (011),
            // categoria local do POS e, no limite, só o nome da linha de venda.
            const productIds = [...new Set(
                itemRows.map(i => i.product_id).filter((id): id is string => Boolean(id)),
            )];
            if (productIds.length === 0) {
                setProdutos(new Map());
                setLoading(false);
                return;
            }

            let estado: Classificacao = 'completa';
            let temColunaMestre = true;
            let linhas: CartaRow[] = [];
            try {
                const comMestre = await supabaseClient
                    .from('pos_products')
                    .select('id,name,category,master_product_id')
                    .in('id', productIds);
                if (isMissingColumn(comMestre.error?.message ?? '')) {
                    // Sem a migração 011 não existe a coluna de ligação.
                    temColunaMestre = false;
                    const semMestre = await supabaseClient
                        .from('pos_products')
                        .select('id,name,category')
                        .in('id', productIds);
                    if (semMestre.error) throw semMestre.error;
                    linhas = (semMestre.data ?? []) as CartaRow[];
                } else {
                    if (comMestre.error) throw comMestre.error;
                    linhas = (comMestre.data ?? []) as CartaRow[];
                }
            } catch {
                // Sem a carta local não há classificação fiável — degrada.
                estado = 'indisponivel';
            }

            const kindPorId = new Map<string, string>();
            if (estado !== 'indisponivel') {
                const masterIds = [...new Set(
                    linhas.map(l => l.master_product_id).filter((id): id is string => Boolean(id)),
                )];
                if (masterIds.length > 0) {
                    const masters = await supabaseClient
                        .from('master_products_catalog')
                        .select('id,kind')
                        .in('id', masterIds);
                    if (masters.error) {
                        // Catálogo mestre inacessível: fica a categoria local.
                        estado = 'parcial';
                        setAvisoMestre(
                            isMissingRelation(masters.error.message)
                                ? 'O catálogo mestre (migração 011) ainda não existe nesta base de dados, por isso pratos e bebidas foram identificados pela categoria local do POS.'
                                : `Não foi possível ler o catálogo mestre (${masters.error.message}) — a classificação recorreu à categoria local do POS.`,
                        );
                    } else {
                        for (const master of (masters.data ?? []) as { id: string; kind: string | null }[]) {
                            if (master.kind) kindPorId.set(master.id, master.kind);
                        }
                    }
                }
                if (!temColunaMestre) estado = 'parcial';
            }

            const mapa = new Map<string, { name: string; group: ProductGroup }>();
            if (estado !== 'indisponivel') {
                for (const linha of linhas) {
                    const kind = linha.master_product_id
                        ? kindPorId.get(linha.master_product_id) ?? null
                        : null;
                    mapa.set(linha.id, { name: linha.name, group: classifyProductGroup(kind, linha.category) });
                }
            }
            setProdutos(mapa);
            setClassificacao(estado);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o relatório de produtos.');
            setItems([]);
            setProdutos(new Map());
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const dados = useMemo(() => {
        const mapa = new Map<string, RankEntry & { group: ProductGroup }>();
        let receitaTotal = 0;
        for (const item of items) {
            const produto = item.product_id ? produtos.get(item.product_id) : undefined;
            const chave = item.product_id ?? `item-${item.id}`;
            const actual = mapa.get(chave) ?? {
                name: produto?.name ?? item.product_name,
                group: produto?.group ?? 'OUTRO' as ProductGroup,
                units: 0,
                revenue: 0,
            };
            actual.units += item.quantity;
            actual.revenue += item.line_total;
            mapa.set(chave, actual);
            receitaTotal += item.line_total;
        }
        const todos = [...mapa.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
        const doGrupo = (grupo: ProductGroup) => todos.filter(e => e.group === grupo).slice(0, 10);
        const unidades = (lista: (RankEntry & { group: ProductGroup })[]) =>
            lista.reduce((acc, e) => acc + e.units, 0);

        const pratos = doGrupo('PRATO');
        const bebidas = doGrupo('BEBIDA');
        const outros = doGrupo('OUTRO');
        return {
            todos,
            pratos,
            bebidas,
            outros,
            receitaTotal,
            unidadesPratos: pratos.reduce((acc, e) => acc + e.units, 0),
            unidadesBebidas: bebidas.reduce((acc, e) => acc + e.units, 0),
            unidadesOutros: outros.reduce((acc, e) => acc + e.units, 0),
            unidadesTotal: unidades(todos),
        };
    }, [items, produtos]);

    const avisoClassificacao =
        classificacao === 'indisponivel'
            ? 'Não foi possível ler a carta do POS (pos_products). Os rankings usam apenas o nome gravado na linha de venda e ficam agrupados em «Outros».'
            : avisoMestre
                ? avisoMestre
                : classificacao === 'parcial'
                    ? 'O catálogo mestre (migração 011) está indisponível, por isso pratos e bebidas foram identificados pela categoria local do POS.'
                    : null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard label="Pratos Vendidos" value={fmtNumber(dados.unidadesPratos)} hint="unidades no período" icon={ChefHat} />
                <KpiCard label="Bebidas Vendidas" value={fmtNumber(dados.unidadesBebidas)} hint="unidades no período" icon={ShoppingBag} />
                <KpiCard label="Outros Produtos" value={fmtNumber(dados.unidadesOutros)} hint="padaria, snack e restantes" icon={ShoppingCart} />
                <KpiCard label="Receita dos Artigos" value={fmtCurrency(dados.receitaTotal)} hint="soma das linhas de venda" icon={Banknote} tone="positive" />
            </div>

            <ErrorBanner message={error} />
            {avisoClassificacao ? <InfoBanner message={avisoClassificacao} /> : null}

            {loading ? (
                <LoadingState label="A analisar as comandas pagas…" />
            ) : items.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard title="Top Pratos" subtitle="Top 10 por quantidade vendada">
                            <RankedList entries={dados.pratos} />
                        </SectionCard>
                        <SectionCard title="Top Bebidas" subtitle="Top 10 por quantidade vendada">
                            <RankedList entries={dados.bebidas} />
                        </SectionCard>
                    </div>

                    <SectionCard title="Outros Produtos" subtitle="Padaria, snack, take-away e restantes classificações">
                        <RankedList entries={dados.outros} />
                    </SectionCard>

                    <SectionCard
                        title="Carta Mais Vendida"
                        subtitle={`Top 10 geral — ${fmtNumber(dados.unidadesTotal)} unidades lidas (máximo de 5000 linhas)`}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                        <th className="py-3 pr-4">#</th>
                                        <th className="py-3 pr-4">Produto</th>
                                        <th className="py-3 pr-4">Grupo</th>
                                        <th className="py-3 pr-4 text-right">Qtd.</th>
                                        <th className="py-3 text-right">Receita</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dados.todos.slice(0, 10).map((produto, index) => (
                                        <tr key={`${index}-${produto.name}`} className="border-b border-white/5 last:border-0">
                                            <td className="py-3 pr-4 text-white/35">{index + 1}</td>
                                            <td className="py-3 pr-4 text-white/75 max-w-[280px] truncate">{produto.name}</td>
                                            <td className="py-3 pr-4 text-white/50">{PRODUCT_GROUP_LABELS[produto.group]}</td>
                                            <td className="py-3 pr-4 text-right text-white/75">{fmtNumber(produto.units)}</td>
                                            <td className="py-3 text-right font-black text-white whitespace-nowrap">{fmtCurrency(produto.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

/* ── Relatório G — Pré-contas Emitidas ───────────────────────────────────── */

function PreContasReport({ from, to }: { from: string; to: string }) {
    const [resultado, setResultado] = useState<PreBillFetchResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!from || !to) { setLoading(false); return; }
        const r = await fetchPreBills(from, to);
        if (r.error) {
            setError(r.error);
            setResultado(null);
        } else {
            setResultado(r);
        }
        setLoading(false);
    }, [from, to]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    const rows = useMemo<PreBillRow[]>(() => resultado?.rows ?? [], [resultado]);
    const indisponivel = resultado?.unavailable ?? false;

    const dados = useMemo(() => {
        const valorTotal = rows.reduce((acc, r) => acc + r.total, 0);
        const convidados = new Set(rows.map(r => r.guest_name).filter((nome): nome is string => Boolean(nome)));

        const tipoMap = new Map<string, number>();
        for (const row of rows) {
            const tipo = row.doc_type || 'DESCONHECIDO';
            tipoMap.set(tipo, (tipoMap.get(tipo) ?? 0) + 1);
        }
        const porTipo = [...tipoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tipo, total]) => ({ label: PRE_BILL_DOC_TYPE_LABELS[tipo] ?? tipo, total }));

        const contextoMap = new Map<string, number>();
        for (const row of rows) {
            const contexto = row.context || 'DESCONHECIDO';
            contextoMap.set(contexto, (contextoMap.get(contexto) ?? 0) + 1);
        }
        const porContexto = [...contextoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([contexto, total]) => ({ label: PRE_BILL_CONTEXT_LABELS[contexto] ?? contexto, total }));

        const diaMap = new Map<string, number>();
        for (const row of rows) {
            const dia = row.created_at.slice(0, 10);
            if (!dia) continue;
            diaMap.set(dia, (diaMap.get(dia) ?? 0) + 1);
        }
        const porDia = [...diaMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dia, total]) => ({ dia: axisLabel(dia), total }));

        return {
            valorTotal,
            convidados: convidados.size,
            media: rows.length > 0 ? valorTotal / rows.length : 0,
            porTipo,
            porContexto,
            porDia,
            recentes: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50),
        };
    }, [rows]);

    const totalDocs = resultado?.totalDocs ?? 0;
    const truncado = resultado?.truncated ?? false;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Documentos Emitidos"
                    value={fmtNumber(totalDocs)}
                    hint={truncado ? 'lista truncada aos primeiros 1000' : 'no período'}
                    icon={FileText}
                />
                <KpiCard label="Valor Total" value={fmtCurrency(dados.valorTotal)} hint="soma dos documentos lidos" icon={Banknote} tone="positive" />
                <KpiCard label="Convidados Distintos" value={fmtNumber(dados.convidados)} hint="por nome registado" icon={Receipt} />
                <KpiCard label="Média por Documento" value={fmtCurrency(dados.media)} hint="valor médio de emissão" icon={ShoppingBag} tone="brand" />
            </div>

            <ErrorBanner message={error} />
            {indisponivel ? (
                <InfoBanner message="A tabela pre_bill_logs não existe nesta base de dados — a migração 011 ainda não foi aplicada, pelo que não é possível enumerar as pré-contas emitidas." />
            ) : null}

            {loading ? (
                <LoadingState label="A carregar as pré-contas…" />
            ) : (
                <>
                    {rows.length === 0 && !indisponivel ? <EmptyState /> : null}

                    {rows.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <SectionCard title="Documentos por Tipo" subtitle="Pré-contas e extratos emitidos no período">
                                    <BreakdownList items={dados.porTipo} formatValue={fmtNumber} />
                                </SectionCard>
                                <SectionCard title="Documentos por Contexto" subtitle="Onde os documentos foram emitidos">
                                    <BreakdownList items={dados.porContexto} formatValue={fmtNumber} />
                                </SectionCard>
                            </div>

                            <SectionCard title="Emissões por Dia" subtitle="Número de documentos emitidos em cada dia">
                                <BarChart
                                    labels={dados.porDia.map(d => d.dia)}
                                    series={[{ name: 'Documentos', color: CHART_PALETTE[2], values: dados.porDia.map(d => d.total) }]}
                                    formatValue={fmtNumber}
                                />
                            </SectionCard>

                            <SectionCard
                                title="Registos de Emissão"
                                subtitle={`${fmtNumber(totalDocs)} documentos no período — últimas 50 emissões`}
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-[0.2em] border-b border-white/10">
                                                <th className="py-3 pr-4">Emissão</th>
                                                <th className="py-3 pr-4">Tipo</th>
                                                <th className="py-3 pr-4">Documento</th>
                                                <th className="py-3 pr-4">Contexto</th>
                                                <th className="py-3 pr-4">Quarto / Hóspede</th>
                                                <th className="py-3 text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dados.recentes.map(doc => (
                                                <tr key={doc.id} className="border-b border-white/5 last:border-0">
                                                    <td className="py-3 pr-4 text-white/50 whitespace-nowrap">{fmtDateTime(doc.created_at)}</td>
                                                    <td className="py-3 pr-4 text-white/75">
                                                        {PRE_BILL_DOC_TYPE_LABELS[doc.doc_type] ?? (doc.doc_type || '—')}
                                                    </td>
                                                    <td className="py-3 pr-4 text-white/75 font-mono text-xs">{doc.doc_number || '—'}</td>
                                                    <td className="py-3 pr-4 text-white/50">
                                                        {PRE_BILL_CONTEXT_LABELS[doc.context] ?? (doc.context || '—')}
                                                    </td>
                                                    <td className="py-3 pr-4 text-white/50 max-w-[220px] truncate">
                                                        {doc.room_number ?? doc.guest_name ?? doc.label ?? '—'}
                                                    </td>
                                                    <td className="py-3 text-right font-black text-white whitespace-nowrap">{fmtCurrency(doc.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {truncado ? (
                                    <p className="mt-3 text-[11px] text-white/35">
                                        A lista está truncada aos primeiros 1000 documentos — estreite o período para ver o restante.
                                    </p>
                                ) : null}
                            </SectionCard>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}

type ReportId = 'financeiro' | 'ocupacao' | 'pos' | 'auditoria' | 'horas_diarias' | 'top_pratos' | 'pre_contas';

const REPORT_OPTIONS: { id: ReportId; title: string; subtitle: string; icon: LucideIcon }[] = [
    { id: 'financeiro', title: 'Financeiro Executivo', subtitle: 'DRE simplificado do razão', icon: Banknote },
    { id: 'ocupacao', title: 'Ocupação e Diárias', subtitle: 'RevPAR e origem das reservas', icon: BedDouble },
    { id: 'pos', title: 'POS e Vendas', subtitle: 'Comandas, ticket médio e top produtos', icon: ShoppingCart },
    { id: 'auditoria', title: 'Auditoria Operacional', subtitle: 'Rasto de auditoria e licença', icon: ScrollText },
    { id: 'horas_diarias', title: 'Horas vs Diárias', subtitle: 'Sessões horárias e reservas', icon: Hourglass },
    { id: 'top_pratos', title: 'Top Pratos e Bebidas', subtitle: 'Carta mais vendida por grupo', icon: ChefHat },
    { id: 'pre_contas', title: 'Pré-contas Emitidas', subtitle: 'Documentos e contextos de emissão', icon: FileText },
];

type PeriodPreset = 'hoje' | '7d' | '30d' | 'mes' | 'ano' | 'custom';

const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: 'mes', label: 'Este mês' },
    { key: 'ano', label: 'Este ano' },
];

function presetRange(preset: PeriodPreset, today: Date): { from: string; to: string } {
    const to = isoDay(today);
    switch (preset) {
        case 'hoje':
            return { from: to, to };
        case '7d':
            return { from: isoDay(addDays(today, -6)), to };
        case '30d':
            return { from: isoDay(addDays(today, -29)), to };
        case 'mes':
            return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to };
        case 'ano':
            return { from: isoDay(new Date(today.getFullYear(), 0, 1)), to };
        case 'custom':
            return { from: '', to: '' };
    }
}

export default function RelatoriosPage() {
    const { user } = useAuth();
    // O período por omissão é "últimos 30 dias". O inicializador lazy só
    // produz HTML depois do mount (o DashboardLayout renderiza os filhos só
    // aí), pelo que o export estático não depende da data do build.
    const [range, setRange] = useState(() => presetRange('30d', new Date()));
    const [preset, setPreset] = useState<PeriodPreset>('30d');
    const [activeReport, setActiveReport] = useState<ReportId>('financeiro');

    const applyPreset = (key: PeriodPreset) => {
        setRange(presetRange(key, new Date()));
        setPreset(key);
    };

    const activeOption = REPORT_OPTIONS.find(option => option.id === activeReport) ?? REPORT_OPTIONS[0];

    return (
        <DashboardLayout>
            <div className="max-w-[1600px] mx-auto space-y-10 pb-20 px-4">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-b border-white/10 pb-8"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">Relatórios</h1>
                            <p className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mt-1">
                                Suite de Relatórios Gerenciais
                            </p>
                        </div>
                        {user ? (
                            <div className="ml-auto hidden md:block text-right">
                                <p className="text-sm font-black text-white/80">{user.name}</p>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">{user.role}</p>
                            </div>
                        ) : null}
                    </div>
                </motion.div>

                {/* Filtro de período — partilhado por todos os relatórios */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="glass-panel rounded-[24px] border border-white/5 p-5 space-y-4"
                >
                    <div className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Período de Análise
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {PERIOD_PRESETS.map(option => (
                            <button
                                key={option.key}
                                onClick={() => applyPreset(option.key)}
                                className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${
                                    preset === option.key
                                        ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white'
                                        : 'bg-white/5 border-white/10 text-white/55 hover:text-white hover:border-white/25'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                        <label className="block space-y-1.5">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">De</span>
                            <input
                                type="date"
                                value={range.from}
                                onChange={e => {
                                    setRange(r => ({ ...r, from: e.target.value }));
                                    setPreset('custom');
                                }}
                                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-[var(--brand-primary)]"
                                style={{ colorScheme: 'dark' }}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Até</span>
                            <input
                                type="date"
                                value={range.to}
                                onChange={e => {
                                    setRange(r => ({ ...r, to: e.target.value }));
                                    setPreset('custom');
                                }}
                                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-[var(--brand-primary)]"
                                style={{ colorScheme: 'dark' }}
                            />
                        </label>
                        <p className="text-[11px] text-white/35 uppercase tracking-widest font-black pb-2.5">
                            {range.from && range.to ? `${periodDays(range.from, range.to)} dias` : '—'}
                        </p>
                    </div>
                </motion.div>

                {/* Selector de relatório — um relatório de cada vez */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {REPORT_OPTIONS.map(option => {
                        const Icon = option.icon;
                        const isActive = option.id === activeReport;
                        return (
                            <motion.button
                                key={option.id}
                                onClick={() => setActiveReport(option.id)}
                                whileTap={{ scale: 0.98 }}
                                className={`text-left glass-panel rounded-[24px] border p-6 transition-all ${
                                    isActive
                                        ? 'border-[var(--brand-primary)]/60 shadow-[0_0_36px_rgba(0,71,171,0.28)]'
                                        : 'border-white/5 hover:border-white/15'
                                }`}
                            >
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-all ${
                                    isActive
                                        ? 'bg-[var(--brand-primary)]/15 border-[var(--brand-primary)]/40'
                                        : 'bg-white/5 border-white/10'
                                }`}>
                                    <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--brand-primary)]' : 'text-white/50'}`} />
                                </div>
                                <p className="mt-4 text-sm font-black text-white uppercase tracking-wider">{option.title}</p>
                                <p className="mt-1 text-[10px] font-black text-white/35 uppercase tracking-[0.2em]">{option.subtitle}</p>
                            </motion.button>
                        );
                    })}
                </div>

                <motion.div
                    key={activeReport}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6"
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <activeOption.icon className="w-4 h-4 text-[var(--brand-primary)]" />
                        <h2 className="text-lg font-black text-white uppercase tracking-[0.2em]">{activeOption.title}</h2>
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
                            {range.from && range.to ? `${fmtDate(range.from)} — ${fmtDate(range.to)}` : '—'}
                        </span>
                    </div>

                    {activeReport === 'financeiro' && <FinanceiroReport from={range.from} to={range.to} tenantId={user?.tenantId} />}
                    {activeReport === 'ocupacao' && <OcupacaoReport from={range.from} to={range.to} />}
                    {activeReport === 'pos' && <PosReport from={range.from} to={range.to} />}
                    {activeReport === 'auditoria' && <AuditoriaReport from={range.from} to={range.to} />}
                    {activeReport === 'horas_diarias' && <HorasDiariasReport from={range.from} to={range.to} />}
                    {activeReport === 'top_pratos' && <TopProdutosReport from={range.from} to={range.to} />}
                    {activeReport === 'pre_contas' && <PreContasReport from={range.from} to={range.to} />}
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
