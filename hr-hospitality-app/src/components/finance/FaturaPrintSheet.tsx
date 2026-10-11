'use client';

/**
 * Folha imprimível da fatura / extrato de conta do check-out.
 *
 * Segue o mesmo padrão das escalas de RH: a folha existe só para o papel —
 * fica `hidden print:block` na página, a interface leva `print:hidden` e o
 * `@page` (A4 ou bobina de 80 mm) vem do próprio componente.
 *
 * Dois formatos exigidos no balcão:
 *   A4      — documento oficial de faturação, com tabela de débitos,
 *             resumo financeiro e pagamento;
 *   TERMICO — bobina 80 mm, monoespaçada, para impressão rápida de balcão.
 *
 * Ambos discriminam: o que foi pago (com método), o saldo pendente, o troco
 * devolvido, os dados da empresa (Hotel Lukweku + NIF) e os dados KYC do
 * cliente — além de data/hora, zona e mesa de cada consumo.
 */

import {
    DadosFatura,
    FormatoFatura,
    empresaFatura,
    formatarData,
    formatarDataHora,
    moneySemUnidade,
    resumoFatura,
    ROTULO_METODO,
    rotuloZona,
} from '@/lib/fatura';

const PAGE_RULES: Record<FormatoFatura, string> = {
    A4: '@page { size: A4; margin: 12mm; }',
    TERMICO: '@page { size: 80mm auto; margin: 4mm; }',
};

function rotuloPeriodo(dados: DadosFatura): string {
    const entrada = dados.periodo.entrada ? formatarData(dados.periodo.entrada) : '—';
    const saida = dados.periodo.saida ? formatarData(dados.periodo.saida) : '—';
    return `${entrada} → ${saida}`;
}

function FolhaA4({ dados, impresso }: { dados: DadosFatura; impresso: string }) {
    const empresa = empresaFatura();
    const resumo = resumoFatura(dados.linhas, dados.taxas);

    return (
        <>
            <header style={{ marginBottom: 10, borderBottom: '2px solid #000', paddingBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 900, textTransform: 'uppercase' }}>
                            {empresa.nome}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 10 }}>
                            NIF: {empresa.nif} · {empresa.morada}
                        </p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10 }}>
                        <p style={{ margin: 0, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Fatura / Extrato de Conta
                        </p>
                        <p style={{ margin: '2px 0 0' }}>Nº {dados.numero}</p>
                        <p style={{ margin: '2px 0 0' }}>Emitida: {formatarDataHora(dados.emitidoEm)}</p>
                    </div>
                </div>
            </header>

            <table className="print-table" style={{ marginBottom: 10 }}>
                <tbody>
                    <tr>
                        <th style={{ width: '18%', textAlign: 'left' }}>Hóspede</th>
                        <td style={{ width: '32%', fontWeight: 700 }}>{dados.guestName}</td>
                        <th style={{ width: '18%', textAlign: 'left' }}>Quarto</th>
                        <td style={{ width: '32%' }}>Quarto {dados.roomNumber} · {rotuloPeriodo(dados)}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Cliente KYC</th>
                        <td>{dados.cliente.numero ?? '—'}</td>
                        <th style={{ textAlign: 'left' }}>Documento</th>
                        <td>{dados.cliente.documento ?? '—'}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Contacto</th>
                        <td colSpan={3}>{dados.cliente.email ?? '—'}</td>
                    </tr>
                </tbody>
            </table>

            <table className="print-table">
                <thead>
                    <tr>
                        <th style={{ width: '16%' }}>Data / Hora</th>
                        <th style={{ width: '38%' }}>Lançamento</th>
                        <th style={{ width: '6%', textAlign: 'center' }}>Qtd</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Unitário</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Total</th>
                        <th style={{ width: '12%', textAlign: 'center' }}>Zona</th>
                    </tr>
                </thead>
                <tbody>
                    {dados.linhas.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sem lançamentos além da hospedagem.</td></tr>
                    ) : dados.linhas.map((linha, indice) => (
                        <tr key={`${linha.description}-${indice}`}>
                            <td>{formatarDataHora(linha.registeredAt)}</td>
                            <td>
                                <strong>{linha.description}</strong>
                                {linha.origin ? <div style={{ fontSize: 9 }}>{linha.origin}</div> : null}
                            </td>
                            <td style={{ textAlign: 'center' }}>{linha.quantity}</td>
                            <td style={{ textAlign: 'right' }}>{moneySemUnidade(linha.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{moneySemUnidade(linha.value)}</td>
                            <td style={{ textAlign: 'center', fontSize: 9 }}>{rotuloZona(linha.zone) ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <table className="print-table" style={{ marginTop: 10 }}>
                <tbody>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Alojamento</th>
                        <td style={{ textAlign: 'right', width: '22%' }}>{moneySemUnidade(resumo.alojamento)}</td>
                        <th style={{ textAlign: 'left', width: '20%' }}>Extras / POS</th>
                        <td style={{ textAlign: 'right', width: '22%' }}>{moneySemUnidade(resumo.extras)}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Taxas</th>
                        <td style={{ textAlign: 'right' }}>{moneySemUnidade(resumo.taxas)}</td>
                        <th style={{ textAlign: 'left' }}>Total geral</th>
                        <td style={{ textAlign: 'right', fontWeight: 900 }}>{moneySemUnidade(resumo.total)}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Pagamento</th>
                        <td style={{ textAlign: 'right' }}>{ROTULO_METODO[dados.pagamento.method]}</td>
                        <th style={{ textAlign: 'left' }}>Pago</th>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{moneySemUnidade(dados.pagamento.paid)}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Recebido</th>
                        <td style={{ textAlign: 'right' }}>{moneySemUnidade(dados.pagamento.received)}</td>
                        <th style={{ textAlign: 'left' }}>Troco devolvido</th>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{moneySemUnidade(dados.pagamento.change)}</td>
                    </tr>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Pendente / saldo final</th>
                        <td style={{ textAlign: 'right', fontWeight: 900 }}>{moneySemUnidade(dados.pagamento.pending)}</td>
                        <th style={{ textAlign: 'left' }}>Audit token</th>
                        <td style={{ textAlign: 'right', fontSize: 9 }}>{dados.auditToken}</td>
                    </tr>
                </tbody>
            </table>

            <footer style={{ marginTop: 12, paddingTop: 6, borderTop: '1px solid #000', fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
                <span>{empresa.nome} · NIF {empresa.nif} · {empresa.morada}</span>
                <span>Impresso em {impresso}</span>
            </footer>
        </>
    );
}

function FolhaTermica({ dados, impresso }: { dados: DadosFatura; impresso: string }) {
    const empresa = empresaFatura();
    const resumo = resumoFatura(dados.linhas, dados.taxas);
    // 80 mm ≈ 46 caracteres por linha em Courier 10–11 px: margem de segurança
    // para o texto da origem (zona + mesa + destino) não ser cortado.
    const largura = (texto: string, max: number) =>
        texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;

    return (
        <div className="print-thermal">
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
                {empresa.nome}
            </p>
            <p style={{ margin: '2px 0', textAlign: 'center', fontSize: 10 }}>NIF {empresa.nif}</p>
            <p style={{ margin: '2px 0 6px', textAlign: 'center', fontSize: 10 }}>{empresa.morada}</p>

            <p style={{ margin: '0 0 4px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', fontSize: 10, textAlign: 'center' }}>
                FATURA / EXTRATO DE CONTA
            </p>
            <p style={{ margin: '1px 0', fontSize: 10 }}>Nº {dados.numero}</p>
            <p style={{ margin: '1px 0', fontSize: 10 }}>Emitida: {formatarDataHora(dados.emitidoEm)}</p>

            <p style={{ margin: '6px 0 2px', borderTop: '1px dashed #000', paddingTop: 4, fontSize: 10 }}>
                Hóspede: {largura(dados.guestName, 40)}
            </p>
            <p style={{ margin: '1px 0', fontSize: 10 }}>Cliente: {dados.cliente.numero ?? '—'}</p>
            <p style={{ margin: '1px 0', fontSize: 10 }}>Doc.: {largura(dados.cliente.documento ?? '—', 40)}</p>
            <p style={{ margin: '1px 0', fontSize: 10 }}>Quarto: {dados.roomNumber}</p>
            <p style={{ margin: '1px 0 6px', fontSize: 10 }}>Estadia: {rotuloPeriodo(dados)}</p>

            <p style={{ margin: '4px 0 2px', borderTop: '1px dashed #000', paddingTop: 4, fontSize: 10, fontWeight: 900 }}>
                LANÇAMENTOS ({dados.linhas.length})
            </p>
            {dados.linhas.length === 0 ? (
                <p style={{ margin: '2px 0', fontSize: 10, textAlign: 'center' }}>Sem extras lançados.</p>
            ) : dados.linhas.map((linha, indice) => (
                <div key={`${linha.description}-${indice}`} style={{ marginBottom: 4 }}>
                    <table className="print-table">
                        <tbody>
                            <tr>
                                <td style={{ width: '60%', borderBottom: 'none' }}>
                                    {linha.quantity} x {largura(linha.description, 24)}
                                </td>
                                <td style={{ width: '40%', textAlign: 'right', borderBottom: 'none', fontWeight: 700 }}>
                                    {moneySemUnidade(linha.value)}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ fontSize: 9, borderBottom: 'none', paddingTop: 0 }}>
                                    {formatarDataHora(linha.registeredAt)}
                                    {/* A linha quebra sozinha no papel: mantém a origem completa. */}
                                    {linha.origin ? ` · ${linha.origin}` : (linha.zone ? ` · ${rotuloZona(linha.zone)}` : '')}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ))}

            <table className="print-table" style={{ marginTop: 6 }}>
                <tbody>
                    <tr><td style={{ borderBottom: 'none' }}>ALOJAMENTO</td><td style={{ borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(resumo.alojamento)}</td></tr>
                    <tr><td style={{ borderBottom: 'none' }}>EXTRAS / POS</td><td style={{ borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(resumo.extras)}</td></tr>
                    <tr><td style={{ borderBottom: 'none' }}>TAXAS</td><td style={{ borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(resumo.taxas)}</td></tr>
                    <tr>
                        <td style={{ fontWeight: 900, borderBottom: 'none' }}>TOTAL</td>
                        <td style={{ fontWeight: 900, borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(resumo.total)}</td>
                    </tr>
                </tbody>
            </table>

            <table className="print-table" style={{ marginTop: 6 }}>
                <tbody>
                    <tr>
                        <td style={{ borderBottom: 'none' }}>PAGO ({ROTULO_METODO[dados.pagamento.method]})</td>
                        <td style={{ borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(dados.pagamento.paid)}</td>
                    </tr>
                    <tr>
                        <td style={{ borderBottom: 'none' }}>RECEBIDO</td>
                        <td style={{ borderBottom: 'none', textAlign: 'right' }}>{moneySemUnidade(dados.pagamento.received)}</td>
                    </tr>
                    <tr>
                        <td style={{ borderBottom: 'none' }}>TROCO DEVOLVIDO</td>
                        <td style={{ borderBottom: 'none', textAlign: 'right', fontWeight: 700 }}>{moneySemUnidade(dados.pagamento.change)}</td>
                    </tr>
                    <tr>
                        <td style={{ borderBottom: 'none', fontWeight: 900 }}>PENDENTE / SALDO</td>
                        <td style={{ borderBottom: 'none', textAlign: 'right', fontWeight: 900 }}>{moneySemUnidade(dados.pagamento.pending)}</td>
                    </tr>
                </tbody>
            </table>

            <p style={{ margin: '8px 0 0', borderTop: '1px dashed #000', paddingTop: 4, fontSize: 9, textAlign: 'center' }}>
                {dados.auditToken}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 9, textAlign: 'center' }}>Obrigado pela preferência!</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, textAlign: 'center' }}>Impresso em {impresso}</p>
        </div>
    );
}

export function FaturaPrintSheet({
    formato,
    dados,
    impresso,
}: {
    formato: FormatoFatura;
    dados: DadosFatura;
    impresso: string;
}) {
    return (
        <div id="fatura-print" className="print-sheet text-black bg-white hidden print:block">
            <style>{PAGE_RULES[formato]}</style>
            {formato === 'A4' ? (
                <FolhaA4 dados={dados} impresso={impresso} />
            ) : (
                <FolhaTermica dados={dados} impresso={impresso} />
            )}
        </div>
    );
}
