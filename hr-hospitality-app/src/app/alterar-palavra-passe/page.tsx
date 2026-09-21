/* eslint-disable */
'use client';

/**
 * HR-HOSPITALITY — Alteração Obrigatória de Palavra-passe
 *
 * Ecrã para onde o login redireciona contas com credencial padrão/conhecida
 * (mustChangePassword = true). Também acessível manualmente por utilizadores
 * autenticados que queiram alterar a própria palavra-passe.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { KeyRound, ShieldAlert, Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_TENANT } from '@/config/tenants';

export default function AlterarPalavraPassePage() {
    const { user, changeOwnPassword, logout } = useAuth();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) {
            router.replace('/login');
        }
    }, [user, router]);

    const isMandatory = Boolean(user?.mustChangePassword);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('A confirmação não coincide com a nova palavra-passe.');
            return;
        }
        if (newPassword.length < 8) {
            setError('A nova palavra-passe deve ter pelo menos 8 caracteres.');
            return;
        }

        setLoading(true);
        const ok = await changeOwnPassword(currentPassword, newPassword);
        setLoading(false);

        if (ok) {
            alert('Palavra-passe alterada com sucesso. Bem-vindo!');
            router.push('/');
        } else {
            setError('Não foi possível alterar. Verifique a palavra-passe atual (mín. 8 caracteres na nova).');
        }
    };

    if (!user) return null;

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{ background: DEFAULT_TENANT.colors.background }}
        >
            {/* Fundo decorativo */}
            <div className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                    background: `radial-gradient(ellipse at 30% 20%, ${DEFAULT_TENANT.colors.primary}33, transparent 60%),
                                 radial-gradient(ellipse at 70% 80%, ${DEFAULT_TENANT.colors.accent}22, transparent 55%)`
                }}
            />

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative w-full max-w-md glass-panel rounded-[28px] p-8 md:p-10 border border-white/10 shadow-2xl"
            >
                {/* Cabeçalho */}
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: isMandatory ? '#DC2626' : DEFAULT_TENANT.colors.primary }}>
                        {isMandatory
                            ? <ShieldAlert className="w-6 h-6 text-white" />
                            : <KeyRound className="w-6 h-6 text-white" />}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
                            {DEFAULT_TENANT.name} • Segurança
                        </p>
                        <h1 className="text-xl font-black text-white tracking-tight">
                            {isMandatory ? 'Alteração Obrigatória' : 'Alterar Palavra-passe'}
                        </h1>
                    </div>
                </div>

                {isMandatory && (
                    <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        <p className="font-bold mb-1">⚠️ Palavra-passe temporária detetada</p>
                        <p className="text-white/70">
                            A sua conta ainda usa uma palavra-passe inicial conhecida.
                            Defina uma nova palavra-passe para continuar.
                        </p>
                    </div>
                )}

                <p className="mt-4 text-sm text-white/60">
                    Sessão de <span className="text-white font-semibold">{user.name}</span> ({user.id})
                </p>

                {/* Formulário */}
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                            Palavra-passe atual
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                required
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-4 py-3 pr-12 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--brand-primary)]"
                                placeholder="••••••••"
                            />
                            <button type="button" onClick={() => setShowCurrent(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                                {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                            Nova palavra-passe (mín. 8 caracteres)
                        </label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                required
                                minLength={8}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-3 pr-12 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--brand-primary)]"
                                placeholder="••••••••"
                            />
                            <button type="button" onClick={() => setShowNew(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                            Confirmar nova palavra-passe
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--brand-primary)]"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider text-sm text-white transition-all disabled:opacity-50"
                        style={{ background: DEFAULT_TENANT.colors.primary }}
                    >
                        {loading ? 'A guardar...' : 'Guardar nova palavra-passe'}
                    </button>

                    {!isMandatory && (
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            className="w-full py-3 rounded-2xl text-sm text-white/60 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                    )}

                    {isMandatory && (
                        <button
                            type="button"
                            onClick={() => { logout(); router.push('/login'); }}
                            className="w-full py-3 rounded-2xl text-sm text-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut className="w-4 h-4" /> Terminar sessão
                        </button>
                    )}
                </form>
            </motion.div>
        </div>
    );
}
