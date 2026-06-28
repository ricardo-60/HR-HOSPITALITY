/* eslint-disable */
'use client';

import React, { useState } from 'react';
import { useAuth, User } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { UserPlus, User as UserIcon, Key, IdentificationIcon, Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CadastroPage() {
    const { registerUser } = useAuth();
    const router = useRouter();
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'PERMISSAO' | 'ACESSO'>('ACESSO');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const newUser: User = {
            id: id || `EMP-2026-${Math.floor(100 + Math.random() * 900)}`,
            name,
            role,
            password,
            commissionRate: role === 'PERMISSAO' ? 0.03 : 0.02,
            restrictions: [],
            allowedModules: role === 'ACESSO' ? ['pos'] : ['*'],
            status: 'ATIVO'
        };

        try {
            registerUser(newUser);
            setSuccess(true);
            setTimeout(() => {
                router.push('/login');
            }, 2000);
        } catch (err) {
            alert('Erro ao registar utilizador.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#080B11] text-white flex flex-col justify-center items-center relative overflow-hidden px-4">
            {/* Background dynamic ambient glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--brand-primary)]/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--brand-accent)]/10 blur-[150px] rounded-full pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-[480px] z-10"
            >
                {/* Header branding */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="p-3 bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-accent)] rounded-2xl shadow-[0_0_30px_rgba(0,71,171,0.3)]">
                            <UserPlus className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase">
                            HR <span className="text-[var(--brand-accent)]">HOSPITALITY</span>
                        </h1>
                    </div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em]">Registo de Novo Colaborador</p>
                </div>

                {/* Main Glassmorphic Card */}
                <div className="glass-panel p-8 md:p-10 rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent opacity-50" />
                    
                    <h2 className="text-xl font-black uppercase tracking-wider text-center mb-8">Criar Conta</h2>

                    {success ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-8 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-3xl text-center space-y-4"
                        >
                            <Shield className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
                            <p className="text-sm font-black uppercase tracking-wider">Registo Concluído com Sucesso!</p>
                            <p className="text-xs text-white/40">Redirecionando para a página de login...</p>
                        </motion.div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Employee ID field */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-2">ID do Funcionário (Opcional)</label>
                                <input
                                    type="text"
                                    value={id}
                                    onChange={(e) => setId(e.target.value)}
                                    placeholder="Ex: EMP-2026-999"
                                    className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all font-mono"
                                />
                            </div>

                            {/* Full Name field */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-2">Nome Completo</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                                        <UserIcon className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ex: Maria Santos"
                                        className="w-full pl-12 pr-4 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password field */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-2">Palavra-passe</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                                        <Key className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full pl-12 pr-4 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Role Select field */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-2">Nível de Função Pretendido</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as 'PERMISSAO' | 'ACESSO')}
                                    className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all text-white/80"
                                >
                                    <option value="ACESSO" className="bg-[#080B11]">Acesso Limitado (Apenas módulos específicos)</option>
                                    <option value="PERMISSAO" className="bg-[#080B11]">Acesso Autorizado (Módulos padrão, com restrições)</option>
                                </select>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4.5 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-accent)] text-white font-black text-xs uppercase tracking-[0.3em] rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-[0_20px_40px_rgba(0,71,171,0.2)] disabled:opacity-50"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        Registar Colaborador <ArrowLeft className="w-4 h-4 rotate-180" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Return to Login */}
                <div className="text-center mt-8">
                    <Link href="/login" className="text-white/40 hover:text-white inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all">
                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Login
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
