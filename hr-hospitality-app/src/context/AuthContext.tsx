'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface User {
    id: string;
    name: string;
    role: string;
    commissionRate: number;
}

interface AuthContextType {
    user: User | null;
    login: (id: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>({
        id: 'EMP-2026-001',
        name: 'Ricardo Ferreira',
        role: 'Senior Administrator',
        commissionRate: 0.05
    });

    const login = (id: string) => {
        // Mock login logic
        setUser({
            id,
            name: 'Funcionário Demo',
            role: 'Staff',
            commissionRate: 0.03
        });
    };

    const logout = () => setUser(null);

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
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
