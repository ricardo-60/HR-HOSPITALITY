/**
 * Ecrã de arranque da plataforma.
 *
 * O `AuthProvider` e o `DashboardLayout` devolviam `null` enquanto não
 * estavam montados. Como o HTML é pré-renderizado, a página saía do export
 * com ~5 elementos e a janela do Electron ficava um rectângulo escuro sem
 * nada até o React hidratar — medido no Cliente: vazio dos 600 ms aos
 * 3200 ms, com a captura de 1800 ms a confirmar que não havia sequer logo.
 *
 * Pôr a marca no HTML faz a app ter UI visível desde o primeiro paint.
 *
 * Isto NÃO substitui nenhum guarda: continua a não se renderizar
 * `children` enquanto a sessão não resolve, tal como antes.
 */
export function BootSplash({ mensagem = 'A carregar' }: { mensagem?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#111827]"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <span className="text-2xl font-black tracking-tight text-[var(--brand-secondary)]">
          HR
        </span>
      </div>

      <div className="text-center">
        <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-[0.5em] text-white/80">
          HR-HOSPITALITY
        </p>
        <p className="mt-3 text-[10px] uppercase tracking-[0.35em] text-white/40">
          {mensagem}…
        </p>
      </div>

      <div className="h-0.5 w-44 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand-secondary)]" />
      </div>
    </div>
  );
}
