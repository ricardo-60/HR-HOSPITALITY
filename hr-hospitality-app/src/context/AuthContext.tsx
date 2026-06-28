/* eslint-disable */
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
    id: string;
    name: string;
    role: 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO';
    password?: string;
    commissionRate: number;
    restrictions: string[]; // List of paths or modules blocked (e.g. ['/spa', '/logistica'])
    allowedModules: string[]; // For ACESSO role, e.g. ['pos', 'lavandaria']
    status: 'ATIVO' | 'BLOQUEADO';
}

interface AuthContextType {
    user: User | null;
    users: User[];
    login: (idOrName: string, password?: string) => Promise<boolean>;
    logout: () => void;
    registerUser: (newUser: User) => void;
    updateUser: (updatedUser: User) => void;
    deleteUser: (id: string) => void;
    checkAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USERS: User[] = [
    {
        id: 'EMP-2026-001',
        name: 'Ricardo Ferreira',
        role: 'ADMINISTRATOR',
        password: 'admin',
        commissionRate: 0.05,
        restrictions: [],
        allowedModules: ['*'],
        status: 'ATIVO'
    },
    {
        id: 'EMP-2026-002',
        name: 'Ana Sousa',
        role: 'PERMISSAO',
        password: 'user123',
        commissionRate: 0.03,
        restrictions: ['/spa'], // Example restriction
        allowedModules: ['*'],
        status: 'ATIVO'
    },
    {
        id: 'EMP-2026-003',
        name: 'João Silva',
        role: 'ACESSO',
        password: 'staff',
        commissionRate: 0.02,
        restrictions: [],
        allowedModules: ['pos', 'lavandaria'], // Only POS and Laundry
        status: 'ATIVO'
    }
];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load users from localStorage or default
        const savedUsers = localStorage.getItem('hr_users');
        if (savedUsers) {
            setUsers(JSON.parse(savedUsers));
        } else {
            localStorage.setItem('hr_users', JSON.stringify(DEFAULT_USERS));
            setUsers(DEFAULT_USERS);
        }

        // Load active session
        const activeSession = localStorage.getItem('hr_active_user');
        if (activeSession) {
            setUser(JSON.parse(activeSession));
        }

        setMounted(true);
    }, []);

    const saveUsers = (updatedList: User[]) => {
        setUsers(updatedList);
        localStorage.setItem('hr_users', JSON.stringify(updatedList));
    };

    const login = async (idOrName: string, password?: string): Promise<boolean> => {
        const found = users.find(
            u => (u.id.toLowerCase() === idOrName.toLowerCase() || u.name.toLowerCase() === idOrName.toLowerCase())
        );

        if (found) {
            if (found.status === 'BLOQUEADO') {
                alert('A sua conta está temporariamente bloqueada. Contacte o Administrador.');
                return false;
            }
            // Simple mock password validation
            if (password && found.password && found.password !== password) {
                return false;
            }
            setUser(found);
            localStorage.setItem('hr_active_user', JSON.stringify(found));
            return true;
        }
        return false;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('hr_active_user');
    };

    const registerUser = (newUser: User) => {
        const exists = users.some(u => u.id === newUser.id || u.name.toLowerCase() === newUser.name.toLowerCase());
        if (exists) {
            alert('Utilizador já cadastrado com este ID ou Nome.');
            return;
        }
        const updated = [...users, newUser];
        saveUsers(updated);
    };

    const updateUser = (updatedUser: User) => {
        const updated = users.map(u => (u.id === updatedUser.id ? updatedUser : u));
        saveUsers(updated);

        // If updated user is the current user, update session
        if (user && user.id === updatedUser.id) {
            setUser(updatedUser);
            localStorage.setItem('hr_active_user', JSON.stringify(updatedUser));
        }
    };

    const deleteUser = (id: string) => {
        if (user && user.id === id) {
            alert('Não é possível apagar o seu próprio utilizador em sessão.');
            return;
        }
        const updated = users.filter(u => u.id !== id);
        saveUsers(updated);
    };

    const checkAccess = (path: string): boolean => {
        if (!user) return false;
        if (user.role === 'ADMINISTRATOR') return true;

        // Clean query parameters or trailing slashes
        const cleanPath = path.split('?')[0].replace(/\/$/, '');

        // 1. Check direct path restrictions
        if (user.restrictions.some(r => cleanPath.startsWith(r.replace(/\/$/, '')))) {
            return false;
        }

        // 2. Check allowedModules for ACESSO role
        if (user.role === 'ACESSO') {
            const moduleName = cleanPath.substring(1); // e.g. '/pos' -> 'pos'
            if (moduleName && !user.allowedModules.includes(moduleName)) {
                return false;
            }
        }

        return true;
    };

    if (!mounted) {
        return null;
    }

    return (
        <AuthContext.Provider value={{ user, users, login, logout, registerUser, updateUser, deleteUser, checkAccess }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
