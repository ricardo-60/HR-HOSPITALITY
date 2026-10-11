'use client';

/**
 * Fast Check-out — balcão de atendimento.
 *
 * Layout compacto e centralizado para uma balcão/touch de recepção:
 *   · esquerda  — dados da estadia (hóspede KYC, quarto, período, documento)
 *                 e tabela scrollável de débitos com data/hora, zona, mesa,
 *                 quantidades e preços de cada lançamento;
 *   · direita   — resumo financeiro (Alojamento + Extras/POS + Taxas),
 *                 métodos de pagamento (Numerário/Troco, TPA, Transferência),
 *                 troco e saldo pendente;
 *   · rodapé    — botões de acção fixos: imprimir fatura/extrato (A4 ou
 *                 bobina térmica de 80 mm) e finalizar o check-out.
 *
 * A impressão acontece no pai (a folha vive fora do `print:hidden` do modal),
 * daqui só se pede o formato.
 */

import { ShieldCheck, X, ArrowLeft, Printer, Banknote, CreditCard, Landmark } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ClienteFatura,
    FormatoFatura,
    LinhaFatura,
    METODOS_PAGAMENTO,
    MetodoPagamento,
    PagamentoFatura,
    calcularPagamento,
    formatarData,
    formatarDataHora,
    money,
    moneySemUnidade,
    resumoFatura,
    rotuloZona,
} from '@/lib/fatura';

interface CheckoutConsolidatedProps {
    guestName: string;
    roomNumber: string;
    periodo: { entrada: string | null; saida: string | null };
    cliente: ClienteFatura;
    invoiceNumber: string;
    items: LinhaFatura[];
    taxes: number;
    auditToken: string;
    onFinalize: (pagamento: {
        method: MetodoPagamento;
        received: number;
        paid: number;
        change: number;
        pending: number;
        invoice: string;
    }) => void;
    /** A folha é montada e impressa pelo pai (o modal vive em `print:hidden`). */
    onPrint: (formato: FormatoFatura, pagamento: PagamentoFatura) => void;
    onClose?: () => void;
}

const ICONES_METODO: Record<MetodoPagamento, typeof Banknote> = {
    NUMERARIO: Banknote,
    TPA: CreditCard,
    TRANSFERENCIA: Landmark,
};

export function CheckoutConsolidated({
    guestName,
    roomNumber,
    periodo,
    cliente,
    invoiceNumber,
    items,
    taxes,
    auditToken,
    onFinalize,
    onPrint,
    onClose,
}: CheckoutConsolidatedProps) {
    const resumo = useMemo(() => resumoFatura(items, taxes), [items, taxes]);
    const total = resumo.total;

    const [metodo, setMetodo] = useState<MetodoPagamento>('NUMERARIO');
    const [recebidoTexto, setRecebidoTexto] = useState(() => moneySemUnidade(total));
    const [menuImpressao, setMenuImpressao] = useState(false);

    // Em TPA/Transferência o valor aprovado cobre a conta toda.
    const soNumerario = metodo === 'NUMERARIO';
    const recebido = soNumerario ? Number(recebidoTexto || 0) : total;
    const pagamento = useMemo(() => calcularPagamento(metodo, recebido, total), [metodo, recebido, total]);

    useEffect(() => {
        setRecebidoTexto(moneySemUnidade(total));
    }, [total]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && onClose) {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const imprimir = (formato: FormatoFatura) => {
        setMenuImpressao(false);
        onPrint(formato, pagamento);
    };

    return (
        <div className="bg-[#0d0d0d] border border-white/15 rounded-[28px] shadow-[0_40px_90px_rgba(0,0,0,0.95)] flex flex-col w-full max-w-[960px] max-h-[88vh] overflow-hidden border-t-2 border-t-[#00F2FF]">
            <div className="absolute top-0 right-0 w-56 h-56 bg-[#00F2FF]/5 blur-[110px] -mr-28 -mt-28 pointer-events-none" />

            {/* Cabeçalho compacto */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10 relative z-10 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 hover:border-[#00F2FF]/40 transition-all flex items-center justify-center shrink-0"
                        aria-label="Voltar ao painel principal"
                        title="Voltar (Esc)"
                    >
                        <ArrowLeft className="w-4 h-4 text-white/70" />
                    </button>
                    <div className="w-1 h-8 bg-[#00F2FF] shadow-[0_0_16px_rgba(0,242,255,0.4)] shrink-0" />
                    <div className="min-w-0">
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">
                            FAST <span className="text-[#00F2FF]">CHECK-OUT</span>
                        </h3>
                        <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.35em] mt-1 truncate">
                            {invoiceNumber} • Extrato consolidado
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Assinado</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/5 rounded-xl border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center"
                        aria-label="Fechar e cancelar"
                        title="Fechar (Esc)"
                    >
                        <X className="w-4 h-4 text-white/50" />
                    </button>
                </div>
            </div>

            {/* Corpo: débitos à esquerda, resumo e pagamento à direita */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-4 px-6 py-4 relative z-10">
                {/* Coluna esquerda: estadia + débitos */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 bg-black/40 rounded-2xl border border-white/5 text-[11px]">
                        <div className="col-span-2 flex items-baseline justify-between gap-2">
                            <span className="text-white/30 font-black uppercase tracking-[0.25em] text-[9px]">Hóspede KYC</span>
                            <span className="text-white font-black uppercase tracking-wider text-right truncate">{guestName}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-white/30 font-black uppercase tracking-wider text-[9px]">Cliente</span>
                            <span className="text-[#00F2FF] font-black tabular-nums">{cliente.numero ?? '—'}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-white/30 font-black uppercase tracking-wider text-[9px]">Documento</span>
                            <span className="text-white/80 font-bold tabular-nums text-right truncate">{cliente.documento ?? '—'}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-white/30 font-black uppercase tracking-wider text-[9px]">Quarto</span>
                            <span className="text-white font-black">{roomNumber}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-white/30 font-black uppercase tracking-wider text-[9px]">Período</span>
                            <span className="text-white/80 font-bold tabular-nums">
                                {formatarData(periodo.entrada)} → {formatarData(periodo.saida)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.4em]">Débitos da conta</p>
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-widest tabular-nums">{items.length} lançamento(s)</p>
                    </div>

                    <div className="flex-1 min-h-0 max-h-[36vh] overflow-y-auto no-scrollbar rounded-2xl border border-white/5 bg-black/30">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-[#141414] z-10">
                                <tr className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">
                                    <th className="px-3 py-2">Data / Hora</th>
                                    <th className="px-3 py-2">Lançamento</th>
                                    <th className="px-3 py-2 text-center">Qtd</th>
                                    <th className="px-3 py-2 text-right">Unitário</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-6 text-center text-[10px] text-white/30 font-bold uppercase tracking-widest">
                                            Sem lançamentos além da hospedagem.
                                        </td>
                                    </tr>
                                ) : items.map((linha, indice) => (
                                    <tr key={`${linha.description}-${indice}`} className="border-t border-white/5 hover:bg-white/[0.03] transition-colors align-top">
                                        <td className="px-3 py-2 text-[10px] text-white/60 font-bold tabular-nums whitespace-nowrap">
                                            {formatarDataHora(linha.registeredAt)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <p className="text-[11px] text-white font-black uppercase tracking-wide leading-tight">
                                                {linha.description}
                                            </p>
                                            <p className="text-[9px] text-white/35 font-bold mt-0.5 leading-tight">
                                                {linha.kind === 'ALOJAMENTO'
                                                    ? `Alojamento · Quarto ${roomNumber}`
                                                    : (linha.origin ?? rotuloZona(linha.zone) ?? 'Extra')}
                                            </p>
                                        </td>
                                        <td className="px-3 py-2 text-center text-[11px] text-white/70 font-black tabular-nums">{linha.quantity}</td>
                                        <td className="px-3 py-2 text-right text-[11px] text-white/60 font-bold tabular-nums whitespace-nowrap">
                                            {moneySemUnidade(linha.unitPrice)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-[11px] text-white font-black tabular-nums whitespace-nowrap">
                                            {moneySemUnidade(linha.value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Coluna direita: resumo + pagamento */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="p-3 bg-black/40 rounded-2xl border border-white/5 space-y-1.5">
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.4em] mb-2">Resumo financeiro</p>
                        <div className="flex justify-between text-[11px]">
                            <span className="text-white/50 font-bold uppercase tracking-wider">Alojamento</span>
                            <span className="text-white font-black tabular-nums">{money(resumo.alojamento)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                            <span className="text-white/50 font-bold uppercase tracking-wider">Extras / POS</span>
                            <span className="text-white font-black tabular-nums">{money(resumo.extras)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                            <span className="text-white/50 font-bold uppercase tracking-wider">Taxas</span>
                            <span className="text-white font-black tabular-nums">{money(resumo.taxas)}</span>
                        </div>
                        <div className="flex justify-between items-baseline border-t border-white/10 pt-2 mt-2">
                            <span className="text-white/40 font-black uppercase tracking-[0.25em] text-[9px]">Total</span>
                            <span className="text-3xl font-black text-white tracking-tighter tabular-nums leading-none">
                                {moneySemUnidade(total)}<span className="text-[#00F2FF] text-base ml-1">Kz</span>
                            </span>
                        </div>
                    </div>

                    <div className="p-3 bg-black/40 rounded-2xl border border-white/5 space-y-2">
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.4em]">Método de pagamento</p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {METODOS_PAGAMENTO.map(opcao => {
                                const Icone = ICONES_METODO[opcao.id];
                                const activo = metodo === opcao.id;
                                return (
                                    <button
                                        key={opcao.id}
                                        onClick={() => setMetodo(opcao.id)}
                                        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all ${activo
                                            ? 'border-[#00F2FF] bg-[#00F2FF]/10 text-[#00F2FF]'
                                            : 'border-white/10 bg-white/[0.02] text-white/45 hover:border-white/25'
                                            }`}
                                    >
                                        <Icone className="w-4 h-4" />
                                        <span className="text-[8px] font-black uppercase tracking-wider text-center leading-tight">
                                            {opcao.id === 'NUMERARIO' ? 'Numerário' : opcao.id === 'TPA' ? 'TPA' : 'Transf.'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {soNumerario && (
                            <label className="block">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Valor recebido (Kz)</span>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={recebidoTexto}
                                    onChange={event => setRecebidoTexto(event.target.value)}
                                    className="mt-1 w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-white font-black tabular-nums text-sm outline-none focus:border-[#00F2FF]/60 transition-colors"
                                />
                            </label>
                        )}

                        <div className="space-y-1 border-t border-white/10 pt-2">
                            <div className="flex justify-between text-[10px]">
                                <span className="text-white/40 font-bold uppercase tracking-wider">Pago ({METODOS_PAGAMENTO.find(m => m.id === metodo)?.curto})</span>
                                <span className="text-emerald-400 font-black tabular-nums">{money(pagamento.paid)}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-white/40 font-bold uppercase tracking-wider">Troco devolvido</span>
                                <span className="text-white font-black tabular-nums">{money(pagamento.change)}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-white/40 font-bold uppercase tracking-wider">Pendente / saldo final</span>
                                <span className={`font-black tabular-nums ${pagamento.pending > 0 ? 'text-amber-400' : 'text-white/70'}`}>
                                    {money(pagamento.pending)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <p className="text-[8px] font-black text-white/15 uppercase tracking-widest text-right font-mono">
                        AUDIT_TOKEN: {auditToken}
                    </p>
                </div>
            </div>

            {/* Rodapé com botões fixos */}
            <div className="border-t border-white/10 px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10 shrink-0 bg-[#0d0d0d]">
                <div className="relative">
                    <button
                        onClick={() => setMenuImpressao(aberto => !aberto)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-xs font-black uppercase tracking-widest text-white/80 transition-all hover:border-[#00F2FF]/50 hover:text-[#00F2FF]"
                        aria-haspopup="menu"
                        aria-expanded={menuImpressao}
                    >
                        <Printer className="w-5 h-5" /> Imprimir Fatura / Extrato
                    </button>
                    {menuImpressao && (
                        <div
                            role="menu"
                            className="absolute bottom-full mb-2 left-0 w-full bg-[#151515] border border-white/15 rounded-2xl overflow-hidden shadow-2xl z-30"
                        >
                            <button
                                role="menuitem"
                                onClick={() => imprimir('A4')}
                                className="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#00F2FF]/10 hover:text-[#00F2FF] transition-colors"
                            >
                                Fatura A4 / PDF
                            </button>
                            <button
                                role="menuitem"
                                onClick={() => imprimir('TERMICO')}
                                className="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#00F2FF]/10 hover:text-[#00F2FF] transition-colors border-t border-white/10"
                            >
                                Térmica 80 mm
                            </button>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onFinalize({
                        method: pagamento.method,
                        received: pagamento.received,
                        paid: pagamento.paid,
                        change: pagamento.change,
                        pending: pagamento.pending,
                        invoice: invoiceNumber,
                    })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00F2FF] px-4 py-3.5 text-xs font-black uppercase tracking-widest text-black transition-all hover:scale-[1.01] shadow-[0_0_25px_rgba(0,242,255,0.35)]"
                >
                    Finalizar Check-out
                </button>
            </div>
        </div>
    );
}
