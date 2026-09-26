/**
 * Declarações para importações de CSS.
 *
 * O `src/global.css` é importado apenas pelo seu efeito secundário (o
 * NativeWind transforma-o em estilos em tempo de execução), pelo que não
 * exporta símbolos. Sem esta declaração o TypeScript 6 rejeita o
 * `import '@/global.css'`.
 */
declare module '*.css';
