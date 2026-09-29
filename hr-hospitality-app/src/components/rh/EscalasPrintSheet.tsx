'use client';

/**
 * Folha imprimível das escalas de RH.
 *
 * Três formatos, escolhidos pelo operador antes de `window.print()`:
 *
 *   A4      — folha completa da semana, uma linha por colaborador;
 *   SETOR   — resumo agrupado por setor, para entregar ao chefe de equipa;
 *   TERMICO — bobina de 80 mm, monoespaçada, para imprimir no balcão.
 *
 * A folha injecta o próprio `@page`: o tamanho do papel é uma regra CSS e não
 * se pode definir por classe. Fica `hidden` no ecrã e `print:block` no papel,
 * enquanto a interface da app leva `print:hidden` — por isso não é preciso
 * esconder nada à mão nem depender do posicionamento absoluto.
 */

import { DEFAULT_TENANT } from '@/config/tenants';

export type FormatoImpressao = 'A4' | 'SETOR' | 'TERMICO';

export interface EscalaTurno {
    id: string;
    nome: string;
    dia: string;
    tipo: string;
    horas: string;
    setor?: string;
}

export const DIAS_IMPRESSAO = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;

/** Setores de referência de um hotel; o operador pode acrescentar os seus. */
export const SECTORES = [
    'RECEPÇÃO',
    'RESTAURANTE',
    'BAR',
    'LIMPEZA',
    'MANUTENÇÃO',
    'SEGURANÇA',
    'PISCINA',
    'ADMINISTRAÇÃO',
] as const;

export const SEM_SETOR = 'SEM SETOR';

const PAGE_RULES: Record<FormatoImpressao, string> = {
    A4: '@page { size: A4; margin: 12mm; }',
    SETOR: '@page { size: A4; margin: 10mm; }',
    TERMICO: '@page { size: 80mm auto; margin: 4mm; }',
};

const FORMATO_LABEL: Record<FormatoImpressao, string> = {
    A4: 'Escala semanal · folha A4',
    SETOR: 'Resumo por setor · folha A4',
    TERMICO: 'Escala térmica · bobina 80 mm',
};

function setorDe(turno: EscalaTurno): string {
    const value = (turno.setor ?? '').trim();
    return value.length > 0 ? value.toUpperCase() : SEM_SETOR;
}

function agruparPorSetor(turnos: EscalaTurno[]): Array<{ setor: string; itens: EscalaTurno[] }> {
    const mapa = new Map<string, EscalaTurno[]>();
    for (const turno of turnos) {
        const chave = setorDe(turno);
        const lista = mapa.get(chave) ?? [];
        lista.push(turno);
        mapa.set(chave, lista);
    }
    return [...mapa.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'pt'))
        .map(([setor, itens]) => ({ setor, itens }));
}

function ordenar(turnos: EscalaTurno[]): EscalaTurno[] {
    return [...turnos].sort((a, b) => {
        const dia = DIAS_IMPRESSAO.indexOf(a.dia as (typeof DIAS_IMPRESSAO)[number])
            - DIAS_IMPRESSAO.indexOf(b.dia as (typeof DIAS_IMPRESSAO)[number]);
        if (dia !== 0) return dia;
        return a.nome.localeCompare(b.nome, 'pt');
    });
}

function Cabecalho({ rotulo, formato }: { rotulo: string; formato: FormatoImpressao }) {
    return (
        <header style={{ marginBottom: 10, borderBottom: '2px solid #000', paddingBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 900, textTransform: 'uppercase' }}>
                        {DEFAULT_TENANT.name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Recursos Humanos · Escalas de Trabalho
                    </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: 10 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{FORMATO_LABEL[formato]}</p>
                    <p style={{ margin: '2px 0 0' }}>{rotulo}</p>
                </div>
            </div>
        </header>
    );
}

function Rodape({ impresso }: { impresso: string }) {
    return (
        <footer style={{ marginTop: 12, paddingTop: 6, borderTop: '1px solid #000', fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
            <span>{DEFAULT_TENANT.name} · Recursos Humanos</span>
            <span>Impresso em {impresso}</span>
        </footer>
    );
}

function FolhaA4({ turnos, rotulo, impresso }: { turnos: EscalaTurno[]; rotulo: string; impresso: string }) {
    const porColaborador = new Map<string, EscalaTurno[]>();
    for (const turno of turnos) {
        const lista = porColaborador.get(turno.nome) ?? [];
        lista.push(turno);
        porColaborador.set(turno.nome, lista);
    }
    const linhas = [...porColaborador.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt'));

    return (
        <>
            <Cabecalho rotulo={rotulo} formato="A4" />
            <table className="print-table">
                <thead>
                    <tr>
                        <th style={{ width: '22%' }}>Colaborador</th>
                        <th style={{ width: '14%' }}>Setor</th>
                        {DIAS_IMPRESSAO.map(dia => <th key={dia} style={{ width: '9%', textAlign: 'center' }}>{dia.slice(0, 3)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {linhas.length === 0 ? (
                        <tr><td colSpan={9} style={{ textAlign: 'center' }}>Sem escalas registadas para esta semana.</td></tr>
                    ) : linhas.map(([nome, itens]) => {
                        const porDia = new Map<string, EscalaTurno>();
                        for (const item of itens) if (!porDia.has(item.dia)) porDia.set(item.dia, item);
                        return (
                            <tr key={nome}>
                                <td style={{ fontWeight: 700 }}>{nome}</td>
                                <td>{setorDe(itens[0])}</td>
                                {DIAS_IMPRESSAO.map(dia => {
                                    const item = porDia.get(dia);
                                    return (
                                        <td key={dia} style={{ textAlign: 'center', fontSize: 9 }}>
                                            {item ? (
                                                <>
                                                    <strong>{item.tipo === 'Folga' ? 'FOLGA' : item.tipo}</strong>
                                                    <br />
                                                    {item.horas}
                                                </>
                                            ) : '—'}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <Rodape impresso={impresso} />
        </>
    );
}

function FolhaSetor({ turnos, rotulo, impresso }: { turnos: EscalaTurno[]; rotulo: string; impresso: string }) {
    const grupos = agruparPorSetor(turnos);

    return (
        <>
            <Cabecalho rotulo={rotulo} formato="SETOR" />
            {grupos.length === 0 ? (
                <p style={{ textAlign: 'center', fontSize: 11 }}>Sem escalas registadas para esta semana.</p>
            ) : grupos.map(({ setor, itens }) => (
                <section key={setor} className="print-block" style={{ marginBottom: 12 }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {setor} · {itens.length} turno(s)
                    </h2>
                    <table className="print-table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th style={{ width: '16%' }}>Dia</th>
                                <th style={{ width: '16%' }}>Turno</th>
                                <th style={{ width: '22%' }}>Horas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordenar(itens).map(turno => (
                                <tr key={turno.id}>
                                    <td>{turno.nome}</td>
                                    <td>{turno.dia}</td>
                                    <td>{turno.tipo}</td>
                                    <td>{turno.horas}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ))}
            <Rodape impresso={impresso} />
        </>
    );
}

function FolhaTermica({ turnos, rotulo, impresso }: { turnos: EscalaTurno[]; rotulo: string; impresso: string }) {
    const grupos = agruparPorSetor(turnos);

    return (
        <div className="print-thermal">
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
                {DEFAULT_TENANT.name}
            </p>
            <p style={{ margin: '2px 0', textAlign: 'center', fontSize: 10, textTransform: 'uppercase' }}>
                Escalas · RH
            </p>
            <p style={{ margin: '2px 0 6px', textAlign: 'center', fontSize: 10 }}>
                {rotulo}
            </p>
            <p style={{ margin: '0 0 4px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', fontSize: 10, textAlign: 'center' }}>
                {turnos.length} turno(s) · {grupos.length} setor(es)
            </p>

            {grupos.map(({ setor, itens }) => (
                <section key={setor} className="print-block" style={{ marginBottom: 8 }}>
                    <p style={{ margin: '4px 0 2px', fontSize: 11, fontWeight: 900 }}>{setor}</p>
                    <table className="print-table">
                        <tbody>
                            {ordenar(itens).map(turno => (
                                <tr key={turno.id}>
                                    <td style={{ width: '38%' }}>{turno.nome}</td>
                                    <td style={{ width: '20%' }}>{turno.dia.slice(0, 3)}</td>
                                    <td style={{ width: '42%' }}>
                                        {turno.tipo === 'Folga' ? 'FOLGA' : `${turno.tipo} ${turno.horas}`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ))}

            {grupos.length === 0 ? <p style={{ textAlign: 'center' }}>Sem escalas.</p> : null}
            <p style={{ margin: '8px 0 0', borderTop: '1px dashed #000', paddingTop: 4, fontSize: 9, textAlign: 'center' }}>
                {impresso}
            </p>
        </div>
    );
}

export function EscalasPrintSheet({
    formato,
    turnos,
    rotulo,
    impresso,
}: {
    formato: FormatoImpressao;
    turnos: EscalaTurno[];
    rotulo: string;
    impresso: string;
}) {
    return (
        <div id="print-sheet" className="print-sheet hidden print:block text-black bg-white">
            <style>{PAGE_RULES[formato]}</style>
            {formato === 'A4' ? (
                <FolhaA4 turnos={turnos} rotulo={rotulo} impresso={impresso} />
            ) : formato === 'SETOR' ? (
                <FolhaSetor turnos={turnos} rotulo={rotulo} impresso={impresso} />
            ) : (
                <FolhaTermica turnos={turnos} rotulo={rotulo} impresso={impresso} />
            )}
        </div>
    );
}
