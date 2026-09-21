/* eslint-disable */
'use client';

/**
 * HR-HOSPITALITY — Contexto de Autenticação
 *
 * SEGURANÇA (correção de vulnerabilidade):
 *  - Nenhuma palavra-passe é armazenada em texto simples.
 *  - As credenciais são protegidas com PBKDF2-SHA256 (Web Crypto API),
 *    150.000 iterações e salt aleatório de 16 bytes por utilizador.
 *  - A sessão ativa (localStorage) nunca contém hashes nem palavras-passe.
 *  - Utilizadores legados (com `password` em texto simples) são migrados
 *    automaticamente para o formato com hash no arranque.
 *
 * NOTA: `INITIAL_CREDENTIALS` existe apenas para semear contas de demonstração
 * na primeira execução. Após a migração, só os hashes ficam guardados.
 * Recomenda-se alterar estas palavras-passe no primeiro login.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Criptografia (PBKDF2-SHA256 via Web Crypto)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 150_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const toBase64 = (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

const fromBase64 = (b64: string): Uint8Array => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
    const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : undefined;
    if (!subtle) {
        throw new Error('Web Crypto (crypto.subtle) indisponível. O login exige um contexto seguro (localhost/HTTPS/Electron).');
    }

    const salt = saltB64
        ? fromBase64(saltB64)
        : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    const encoder = new TextEncoder();
    const keyMaterial = await subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const bits = await subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        HASH_BYTES * 8
    );

    return { hash: toBase64(bits), salt: toBase64(salt) };
}

async function verifyPassword(password: string, expectedHash: string, expectedSalt: string): Promise<boolean> {
    try {
        const { hash } = await hashPassword(password, expectedSalt);
        // Comparação em tempo constante para evitar timing attacks
        if (hash.length !== expectedHash.length) return false;
        let diff = 0;
        for (let i = 0; i < hash.length; i++) {
            diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
        }
        return diff === 0;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Modelo de Utilizador
// ---------------------------------------------------------------------------

export interface User {
    id: string;
    name: string;
    role: 'ADMINISTRATOR' | 'PERMISSAO' | 'ACESSO';
    /** Hash PBKDF2-SHA256 da palavra-passe (nunca texto simples). */
    passwordHash?: string;
    /** Salt aleatório (Base64) associado ao hash. */
    passwordSalt?: string;
    commissionRate: number;
    restrictions: string[]; // List of paths or modules blocked (e.g. ['/spa', '/logistica'])
    allowedModules: string[]; // For ACESSO role, e.g. ['pos', 'lavandaria']
    status: 'ATIVO' | 'BLOQUEADO';
    /** true = credencial conhecida/padrão; o login redireciona para alteração obrigatória. */
    mustChangePassword?: boolean;
}

/** Input aceite ao criar/editar utilizadores: pode incluir texto simples, que é convertido em hash. */
export type UserInput = Omit<User, 'passwordHash' | 'passwordSalt'> & { password?: string };

interface AuthContextType {
    user: User | null;
    users: User[];
    login: (idOrName: string, password?: string) => Promise<boolean>;
    logout: () => void;
    registerUser: (newUser: UserInput) => void;
    updateUser: (updatedUser: UserInput) => void;
    deleteUser: (id: string) => void;
    checkAccess: (path: string) => boolean;
    /** Altera a palavra-passe do utilizador em sessão (exige a atual). */
    changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Contas de demonstração (apenas semeiam hashes na 1.ª execução)
// ---------------------------------------------------------------------------

const DEFAULT_USERS: User[] = [
    {
        id: 'EMP-2026-001',
        name: 'Ricardo Ferreira',
        role: 'ADMINISTRATOR',
        commissionRate: 0.05,
        restrictions: [],
        allowedModules: ['*'],
        status: 'ATIVO'
    },
    {
        id: 'EMP-2026-002',
        name: 'Ana Sousa',
        role: 'PERMISSAO',
        commissionRate: 0.03,
        restrictions: ['/spa'], // Example restriction
        allowedModules: ['*'],
        status: 'ATIVO'
    },
    {
        id: 'EMP-2026-003',
        name: 'João Silva',
        role: 'ACESSO',
        commissionRate: 0.02,
        restrictions: [],
        allowedModules: ['pos', 'lavandaria', 'snack-bar'], // POS, Laundry and Snack Bar
        status: 'ATIVO'
    },
    {
        id: 'EMP-2026-004',
        name: 'Operador Snack Bar',
        role: 'ACESSO',
        commissionRate: 0.02,
        restrictions: [],
        allowedModules: ['snack-bar', 'ajuda'], // Snack Bar and Central de Ajuda
        status: 'ATIVO'
    }
];

/** Credenciais iniciais de demonstração — usadas UMA VEZ para gerar hashes. */
const INITIAL_CREDENTIALS: Record<string, string> = {
    'EMP-2026-001': 'admin',
    'EMP-2026-002': 'user123',
    'EMP-2026-003': 'staff',
    'EMP-2026-004': 'snack',
};

const DEFAULT_PASSWORD = '123456';

// ---------------------------------------------------------------------------
// Migração de utilizadores legados (texto simples -> hash)
// ---------------------------------------------------------------------------

async function migrateUsers(rawList: any[]): Promise<User[]> {
    const migrated: User[] = [];
    for (const u of rawList) {
        const user: User & { password?: string } = { ...u };

        const hadLegacyPlaintext = Boolean(user.password && typeof user.password === 'string' && !user.passwordHash);

        if (hadLegacyPlaintext) {
            // Legado: hash do texto simples existente e remoção do campo
            const { hash, salt } = await hashPassword(user.password as string);
            user.passwordHash = hash;
            user.passwordSalt = salt;
            delete user.password;
        } else if (!user.passwordHash) {
            // Conta nova de demonstração sem credencial: semear hash inicial temporário
            const initial = INITIAL_CREDENTIALS[user.id] ?? DEFAULT_PASSWORD;
            const { hash, salt } = await hashPassword(initial);
            user.passwordHash = hash;
            user.passwordSalt = salt;
        } else {
            delete user.password;
        }

        // SEGURANÇA: contas com credencial padrão/conhecida (seed) ou migradas de
        // texto simples exigem alteração de palavra-passe no primeiro login.
        if (user.mustChangePassword === undefined) {
            user.mustChangePassword = hadLegacyPlaintext
                || INITIAL_CREDENTIALS[user.id] !== undefined;
        }

        delete user.password; // Garantia: nunca persistir texto simples
        migrated.push(user as User);
    }
    return migrated;
}

/** Remove material de credenciais antes de guardar em sessão. */
function toPublicUser(user: User): User {
    const { passwordHash: _h, passwordSalt: _s, ...publicUser } = user;
    return publicUser as User;
}

// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            // Load users from localStorage or default, then migrate to hashed format
            const savedUsers = localStorage.getItem('hr_users');
            let list: User[];
            if (savedUsers) {
                try {
                    list = await migrateUsers(JSON.parse(savedUsers));
                } catch {
                    list = await migrateUsers(DEFAULT_USERS);
                }
            } else {
                list = await migrateUsers(DEFAULT_USERS);
            }

            if (cancelled) return;
            localStorage.setItem('hr_users', JSON.stringify(list));
            setUsers(list);

            // Load active session (session nunca guarda hashes)
            const activeSession = localStorage.getItem('hr_active_user');
            if (activeSession) {
                try {
                    const sessionUser = JSON.parse(activeSession);
                    const current = list.find(u => u.id === sessionUser.id);
                    if (current) setUser(toPublicUser(current));
                    else localStorage.removeItem('hr_active_user');
                } catch {
                    localStorage.removeItem('hr_active_user');
                }
            }

            setMounted(true);
        })();

        return () => { cancelled = true; };
    }, []);

    const saveUsers = (updatedList: User[]) => {
        setUsers(updatedList);
        localStorage.setItem('hr_users', JSON.stringify(updatedList));
    };

    const login = async (idOrName: string, password?: string): Promise<boolean> => {
        const found = users.find(
            u => (u.id.toLowerCase() === idOrName.toLowerCase() || u.name.toLowerCase() === idOrName.toLowerCase())
        );

        if (!found) return false;

        if (found.status === 'BLOQUEADO') {
            alert('A sua conta está temporariamente bloqueada. Contacte o Administrador.');
            return false;
        }

        // Validação por hash PBKDF2 (sem comparação de texto simples)
        if (!found.passwordHash || !found.passwordSalt) {
            console.error('[HOSPITALITY/Auth] Utilizador sem credencial válida:', found.id);
            return false;
        }

        if (!password || !(await verifyPassword(password, found.passwordHash, found.passwordSalt))) {
            return false;
        }

        const publicUser = toPublicUser(found);
        setUser(publicUser);
        localStorage.setItem('hr_active_user', JSON.stringify(publicUser));
        return true;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('hr_active_user');
    };

    const registerUser = (newUser: UserInput) => {
        const exists = users.some(u => u.id === newUser.id || u.name.toLowerCase() === newUser.name.toLowerCase());
        if (exists) {
            alert('Utilizador já cadastrado com este ID ou Nome.');
            return;
        }

        (async () => {
            let passwordHash: string | undefined;
            let passwordSalt: string | undefined;
            if (newUser.password) {
                const creds = await hashPassword(newUser.password);
                passwordHash = creds.hash;
                passwordSalt = creds.salt;
            } else {
                // Sem palavra-passe indicada: aplicar padrão inicial
                const creds = await hashPassword(DEFAULT_PASSWORD);
                passwordHash = creds.hash;
                passwordSalt = creds.salt;
            }

            const { password: _p, ...rest } = newUser;
            const stored: User = { ...(rest as User), passwordHash, passwordSalt, mustChangePassword: false };
            saveUsers([...users, stored]);
        })();
    };

    const updateUser = (updatedUser: UserInput) => {
        (async () => {
            const existing = users.find(u => u.id === updatedUser.id);
            let passwordHash = existing?.passwordHash;
            let passwordSalt = existing?.passwordSalt;

            if (updatedUser.password) {
                // Nova palavra-passe em texto simples -> converter para hash
                const creds = await hashPassword(updatedUser.password);
                passwordHash = creds.hash;
                passwordSalt = creds.salt;
            }

            const { password: _p, ...rest } = updatedUser;
            const stored: User = {
                ...(rest as User),
                passwordHash,
                passwordSalt,
                // Nova palavra-passe definida pelo administrador limpa a exigência
                mustChangePassword: updatedUser.password ? false : (existing?.mustChangePassword ?? false),
            };
            const updated = users.map(u => (u.id === stored.id ? stored : u));
            saveUsers(updated);

            // If updated user is the current user, update session
            if (user && user.id === stored.id) {
                const publicUser = toPublicUser(stored);
                setUser(publicUser);
                localStorage.setItem('hr_active_user', JSON.stringify(publicUser));
            }
        })();
    };

    /** Alteração obrigatória/voluntária da palavra-passe do utilizador em sessão. */
    const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
        if (!user) return false;

        const stored = users.find(u => u.id === user.id);
        if (!stored?.passwordHash || !stored?.passwordSalt) {
            console.error('[HOSPITALITY/Auth] Utilizador sem credencial válida:', stored?.id);
            return false;
        }

        // Exigir a palavra-passe atual
        if (!(await verifyPassword(currentPassword, stored.passwordHash, stored.passwordSalt))) {
            return false;
        }

        // Política mínima: 8 caracteres
        if (!newPassword || newPassword.length < 8) {
            alert('A nova palavra-passe deve ter pelo menos 8 caracteres.');
            return false;
        }

        if (newPassword === currentPassword) {
            alert('A nova palavra-passe deve ser diferente da atual.');
            return false;
        }

        const { hash, salt } = await hashPassword(newPassword);
        const updated = users.map(u =>
            u.id === stored.id
                ? { ...u, passwordHash: hash, passwordSalt: salt, mustChangePassword: false }
                : u
        );
        saveUsers(updated);

        const updatedStored = updated.find(u => u.id === stored.id)!;
        const publicUser = toPublicUser(updatedStored);
        setUser(publicUser);
        localStorage.setItem('hr_active_user', JSON.stringify(publicUser));
        return true;
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
        <AuthContext.Provider value={{ user, users, login, logout, registerUser, updateUser, deleteUser, checkAccess, changeOwnPassword }}>
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
