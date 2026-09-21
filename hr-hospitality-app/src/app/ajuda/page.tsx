'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { BookOpen, Network, ShieldAlert, ShoppingCart, HelpCircle } from 'lucide-react';

export default function AjudaPage() {
    const [activeTab, setActiveTab] = useState<'rede' | 'acessos' | 'consumos'>('rede');

    return (
        <DashboardLayout>
            <div className="max-w-[1200px] mx-auto space-y-12 pb-20 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-4"
                >
                    <div className="inline-flex p-4 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-3xl text-[var(--brand-primary)] mb-4">
                        <BookOpen className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight uppercase">
                        Manual & <span className="text-[var(--brand-primary)]">Suporte Técnico</span>
                    </h1>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs max-w-2xl mx-auto">
                        Documentação Operacional do Ecossistema HR-HOSPITALITY
                    </p>
                </motion.div>

                {/* Tabs */}
                <div className="flex justify-center gap-4 border-b border-white/5 pb-6">
                    <button
                        onClick={() => setActiveTab('rede')}
                        className={`px-5 py-3 rounded-full font-black text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
                            activeTab === 'rede'
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <Network className="w-4 h-4" />
                        Rede Local (Servidor/Cliente)
                    </button>
                    <button
                        onClick={() => setActiveTab('acessos')}
                        className={`px-5 py-3 rounded-full font-black text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
                            activeTab === 'acessos'
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <ShieldAlert className="w-4 h-4" />
                        Níveis de Acesso
                    </button>
                    <button
                        onClick={() => setActiveTab('consumos')}
                        className={`px-5 py-3 rounded-full font-black text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
                            activeTab === 'consumos'
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20'
                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        Lançamentos no Quarto
                    </button>
                </div>

                {/* Tab Contents */}
                <div className="grid grid-cols-1 gap-8 mt-6 max-w-4xl mx-auto">
                    {activeTab === 'rede' && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="glass-panel p-8 md:p-10 rounded-[32px] border border-white/5 space-y-6 text-slate-300"
                        >
                            <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-3">
                                <Network className="text-[var(--brand-primary)]" />
                                1. Configuração e Arquitetura de Rede Híbrida
                            </h3>
                            <p className="leading-relaxed">
                                O aplicativo <strong>HR Hospitality</strong> opera de modo híbrido (Offline-First). Ele se comunica com a nuvem e utiliza um banco de dados SQLite local nativo de alto desempenho. A infraestrutura possui duas funções de máquina configuráveis:
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                <div className="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3">
                                    <h4 className="font-black text-white text-sm uppercase tracking-wider text-[var(--brand-primary)]">Modo Servidor</h4>
                                    <p className="text-xs leading-relaxed text-slate-400">
                                        Deve ser executado em apenas <strong>uma máquina central</strong> da empresa. Ele cria o banco de dados principal <code>hospitality_local.db</code> e inicia um servidor Express local na porta <code>3002</code>, aceitando conexões de outros computadores da rede interna.
                                    </p>
                                </div>
                                <div className="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3">
                                    <h4 className="font-black text-white text-sm uppercase tracking-wider text-[var(--brand-accent)]">Modo Cliente</h4>
                                    <p className="text-xs leading-relaxed text-slate-400">
                                        Executado nas máquinas adicionais da loja (como o terminal do Snack Bar). Ele não inicia o banco local, mas se conecta via rede ao IP da máquina configurada como Servidor na porta <code>3002</code>.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 font-mono text-xs space-y-3 text-emerald-400">
                                <p className="text-white/60"># Como configurar a máquina Cliente:</p>
                                <p>1. No computador Servidor, abra o terminal do Windows (cmd) e digite: <span className="text-white">ipconfig</span></p>
                                <p>2. Localize o IP da rede (Ex: 192.168.1.150)</p>
                                <p>3. Na máquina Cliente, abra o HR Hospitality e clique em "Configurações de Rede Local" no ecrã de login.</p>
                                <p>4. Mude o modo para "Cliente" e insira o IP do Servidor (Ex: 192.168.1.150).</p>
                                <p>5. Clique em Gravar e reinicie o aplicativo.</p>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'acessos' && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="glass-panel p-8 md:p-10 rounded-[32px] border border-white/5 space-y-6 text-slate-300"
                        >
                            <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-3">
                                <ShieldAlert className="text-[var(--brand-primary)]" />
                                2. Níveis de Acesso e Restrições de Utilizadores
                            </h3>
                            <p className="leading-relaxed">
                                Para garantir a integridade operacional e segurança financeira, o sistema implementa controle de acesso rigoroso a nível de menus e recursos da barra lateral:
                            </p>

                            <div className="space-y-4 pt-2">
                                <div className="p-5 border border-white/5 bg-white/5 rounded-2xl flex gap-4 items-start">
                                    <div className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-black rounded-lg uppercase tracking-wider">
                                        Snack Bar
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-white text-sm">Operadores de Snack Bar</h4>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Possuem acesso exclusivo ao terminal rápido de vendas do <strong>Snack Bar</strong> e à Central de Ajuda. Módulos confidenciais (Recursos Humanos, Faturação, Eventos, Configurações de Administrador) aparecem bloqueados com cadeado e são inacessíveis para este nível de privilégio.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-5 border border-white/5 bg-white/5 rounded-2xl flex gap-4 items-start">
                                    <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-wider">
                                        Controlo
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-white text-sm">Administradores e Auditores</h4>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Acesso ilimitado e irrestrito a todos os menus do ecossistema, incluindo o painel de Recursos Humanos, Controle de Usuários e relatórios corporativos.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'consumos' && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="glass-panel p-8 md:p-10 rounded-[32px] border border-white/5 space-y-6 text-slate-300"
                        >
                            <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-3">
                                <ShoppingCart className="text-[var(--brand-primary)]" />
                                3. Lançamento de Consumos no Quarto do Hóspede
                            </h3>
                            <p className="leading-relaxed">
                                Os operadores de ponto de venda podem transferir o valor de contas de consumo diretamente para a conta da estadia do hóspede de forma integrada e segura:
                            </p>

                            <ol className="list-decimal list-inside space-y-3 leading-relaxed text-sm pl-2">
                                <li>No mapa de mesas do <strong>Snack Bar</strong> ou do <strong>POS</strong>, clique sobre a mesa que deseja fechar (apenas mesas com status <strong className="text-[var(--brand-secondary)]">Em Consumo</strong>).</li>
                                <li>No modal de faturação que se abre, clique em <strong>Lançar no Quarto</strong>.</li>
                                <li>O sistema consultará ativamente o banco de dados e listará no dropdown todos os hóspedes com estadias ativas (status <code>CHECKED_IN</code> ou <code>CONFIRMADA</code>) e seus respectivos quartos.</li>
                                <li>Selecione o hóspede correspondente e clique em <strong>Confirmar Fecho</strong>.</li>
                                <li>O sistema lançará a despesa na tabela <code>hotel_consumptions</code> do banco de dados, liberando a mesa de consumo no ecrã de vendas instantaneamente.</li>
                            </ol>
                        </motion.div>
                    )}
                </div>

                {/* Support Footer */}
                <div className="text-center text-xs text-white/20 pt-10 border-t border-white/5 uppercase tracking-widest flex items-center justify-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[var(--brand-primary)]" />
                    <span>Desenvolvido e Certificado por HR-Tecnologias • Apoio Técnico: 923 658 211</span>
                </div>
            </div>
        </DashboardLayout>
    );
}
