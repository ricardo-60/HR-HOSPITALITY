'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { User, Car, CreditCard, CheckCircle2, Shield, Dumbbell, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Checkin360Props {
    roomId?: string;
    onComplete: () => void;
}

export function Checkin360({ roomId, onComplete }: Checkin360Props) {
    const [step, setStep] = useState(1);
    const [isScanning, setIsScanning] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedRoomId, setSelectedRoomId] = useState(roomId || '');
    const [availableRooms, setAvailableRooms] = useState<{ id: string; type: string; status: string }[]>([]);

    useEffect(() => {
        if (roomId) {
            setSelectedRoomId(roomId);
        }
    }, [roomId]);

    useEffect(() => {
        const fetchAvailableRooms = async () => {
            try {
                const { data, error } = await supabase
                    .from('hospitality_rooms')
                    .select('id, type, status')
                    .eq('status', 'FREE')
                    .order('id', { ascending: true });
                if (!error && data) {
                    setAvailableRooms(data);
                }
            } catch (err) {
                console.error("Falha ao buscar quartos livres:", err);
            }
        };
        if (!roomId) {
            fetchAvailableRooms();
        }

        const channel = supabase
            .channel('public:hospitality_rooms')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitality_rooms' }, () => {
                if (!roomId) fetchAvailableRooms();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);


    // Form State
    const [formData, setFormData] = useState({
        name: '',
        document: '',
        nationality: 'Portugal',
        plate: '',
        gymAccess: false,
        creditLimit: 500
    });

    const handleFinalize = async () => {
        if (!selectedRoomId) {
            setErrorMessage("Por favor, selecione um quarto!");
            return;
        }
        setIsScanning(true);
        setErrorMessage(null);
        try {
            // 1. Criar a reserva confirmada no Supabase
            const { error: resError } = await supabase
                .from('hospitality_reservations')
                .insert([
                    {
                        guest_name: formData.name + " (Doc: " + formData.document + ")",
                        room_id: selectedRoomId,
                        status: 'CONFIRMADA',
                        reservation_type: 'ROOM',
                        tenant_id: '9cbf70f5-cbad-42ff-b52f-b1f2c1cfcc87', // UUID do Tenant Hotel Lukweku
                        check_in_date: new Date().toISOString()
                    }
                ]);

            if (resError) throw resError;

            // 2. Atualizar o estado do quarto para OCCUPIED no Supabase
            const { error: roomError } = await supabase
                .from('hospitality_rooms')
                .update({ status: 'OCCUPIED' })
                .eq('id', selectedRoomId);

            if (roomError) throw roomError;

            setIsScanning(false);
            setIsSuccess(true);
            setTimeout(() => {
                onComplete();
            }, 3000);
        } catch (err) {
            console.error("Erro ao salvar check-in:", err);
            setErrorMessage("Erro ao finalizar check-in: " + (err as any).message);
            setIsScanning(false);
        }
    };

    const sections = [
        {
            id: 1,
            title: 'DADOS PESSOAIS',
            icon: User,
            content: (
                <div className="space-y-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Nome Completo</label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="EX: RICARDO FERREIRA"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-sm uppercase tracking-widest focus:border-cyber-cyan outline-none transition-all placeholder:text-white/10"
                            />
                            <User className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-cyber-cyan transition-colors" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Documento ID</label>
                            <input
                                type="text"
                                value={formData.document}
                                onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                                placeholder="00000000"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-sm uppercase tracking-widest focus:border-cyber-cyan outline-none transition-all placeholder:text-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">País</label>
                            <select
                                value={formData.nationality}
                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-sm uppercase tracking-widest focus:border-cyber-cyan outline-none transition-all"
                            >
                                <option className="bg-[#111827]">Portugal</option>
                                <option className="bg-[#111827]">Angola</option>
                                <option className="bg-[#111827]">Brasil</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Quarto Designado</label>
                        {roomId ? (
                            <input
                                type="text"
                                value={selectedRoomId}
                                readOnly
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white/50 font-black text-sm uppercase tracking-widest outline-none cursor-not-allowed"
                            />
                        ) : (
                            <select
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-sm uppercase tracking-widest focus:border-cyber-cyan outline-none transition-all cursor-pointer"
                            >
                                <option value="" disabled>Selecionar Quarto...</option>
                                {availableRooms.map(r => (
                                    <option key={r.id} value={r.id} className="bg-[#111827]">
                                        Quarto {r.id} ({r.type})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            )
        },
        {
            id: 2,
            title: 'VÍNCULO FACILITIES',
            icon: Car,
            content: (
                <div className="space-y-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Matrícula (Radar Parque)</label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={formData.plate}
                                onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                                placeholder="XX-00-XX"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-sm uppercase tracking-[0.4em] focus:border-cyber-cyan outline-none transition-all placeholder:text-white/10"
                            />
                            <Car className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-cyber-cyan transition-colors" />
                        </div>
                    </div>
                    <div className="p-8 bg-white/5 border border-white/5 rounded-3xl flex justify-between items-center group hover:border-[#00FFFF]/20 transition-all">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-xl border border-white/5 ${formData.gymAccess ? 'bg-[#00FFFF]/10 border-[#00FFFF]/30' : 'bg-white/5'}`}>
                                <Dumbbell className={`w-5 h-5 ${formData.gymAccess ? 'text-[#00FFFF]' : 'text-white/20'}`} />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest">Acesso Ginásio</h4>
                                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">Biometria Ativa</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setFormData({ ...formData, gymAccess: !formData.gymAccess })}
                            className={`w-14 h-8 rounded-full relative transition-all duration-500 ${formData.gymAccess ? 'bg-[#00FFFF]' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-black transition-all duration-500 ${formData.gymAccess ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </div>
            )
        },
        {
            id: 3,
            title: 'GARANTIA PAGAMENTO',
            icon: CreditCard,
            content: (
                <div className="space-y-8">
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Limite Crédito Interno</label>
                            <span className="text-2xl font-black text-white tracking-tighter tabular-nums">{formData.creditLimit}Kz</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="2000"
                            step="50"
                            value={formData.creditLimit}
                            onChange={(e) => setFormData({ ...formData, creditLimit: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyber-cyan"
                        />
                        <div className="flex justify-between text-[8px] font-black text-white/10 uppercase tracking-widest">
                            <span>0Kz</span>
                            <span>1000Kz</span>
                            <span>2000Kz</span>
                        </div>
                    </div>
                    <div className="p-6 bg-[#00FFFF]/5 border border-[#00FFFF]/20 rounded-2xl flex items-center gap-4 animate-pulse">
                        <Zap className="w-5 h-5 text-[#00FFFF]" />
                        <p className="text-[9px] font-black text-[#00FFFF] uppercase tracking-widest leading-relaxed">
                            Auto-Desbloqueio: Snack Bar, Restaurante e Serviço de Quarto.
                        </p>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="relative w-full max-w-[1400px] mx-auto">
            {/* Success Overlay */}
            <AnimatePresence>
                {isSuccess && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center text-center p-8 backdrop-blur-3xl"
                    >
                        <motion.div
                            initial={{ scale: 0.5, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="w-32 h-32 rounded-full border-4 border-cyber-cyan flex items-center justify-center mb-12 shadow-[0_0_50px_rgba(0,255,255,0.4)]"
                        >
                            <CheckCircle2 className="w-16 h-16 text-cyber-cyan" />
                        </motion.div>
                        <h2 className="text-6xl font-black text-white uppercase tracking-tighter mb-4">CHECK-IN CONCLUÍDO</h2>
                        <p className="text-cyber-cyan font-black uppercase tracking-[0.8em] text-sm neon-glow-cyan">Hóspede Ativo - Todos os serviços desbloqueados</p>

                        <div className="mt-20 flex gap-12">
                            <div className="text-center">
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">QUARTO</p>
                                <p className="text-4xl font-black text-white tracking-widest">{selectedRoomId}</p>
                            </div>
                            <div className="w-[1px] h-16 bg-white/10" />
                            <div className="text-center">
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">FACILITIES</p>
                                <p className="text-4xl font-black text-white tracking-widest">ACTIVE</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Form Body */}
            <div className="glass-panel rounded-[50px] p-8 md:p-16 relative overflow-hidden">
                {/* Visual Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16 border-b border-white/5 pb-12">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-1.5 h-8 bg-cyber-purple shadow-[0_0_15px_#A78BFA]" />
                            <h3 className="text-4xl font-black text-white tracking-tighter uppercase">CHECK-IN <span className="text-cyber-purple">360</span></h3>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] ml-6">Secure Smart Boarding • Unit {selectedRoomId || 'Nenhum'}</p>
                    </div>
                    <div className="hidden md:flex gap-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`h-1.5 w-12 rounded-full transition-all duration-500 ${step >= i ? 'bg-cyber-purple shadow-[0_0_10px_#A78BFA]' : 'bg-white/10'}`} />
                        ))}
                    </div>
                </div>

                {/* Grid vs Steps Logic */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
                    {/* Scanner Line Overlay */}
                    {isScanning && (
                        <div className="absolute inset-x-0 -inset-y-12 z-50 pointer-events-none">
                            <div className="w-full h-1 bg-cyber-cyan shadow-[0_0_20px_#00FFFF] animate-scan-fast opacity-50" />
                        </div>
                    )}

                    {errorMessage && (
                        <div className="col-span-full p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-all">
                            <span>{errorMessage}</span>
                            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-sm font-bold">&times;</button>
                        </div>
                    )}

                    {sections.map((section) => (
                        <motion.div
                            key={section.id}
                            initial={{ opacity: 1 }}
                            className={`space-y-10 lg:block ${step === section.id ? 'block' : 'hidden'}`}
                        >
                            <div className="flex items-center gap-4 pb-6 border-b border-white/5">
                                <section.icon className="w-5 h-5 text-white/20" />
                                <h4 className="text-[11px] font-black text-white/40 uppercase tracking-[0.4em]">{section.title}</h4>
                            </div>
                            <div className="relative">
                                {section.content}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Footer Controls */}
                <div className="mt-20 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-cyber-purple" />
                        </div>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] max-w-[200px] leading-relaxed">
                            Criptografia de ponta-a-ponta • Protocolo de Privacidade 2026.
                        </p>
                    </div>

                    <div className="flex items-center gap-6 w-full md:w-auto">
                        {/* Mobile Stepper Controls */}
                        <div className="flex lg:hidden gap-4 w-full">
                            {step > 1 && (
                                <button
                                    onClick={() => setStep(step - 1)}
                                    className="flex-1 py-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center"
                                >
                                    <ArrowLeft className="w-5 h-5 text-white" />
                                </button>
                            )}
                            {step < 3 ? (
                                <button
                                    onClick={() => setStep(step + 1)}
                                    className="flex-[2] py-3 bg-cyber-purple text-black font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3"
                                >
                                    Próximo <ArrowRight className="w-5 h-5" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleFinalize}
                                    className="flex-[2] py-3 bg-gradient-to-r from-cyber-cyan to-cyber-purple text-black font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.3)] animate-pulse"
                                >
                                    CONCLUÍDO
                                </button>
                            )}
                        </div>

                        {/* Desktop Finish Button (Only on step 3 or visible always if grid) */}
                        <div className="hidden lg:block">
                            <button
                                onClick={handleFinalize}
                                disabled={isScanning}
                                className={`px-10 py-3.5 bg-gradient-to-r from-cyber-cyan to-cyber-purple text-black font-black text-sm uppercase tracking-[0.4em] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:scale-105 transition-all flex items-center gap-4 ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isScanning ? 'A PROCESSAR...' : 'CONCLUÍDO'}
                                <CheckCircle2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
