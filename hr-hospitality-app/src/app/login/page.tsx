/* eslint-disable */
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Key, User as UserIcon, LogIn, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const { login, users } = useAuth();
    const router = useRouter();
    const [idOrName, setIdOrName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Estados de Configuração de Rede Local
    const [showNetworkSettings, setShowNetworkSettings] = useState(false);
    const [serverIp, setServerIp] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('server_ip') || '';
        }
        return '';
    });
    const [appMode, setAppMode] = useState<'server' | 'client'>(() => {
        if (typeof window !== 'undefined') {
            const win = window as any;
            if (win.electronAPI && typeof win.electronAPI.getAppConfig === 'function') {
                try {
                    return win.electronAPI.getAppConfig().mode || 'server';
                } catch (e) {
                    console.error('Erro ao ler config do Electron no login:', e);
                }
            }
        }
        return 'server';
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const success = await login(idOrName, password);
        setLoading(false);

        if (success) {
            navigateAfterLogin();
        } else {
            setError('Credenciais inválidas. Verifique o ID/Nome e palavra-passe.');
        }
    };

    /** SEGURANÇA: contas com palavra-passe padrão vão para alteração obrigatória. */
    const navigateAfterLogin = () => {
        try {
            const session = JSON.parse(localStorage.getItem('hr_active_user') || 'null');
            if (session?.mustChangePassword) {
                router.push('/alterar-palavra-passe');
                return;
            }
        } catch { /* segue fluxo normal */ }
        router.push('/');
    };

    const handleQuickLogin = async (id: string, pass: string) => {
        setError('');
        setLoading(true);
        const success = await login(id, pass);
        setLoading(false);
        if (success) {
            navigateAfterLogin();
        }
    };

    const handleSaveNetworkSettings = () => {
        if (typeof window !== 'undefined') {
            // Salvar no localStorage local
            localStorage.setItem('server_ip', serverIp);
            
            // Comunicar com o processo principal do Electron se aplicável
            const win = window as any;
            if (win.electronAPI && typeof win.electronAPI.saveAppConfig === 'function') {
                try {
                    win.electronAPI.saveAppConfig({ mode: appMode, serverIp });
                    alert('Configurações de rede guardadas com sucesso! Se mudou o Modo de Operação (Servidor vs Cliente), por favor encerre e volte a abrir a aplicação para aplicar as alterações.');
                } catch (e) {
                    console.error('Falha ao comunicar com Electron API:', e);
                    alert('Falha ao comunicar com o Electron para persistir configurações de rede.');
                }
            } else {
                alert('Configurações de IP guardadas com sucesso no browser local.');
            }
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
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase">
                            HR <span className="text-[var(--brand-accent)]">HOSPITALITY</span>
                        </h1>
                    </div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em]">Sistema de Autenticação e Controlo</p>
                </div>

                {/* Main Glassmorphic Card */}
                <div className="glass-panel p-8 md:p-10 rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent opacity-50" />
                    
                    <h2 className="text-xl font-black uppercase tracking-wider text-center mb-8">Iniciar Sessão</h2>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-wider mb-6 text-center"
                        >
                            {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* ID / Username field */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block ml-2">ID do Funcionário ou Nome</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                                    <UserIcon className="w-5 h-5" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={idOrName}
                                    onChange={(e) => setIdOrName(e.target.value)}
                                    placeholder="Ex: EMP-2026-001 ou Ricardo"
                                    className="w-full pl-12 pr-4 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all font-mono"
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
                                    Autenticar <LogIn className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Quick Demos Access */}
                    <div className="mt-10 pt-8 border-t border-white/5">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-4 text-center">Acesso Rápido para Testes</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleQuickLogin('EMP-2026-001', 'admin')}
                                className="p-3 bg-white/5 hover:bg-[var(--brand-primary)]/20 border border-white/5 hover:border-[var(--brand-primary)]/40 rounded-xl text-left transition-all group font-mono text-[9px]"
                            >
                                <p className="text-[8px] font-black text-[var(--brand-accent)] uppercase tracking-wider">ADMIN (Ricardo)</p>
                                <p className="text-[9px] font-bold text-white/40 group-hover:text-white mt-1">Controlo Total</p>
                            </button>
                            <button
                                onClick={() => handleQuickLogin('EMP-2026-002', 'user123')}
                                className="p-3 bg-white/5 hover:bg-[var(--brand-primary)]/20 border border-white/5 hover:border-[var(--brand-primary)]/40 rounded-xl text-left transition-all group font-mono text-[9px]"
                            >
                                <p className="text-[8px] font-black text-white/80 uppercase tracking-wider">PERMISSÃO (Ana S.)</p>
                                <p className="text-[9px] font-bold text-white/40 group-hover:text-white mt-1">Bloqueia SPA</p>
                            </button>
                            <button
                                onClick={() => handleQuickLogin('EMP-2026-003', 'staff')}
                                className="p-3 bg-white/5 hover:bg-[var(--brand-primary)]/20 border border-white/5 hover:border-[var(--brand-primary)]/40 rounded-xl text-left transition-all group font-mono text-[9px]"
                            >
                                <p className="text-[8px] font-black text-indigo-400 uppercase tracking-wider">LIMITADO (João S.)</p>
                                <p className="text-[9px] font-bold text-white/40 group-hover:text-white mt-1">POS & Lavandaria</p>
                            </button>
                            <button
                                onClick={() => handleQuickLogin('EMP-2026-004', 'snack')}
                                className="p-3 bg-white/5 hover:bg-[var(--brand-primary)]/20 border border-white/5 hover:border-[var(--brand-primary)]/40 rounded-xl text-left transition-all group font-mono text-[9px]"
                            >
                                <p className="text-[8px] font-black text-[var(--brand-accent)] uppercase tracking-wider">SNACK BAR (Operador)</p>
                                <p className="text-[9px] font-bold text-white/40 group-hover:text-white mt-1">Apenas Snack Bar</p>
                            </button>
                        </div>
                    </div>

                    {/* Local Network Configurations */}
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <button
                            type="button"
                            onClick={() => setShowNetworkSettings(!showNetworkSettings)}
                            className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all text-slate-400 hover:text-white"
                        >
                            {showNetworkSettings ? 'Ocultar Configurações de Rede' : 'Configurações de Rede Local'}
                        </button>
                        
                        {showNetworkSettings && (
                            <div className="mt-4 p-5 bg-black/40 border border-white/5 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2">
                                    <label className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Modo de Operação</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setAppMode('server')}
                                            className={`py-2 px-3 rounded-xl font-bold text-[10px] uppercase border transition-all ${
                                                appMode === 'server' 
                                                    ? 'bg-[var(--brand-primary)]/20 border-[var(--brand-primary)] text-white' 
                                                    : 'bg-transparent border-white/5 text-white/40 hover:border-white/20'
                                            }`}
                                        >
                                            Servidor
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAppMode('client')}
                                            className={`py-2 px-3 rounded-xl font-bold text-[10px] uppercase border transition-all ${
                                                appMode === 'client' 
                                                    ? 'bg-[var(--brand-accent)]/20 border-[var(--brand-accent)] text-white' 
                                                    : 'bg-transparent border-white/5 text-white/40 hover:border-white/20'
                                            }`}
                                        >
                                            Cliente
                                        </button>
                                    </div>
                                </div>
                                
                                {appMode === 'client' && (
                                    <div className="space-y-2 animate-in fade-in duration-300">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/40 block">IP do Servidor na Rede</label>
                                        <input
                                            type="text"
                                            value={serverIp}
                                            onChange={(e) => setServerIp(e.target.value)}
                                            placeholder="Ex: 192.168.1.100"
                                            className="w-full px-4 py-3 bg-black/60 border border-white/5 rounded-xl text-xs focus:outline-none focus:border-[var(--brand-accent)] transition-all font-mono"
                                        />
                                    </div>
                                )}
                                
                                <button
                                    type="button"
                                    onClick={handleSaveNetworkSettings}
                                    className="w-full py-3 bg-gradient-to-r from-[var(--brand-primary)]/80 to-[var(--brand-accent)]/80 hover:brightness-110 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                                >
                                    Gravar Configurações
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Signup Navigation */}
                <div className="text-center mt-8">
                    <p className="text-xs text-white/30 font-medium">
                        Novo no staff?{' '}
                        <Link href="/cadastro" className="text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1 font-black uppercase tracking-wider text-[10px]">
                            Registar Conta <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
