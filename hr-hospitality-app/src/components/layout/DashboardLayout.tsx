/* eslint-disable */
'use client';

import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_TENANT } from '@/config/tenants';
import { Ban, ShieldAlert } from 'lucide-react';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [viewport, setViewport] = useState<'MOBILE' | 'TABLET' | 'DESKTOP'>('DESKTOP');
    const [mounted, setMounted] = useState(false);
    const { user, checkAccess } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 768) setViewport('MOBILE');
            else if (width < 1280) setViewport('TABLET');
            else setViewport('DESKTOP');
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        // Inject branding css variables
        document.documentElement.style.setProperty('--brand-primary', DEFAULT_TENANT.colors.primary);
        document.documentElement.style.setProperty('--brand-secondary', DEFAULT_TENANT.colors.secondary);
        document.documentElement.style.setProperty('--brand-accent', DEFAULT_TENANT.colors.accent);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Session and permission guards
    useEffect(() => {
        if (mounted) {
            if (!user && pathname !== '/login' && pathname !== '/cadastro') {
                router.push('/login');
            }
        }
    }, [user, pathname, mounted, router]);

    if (!mounted) {
        return null;
    }

    // Auth screen check: If loading login/cadastro, bypass layout wrap
    const isAuthPage = pathname === '/login' || pathname === '/cadastro';
    if (isAuthPage) {
        return <>{children}</>;
    }

    // Redirect or block if user is logged in but doesn't have access to this route
    const hasAccess = checkAccess(pathname);

    return (
        <div className="min-h-screen bg-[#111827] text-white overflow-hidden relative font-sans">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 -left-64 w-[600px] h-[600px] bg-cyber-cyan/5 blur-[128px] rounded-full opacity-30" />
                <div className="absolute bottom-0 -right-64 w-[600px] h-[600px] bg-cyber-purple/5 blur-[128px] rounded-full opacity-20" />
            </div>

            {/* Sidebar - Desktop & Tablet */}
            {viewport !== 'MOBILE' && user && (
                <div className={`fixed inset-y-0 left-0 z-[100] transition-all duration-500 ease-in-out`}>
                    <Sidebar isCompact={viewport === 'TABLET'} />
                </div>
            )}

            {/* Main Content */}
            <main className={`transition-all duration-500 h-screen overflow-y-auto no-scrollbar ${
                viewport === 'DESKTOP' ? 'pl-80' : viewport === 'TABLET' ? 'pl-24' : 'pl-0 pb-32'
            }`}>
                <div className="p-6 md:p-10 lg:p-16 max-w-[1920px] mx-auto min-h-full flex flex-col">
                    <div className="flex-1">
                        {hasAccess ? (
                            children
                        ) : (
                            /* High-fidelity futuristic security blocking page */
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 glass-panel rounded-[50px] border border-red-500/20 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
                                <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full mb-6">
                                    <Ban className="w-12 h-12" />
                                </div>
                                <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Módulo Bloqueado</h2>
                                <p className="text-white/40 max-w-md uppercase tracking-widest text-[10px] font-black leading-relaxed">
                                    O seu nível de acesso atual ({user?.role}) possui restrições ativas para esta secção do sistema. Contacte o administrador para obter autorização.
                                </p>
                                <button
                                    onClick={() => router.push('/')}
                                    className="mt-8 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    Voltar ao Dashboard
                                </button>
                            </motion.div>
                        )}
                    </div>

                    {/* Official Signature */}
                    <div className="mt-20 pt-12 border-t border-white/5 flex flex-col items-center gap-4 text-center opacity-60 group hover:opacity-100 transition-opacity duration-700">
                        <div className="flex items-center gap-3">
                            <div className="w-1 h-3 bg-cyber-cyan rounded-full" />
                            <p className="text-[10px] font-sans font-medium tracking-widest text-white/80 uppercase">Powered by HR-TECNOLOGIA | CEO Hermenegildo Ricardo</p>
                            <div className="w-1 h-3 bg-cyber-yellow rounded-full" />
                        </div>
                        <div className="flex flex-col items-center mt-2 gap-1">
                            <p className="text-[9px] font-sans font-medium text-white/50 uppercase tracking-[0.2em]">Cliente: Hotel Lukweku</p>
                            <p className="text-[9px] font-sans font-medium text-white/40 uppercase tracking-[0.2em]">NIF: 5484045614 | Avenida 21 de Janeiro, Benfica, Luanda</p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Bar - Mobile Only */}
            <AnimatePresence>
                {viewport === 'MOBILE' && user && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20 }}
                    >
                        <BottomBar />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
