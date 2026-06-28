/* eslint-disable */
'use client';

import React, { useState } from 'react';
import { useAuth, User } from '@/context/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, UserPlus, Shield, Ban, Eye, Key, ToggleLeft, Trash2, Edit3, CheckCircle, XCircle } from 'lucide-react';

const MODULES_LIST = [
    { key: 'alojamento', name: 'Alojamento' },
    { key: 'eventos', name: 'Eventos' },
    { key: 'facilities', name: 'Facilities' },
    { key: 'lavandaria', name: 'Lavandaria' },
    { key: 'logistica', name: 'Logística' },
    { key: 'parque', name: 'Estacionamento (Parque)' },
    { key: 'pos', name: 'POS (Vendas)' },
    { key: 'rh', name: 'Recursos Humanos' },
    { key: 'snack-bar', name: 'Snack Bar' },
    { key: 'spa', name: 'SPA' },
    { key: 'transfer', name: 'Transfer VIP' }
];

export default function UsuariosManagementPage() {
    const { user: currentUser, users, registerUser, updateUser, deleteUser } = useAuth();
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form states
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO'>('ACESSO');
    const [commissionRate, setCommissionRate] = useState(0.02);
    const [restrictions, setRestrictions] = useState<string[]>([]);
    const [allowedModules, setAllowedModules] = useState<string[]>(['pos']);
    const [status, setStatus] = useState<'ATIVO' | 'BLOQUEADO'>('ATIVO');

    // Only administrators can edit permissions
    if (currentUser?.role !== 'ADMINISTRATOR') {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-6">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full">
                        <Ban className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h2>
                    <p className="text-white/40 max-w-md uppercase tracking-wider text-xs font-black">
                        Apenas utilizadores administradores têm permissão para aceder à gestão de credenciais e restrições.
                    </p>
                </div>
            </DashboardLayout>
        );
    }

    const resetForm = () => {
        setId('');
        setName('');
        setPassword('');
        setRole('ACESSO');
        setCommissionRate(0.02);
        setRestrictions([]);
        setAllowedModules(['pos']);
        setStatus('ATIVO');
        setEditingUser(null);
        setIsCreating(false);
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        const newUser: User = {
            id: id || `EMP-2026-${Math.floor(100 + Math.random() * 900)}`,
            name,
            password: password || '123456',
            role,
            commissionRate,
            restrictions,
            allowedModules: role === 'ACESSO' ? allowedModules : ['*'],
            status
        };
        registerUser(newUser);
        resetForm();
    };

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        const updated: User = {
            id: editingUser.id,
            name,
            password: password || editingUser.password,
            role,
            commissionRate,
            restrictions,
            allowedModules: role === 'ACESSO' ? allowedModules : ['*'],
            status
        };
        updateUser(updated);
        resetForm();
    };

    const startEdit = (user: User) => {
        setEditingUser(user);
        setIsCreating(false);
        setId(user.id);
        setName(user.name);
        setPassword(user.password || '');
        setRole(user.role);
        setCommissionRate(user.commissionRate);
        setRestrictions(user.restrictions || []);
        setAllowedModules(user.allowedModules || []);
        setStatus(user.status);
    };

    const toggleRestriction = (moduleKey: string) => {
        const path = `/${moduleKey}`;
        setRestrictions(prev =>
            prev.includes(path) ? prev.filter(r => r !== path) : [...prev, path]
        );
    };

    const toggleAllowedModule = (moduleKey: string) => {
        setAllowedModules(prev =>
            prev.includes(moduleKey) ? prev.filter(m => m !== moduleKey) : [...prev, moduleKey]
        );
    };

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-1.5 h-6 bg-[var(--brand-primary)] shadow-[0_0_15px_var(--brand-primary)]" />
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.6em]">DNA HR-HOSPITALITY • Administrador</span>
                        </div>
                        <h1 className="text-5xl font-black text-white tracking-tighter uppercase">
                            GESTÃO DE <span className="text-[var(--brand-accent)]">UTILIZADORES</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.4em] text-[10px] mt-4">
                            Controlo de Credenciais, Permissões Especiais e Restrições de Sistema
                        </p>
                    </div>
                    {!isCreating && !editingUser && (
                        <button
                            onClick={() => { resetForm(); setIsCreating(true); }}
                            className="px-8 py-4 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-accent)] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <UserPlus className="w-4 h-4" /> ADICIONAR COLABORADOR
                        </button>
                    )}
                </div>

                {/* Form Overlay / Editor Panel */}
                {(isCreating || editingUser) && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel p-8 rounded-[40px] border border-[var(--brand-accent)]/20 shadow-2xl relative"
                    >
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent" />
                        <h3 className="text-xl font-black uppercase tracking-wider text-white mb-8">
                            {isCreating ? 'Novo Colaborador' : `Editar Utilizador: ${editingUser?.name}`}
                        </h3>

                        <form onSubmit={isCreating ? handleCreate : handleUpdate} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">ID do Funcionário</label>
                                    <input
                                        type="text"
                                        disabled={!!editingUser}
                                        value={id}
                                        onChange={(e) => setId(e.target.value)}
                                        placeholder="Ex: EMP-2026-004"
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all font-mono disabled:opacity-50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Nome Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ex: Carlos Costa"
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Palavra-passe (Login)</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={editingUser ? 'Deixar em branco para manter' : 'Introduzir senha'}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Função / Nível de Acesso</label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as any)}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] text-white/80"
                                    >
                                        <option value="ADMINISTRATOR">ADMINISTRATOR (Acesso Total)</option>
                                        <option value="PERMISSAO">PERMISSAO (Authorized User com restrições)</option>
                                        <option value="ACESSO">ACESSO (Acesso limitado a módulos específicos)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Taxa de Comissão (Ex: 0.05 = 5%)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="0.5"
                                        value={commissionRate}
                                        onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-2">Estado da Conta</label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as any)}
                                        className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[var(--brand-accent)] text-white/80"
                                    >
                                        <option value="ATIVO">ATIVO</option>
                                        <option value="BLOQUEADO">BLOQUEADO (Suspenso)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Permissions configuration details */}
                            {role === 'PERMISSAO' && (
                                <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--brand-accent)]">Restrições (Bloquear Ecrãs específicos)</h4>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Selecione os módulos que este utilizador NÃO poderá aceder:</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {MODULES_LIST.map((m) => {
                                            const restricted = restrictions.includes(`/${m.key}`);
                                            return (
                                                <button
                                                    key={m.key}
                                                    type="button"
                                                    onClick={() => toggleRestriction(m.key)}
                                                    className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-wider text-left transition-all flex items-center justify-between ${
                                                        restricted
                                                            ? 'border-red-500/40 bg-red-500/10 text-red-400'
                                                            : 'border-white/5 bg-black/20 text-white/60 hover:border-white/20'
                                                    }`}
                                                >
                                                    {m.name}
                                                    {restricted ? <XCircle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-white/20" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {role === 'ACESSO' && (
                                <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--brand-accent)]">Módulos Autorizados (Lista Branca)</h4>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Selecione apenas os ecrãs aos quais este utilizador terá permissão de entrada:</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {MODULES_LIST.map((m) => {
                                            const allowed = allowedModules.includes(m.key);
                                            return (
                                                <button
                                                    key={m.key}
                                                    type="button"
                                                    onClick={() => toggleAllowedModule(m.key)}
                                                    className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-wider text-left transition-all flex items-center justify-between ${
                                                        allowed
                                                            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/20 text-[var(--brand-accent)]'
                                                            : 'border-white/5 bg-black/20 text-white/60 hover:border-white/20'
                                                    }`}
                                                >
                                                    {m.name}
                                                    {allowed ? <CheckCircle className="w-4 h-4 text-[var(--brand-accent)]" /> : <XCircle className="w-4 h-4 text-white/20" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Actions Buttons */}
                            <div className="flex gap-4">
                                <button
                                    type="submit"
                                    className="px-8 py-4 bg-emerald-500 text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all"
                                >
                                    {isCreating ? 'Gravar Novo Colaborador' : 'Confirmar Alterações'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}

                {/* Users List Table */}
                <div className="glass-panel rounded-[40px] overflow-hidden shadow-2xl border border-white/5">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center">
                        <h3 className="text-lg font-black uppercase tracking-wider flex items-center gap-3">
                            <Users className="w-5 h-5 text-[var(--brand-accent)]" /> Colaboradores Registados ({users.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full responsive-table">
                            <thead>
                                <tr className="border-b border-white/5 text-left text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                                    <th className="p-6">ID</th>
                                    <th className="p-6">Nome</th>
                                    <th className="p-6">Função</th>
                                    <th className="p-6">Comissão</th>
                                    <th className="p-6">Status</th>
                                    <th className="p-6">Restrições / Permissões</th>
                                    <th className="p-6 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {users.map((u) => (
                                    <tr key={u.id} className="hover:bg-white/2 transition-colors">
                                        <td className="p-6 font-mono text-xs text-white/50" data-label="ID">{u.id}</td>
                                        <td className="p-6 font-bold" data-label="Nome">{u.name}</td>
                                        <td className="p-6" data-label="Função">
                                            <span className={`px-3 py-1 text-[8px] font-black tracking-widest rounded uppercase ${
                                                u.role === 'ADMINISTRATOR' ? 'bg-[var(--brand-primary)]/20 text-[var(--brand-accent)]' :
                                                u.role === 'PERMISSAO' ? 'bg-white/10 text-white/80' : 'bg-amber-500/10 text-amber-400'
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-6 font-mono text-xs text-white/60" data-label="Comissão">{(u.commissionRate * 100).toFixed(0)}%</td>
                                        <td className="p-6" data-label="Status">
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${u.status === 'ATIVO' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {u.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-xs text-white/40 max-w-xs truncate" data-label="Regras">
                                            {u.role === 'ADMINISTRATOR' && 'Controlo Total (Sem Restrições)'}
                                            {u.role === 'PERMISSAO' && (u.restrictions.length > 0 ? `Proibido: ${u.restrictions.join(', ')}` : 'Permissão Completa')}
                                            {u.role === 'ACESSO' && `Permitido apenas: ${u.allowedModules.join(', ')}`}
                                        </td>
                                        <td className="p-6 text-right space-x-3 whitespace-nowrap" data-label="Ações">
                                            <button
                                                onClick={() => startEdit(u)}
                                                className="p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl hover:text-[var(--brand-accent)] transition-all"
                                                title="Editar"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteUser(u.id)}
                                                className="p-3 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-xl text-white/40 hover:text-red-500 transition-all"
                                                title="Apagar"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
