'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, ShieldAlert } from 'lucide-react';

export default function CadastroPage() {
  return (
    <div className="min-h-screen bg-[#080B11] text-white flex flex-col justify-center items-center relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--brand-primary)]/10 blur-[150px] rounded-full pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[480px] z-10"
      >
        <div className="glass-panel p-8 md:p-10 rounded-[40px] shadow-2xl border border-white/5 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider">Registo Público Desativado</h1>
            <p className="mt-4 text-sm text-white/50 leading-relaxed">
              As contas são criadas por convite e approvação de um administrador.
              Não é possível atribuir uma role ou criar uma conta administrativa pela aplicação.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-white/40">
            <Mail className="w-4 h-4" /> Contacte o administrador do Hotel Lukweku
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao Login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
