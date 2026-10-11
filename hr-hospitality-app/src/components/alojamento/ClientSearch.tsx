'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, User, ChevronDown, Loader2, Plus, UserPlus } from 'lucide-react';
import { localQuery } from '@/lib/db/localDB';

export interface ClientSearchResult {
    id: string;
    client_number: string;
    full_name: string;
    document_type: string;
    document_number: string;
    email: string | null;
    phone: string | null;
    kyc_completed: number;
    loyalty_tier: string;
    loyalty_points: number;
    total_visits: number;
    total_spent: number;
    total_stays: number;
    total_pos_spent: number;
    first_visit_date: string | null;
    last_visit_date: string | null;
}

interface ClientSearchProps {
    value: string;
    onChange: (value: string) => void;
    onSelect: (client: ClientSearchResult | null) => void;
    onCreateNew?: () => void;
    placeholder?: string;
    disabled?: boolean;
    label?: string;
    required?: boolean;
}

export function ClientSearch({
    value,
    onChange,
    onSelect,
    onCreateNew,
    placeholder = 'Digite nome ou nº cliente (ex: HR-2026-00001)...',
    disabled = false,
    label = 'Cliente',
    required = false,
}: ClientSearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<ClientSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Debounced search
    const searchClients = useCallback(async (query: string) => {
        if (!query.trim() || query.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const data = await localQuery<ClientSearchResult[] | { data: ClientSearchResult[] }>('clients.search', {
                query,
                limit: 15,
            });
            // localQuery already unwraps the envelope to the rows array in most cases,
            // but keep support for the { data: [...] } shape.
            const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
            setResults(rows);
            setHighlightedIndex(-1);
        } catch (err) {
            console.error('[ClientSearch] Erro ao buscar clientes:', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Trigger search when value changes (with debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isOpen && value.trim().length >= 2) {
                searchClients(value);
            } else {
                setResults([]);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [value, isOpen, searchClients]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setIsOpen(true);
                if (value.trim().length >= 2) searchClients(value);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(prev - 1, -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && results[highlightedIndex]) {
                    onSelect(results[highlightedIndex]);
                    setIsOpen(false);
                    onChange(results[highlightedIndex].full_name);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightedIndex(-1);
                break;
        }
    };

    const handleSelect = (client: ClientSearchResult) => {
        onSelect(client);
        setIsOpen(false);
        onChange(client.full_name);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        setIsOpen(true);
        if (e.target.value.trim().length >= 2) {
            searchClients(e.target.value);
        }
    };

    const handleFocus = () => {
        if (!disabled) {
            setIsOpen(true);
            if (value.trim().length >= 2) searchClients(value);
        }
    };

    const handleClear = () => {
        onChange('');
        onSelect(null);
        setResults([]);
    };

    const tierColors: Record<string, string> = {
        REGISTADO: 'bg-gray-500/20 text-gray-400',
        OCASIONAL: 'bg-emerald-500/20 text-emerald-400',
        FREQUENTE: 'bg-amber-500/20 text-amber-400',
        VIP: 'bg-violet-500/20 text-violet-400',
        RESIDENTE: 'bg-rose-500/20 text-rose-400',
    };

    const tierIcons: Record<string, string> = {
        REGISTADO: '○',
        OCASIONAL: '★',
        FREQUENTE: '◆',
        VIP: '✦',
        RESIDENTE: '■',
    };

    const renderClientRow = (client: ClientSearchResult, index: number) => {
        const isHighlighted = index === highlightedIndex;
        const tierColor = tierColors[client.loyalty_tier] || 'bg-gray-500/20 text-gray-400';
        const tierIcon = tierIcons[client.loyalty_tier] || '•';

        const docDisplay = client.document_number 
            ? `${client.document_type}: ${client.document_number}` 
            : '';
        
        const emailDisplay = client.email ? client.email : '';

        return (
            <li key={client.id}>
                <button
                    onClick={() => handleSelect(client)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                        isHighlighted
                            ? 'bg-cyber-purple/20 text-white'
                            : 'text-white/80 hover:bg-white/5'
                    }`}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-black text-sm truncate">{client.full_name}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${tierColor}`}>
                                {tierIcon} {client.loyalty_tier}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-white/40">
                            <span className="font-mono text-cyber-cyan">{client.client_number}</span>
                            {docDisplay && <span className="truncate max-w-[200px]">{docDisplay}</span>}
                            {client.email && <span className="truncate max-w-[150px]">{client.email}</span>}
                        </div>
                    </div>
                    <User className={`w-4 h-4 ${isHighlighted ? 'text-cyber-cyan' : 'text-white/20'}`} />
                </button>
            </li>
        );
    };

    return (
        <div className="relative w-full">
            <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-2 flex items-center justify-between">
                {label}
                {required && <span className="text-red-400 ml-1">*</span>}
            </label>

            <div className="relative">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-cyber-cyan transition-colors" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-4 pr-14 text-white font-black text-sm uppercase tracking-widest focus:border-cyber-cyan focus:outline-none transition-all placeholder:text-white/10"
                    />
                    {value && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white transition-colors"
                            aria-label="Limpar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    {loading && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyber-cyan animate-spin" />
                    )}
                    {!loading && !value && (
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    )}
                </div>

                {/* Dropdown Results */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.98 }}
                            className="absolute z-50 w-full mt-1 bg-[#111827] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden max-h-[300px]"
                        >
                            {results.length === 0 && !loading && value.trim().length >= 2 ? (
                                <div className="p-6 text-center">
                                    <p className="text-white/40 text-sm mb-4">Nenhum cliente encontrado</p>
                                    {onCreateNew && (
                                        <button
                                            onClick={onCreateNew}
                                            className="flex items-center gap-2 px-4 py-2 bg-cyber-purple text-black font-black text-sm uppercase tracking-wider rounded-xl hover:scale-105 transition-all"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Cadastrar Novo Cliente
                                        </button>
                                    )}
                                </div>
                            ) : results.length === 0 && !loading ? (
                                <div className="p-4 text-center text-white/30 text-sm">
                                    Digite pelo menos 2 caracteres para buscar...
                                </div>
                            ) : (
                                <ul className="max-h-[280px] overflow-y-auto">
                                    {results.map((client, index) => renderClientRow(client, index))}
                                </ul>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Create New Button (if provided) */}
                {onCreateNew && (
                    <button
                        type="button"
                        onClick={onCreateNew}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/50 font-black text-[10px] uppercase tracking-wider hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Cadastrar Novo Cliente
                    </button>
                )}
            </div>
        </div>
    );
}