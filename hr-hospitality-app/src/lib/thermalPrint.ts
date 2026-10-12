/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rotina TÉRMICA PADRÃO — usada por TODOS os módulos de venda:
 *  - POS Tablet
 *  - Restaurante  (/pos)
 *  - Snack-Bar    (/snack-bar)
 *  - QuickSale / Venda Rápida
 *  - Fecho de Mesa (BillModal)
 *
 * Em ambiente Electron (app empacotada) chama `electronAPI.printThermal(texto)`
 * que abre o diálogo de impressão do Windows (janela "Imprimir") — handler
 * registado em `electron/preload.js` + `electron/main.js` (IPC `print-thermal`).
 *
 * Em desenvolvimento / browser faz fallback para uma janela de preview térmico
 * 80mm e chama `window.print()` — que também abre o diálogo de impressão.
 */

export interface ThermalReceiptItem {
    name: string;
    qty?: number;
    price?: number;
    total?: number;
}

export interface ThermalReceiptInput {
    /** Título do estabelecimento/módulo, ex.: "RESTAURANTE", "SNACK-BAR" */
    title: string;
    /** Linhas de cabeçalho: data/hora, mesa, garçom, zona, etc. */
    headerLines?: string[];
    /** Itens vendidos (opcionais — talões rápidos podem omitir). */
    items?: ThermalReceiptItem[];
    /** Total formatado, ex.: "2500,00 AOA" */
    total: string;
    /** Rótulo do método de pagamento, ex.: "Numerário" */
    payLabel?: string;
    /** Linhas de rodapé */
    footerLines?: string[];
    /** Função para formatar valores numéricos (default: 2 casas + vírgula) */
    formatValue?: (value: number) => string;
}

const DEFAULT_FORMAT = (value: number) =>
    Number(value).toFixed(2).replace('.', ',');

const LINE_WIDTH = 32;

const rule = (ch = '=') => ch.repeat(LINE_WIDTH);

const fit = (text: string) =>
    text.length > LINE_WIDTH ? text.slice(0, LINE_WIDTH) : text;

const leftRight = (left: string, right: string) => {
    const space = Math.max(1, LINE_WIDTH - left.length - right.length);
    return left + ' '.repeat(space) + right;
};

/** Constrói o texto monoespaçado do talão 80mm. */
export function buildThermalReceipt(input: ThermalReceiptInput): string {
    const fmt = input.formatValue ?? DEFAULT_FORMAT;
    const lines: string[] = [];

    lines.push(rule());
    lines.push(input.title.padStart(Math.floor((LINE_WIDTH + input.title.length) / 2)));
    lines.push(rule());
    for (const h of input.headerLines ?? []) lines.push(fit(h));

    if (input.items && input.items.length > 0) {
        lines.push(rule('-'));
        for (const item of input.items) {
            const qty = item.qty && item.qty > 1 ? `${item.qty}x ` : '';
            const itemTotal =
                item.total !== undefined
                    ? item.total
                    : item.price !== undefined
                        ? item.price * (item.qty ?? 1)
                        : undefined;
            const label = `${qty}${item.name}`;
            lines.push(
                itemTotal !== undefined
                    ? leftRight(fit(label), fmt(itemTotal))
                    : fit(label),
            );
        }
    }

    lines.push(rule('-'));
    lines.push(leftRight('TOTAL', input.total));
    if (input.payLabel) lines.push(leftRight('Pagamento', input.payLabel));
    lines.push(rule('-'));
    for (const f of input.footerLines ?? ['Obrigado e volte sempre!']) {
        lines.push(fit(f));
    }
    lines.push(rule());

    return lines.join('\n');
}

/**
 * Envia o talão para a impressora.
 * @returns `true` se o comando de impressão foi disparado com sucesso.
 */
export async function printThermalText(text: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const api = (window as any).electronAPI;
    if (api && typeof api.printThermal === 'function') {
        try {
            await api.printThermal(text);
            return true;
        } catch (e) {
            console.error('[thermalPrint] erro via electronAPI.printThermal:', e);
        }
    }

    // Fallback (dev browser / API indisponível): janela de preview 80mm
    // com o talão em monospace + window.print() → diálogo de impressão.
    try {
        const esc = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const win = window.open('', '_blank', 'width=360,height=640');
        if (win) {
            win.document.write(
                `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Talao</title>` +
                `<style>@page{size:80mm auto;margin:2mm}body{margin:0}` +
                `pre{font-family:"Courier New",Courier,monospace;font-size:12px;` +
                `line-height:1.25;white-space:pre-wrap;margin:0;color:#000}</style></head>` +
                `<body><pre>${esc}</pre></body></html>`,
            );
            win.document.close();
            win.focus();
            win.print();
            return true;
        }
    } catch (e) {
        console.error('[thermalPrint] erro no fallback de impressão:', e);
    }

    try {
        window.print();
        return true;
    } catch {
        return false;
    }
}

/**
 * Convenience: monta E imprime o talão numa única chamada.
 * Usa `void` no chamador para não bloquear a UI.
 */
export async function printThermalReceipt(input: ThermalReceiptInput): Promise<boolean> {
    try {
        return await printThermalText(buildThermalReceipt(input));
    } catch (e) {
        console.error('[thermalPrint] falha ao imprimir talão:', e);
        return false;
    }
}
