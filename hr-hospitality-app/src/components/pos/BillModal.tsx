'use client';

import { Table, Guest } from '@/types';
import { useState } from 'react';
import { CreditCard, Home, X } from 'lucide-react';

interface BillModalProps {
    table: Table;
    onClose: () => void;
}

// Mock de hóspedes ativos para simular validação
const mockActiveGuests: Guest[] = [
    { id: 'g1', fullName: 'Ricardo Ferreira', documentId: '12345678', email: 'r@example.com', status: 'ACTIVE', roomId: '102' }
];

export function BillModal({ table, onClose }: BillModalProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentType, setPaymentType] = useState<'IMMEDIATE' | 'ROOM' | null>(null);
    const [selectedGuestId, setSelectedGuestId] = useState('');

    const handleCloseBill = () => {
        if (!paymentType) return;

        if (paymentType === 'ROOM' && !selectedGuestId) {
            alert('Selecione um hóspede ativo para lançar a conta no quarto.');
            return;
        }

        setIsProcessing(true);
        // Simular lógica de backend
        setTimeout(() => {
            alert(`Conta da Mesa ${table.number} fechada com sucesso! Tipo: ${paymentType}`);
            setIsProcessing(false);
            onClose();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-all animate-in fade-in zoom-in duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">Fechar Conta - Mesa {table.number}</h3>
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-1">Total acumulado: {table.currentBill?.toFixed(2)}Kz</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 shadow-sm">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setPaymentType('IMMEDIATE')}
                            className={`p-4 rounded-2xl border-2 flex flex-col items-center space-y-3 transition-all ${paymentType === 'IMMEDIATE' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'
                                }`}
                        >
                            <CreditCard className="w-7 h-7" />
                            <span className="font-bold text-xs uppercase tracking-wider">Pagamento Imediato</span>
                        </button>

                        <button
                            onClick={() => setPaymentType('ROOM')}
                            className={`p-4 rounded-2xl border-2 flex flex-col items-center space-y-3 transition-all ${paymentType === 'ROOM' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'
                                }`}
                        >
                            <Home className="w-7 h-7" />
                            <span className="font-bold text-xs uppercase tracking-wider">Lançar no Quarto</span>
                        </button>
                    </div>

                    {paymentType === 'ROOM' && (
                        <div className="space-y-2 animate-in slide-in-from-top duration-300">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Vincular a Hóspede Ativo</label>
                            <select
                                value={selectedGuestId}
                                onChange={(e) => setSelectedGuestId(e.target.value)}
                                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium outline-none focus:border-blue-400 transition-colors"
                            >
                                <option value="">Selecione o Hóspede...</option>
                                {mockActiveGuests.map(guest => (
                                    <option key={guest.id} value={guest.id}>{guest.fullName} (Quarto {guest.roomId})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        disabled={!paymentType || isProcessing}
                        onClick={handleCloseBill}
                        className={`w-full py-3 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-xl shadow-blue-200 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${paymentType === 'IMMEDIATE' ? 'bg-green-600 text-white shadow-green-200' : 'bg-blue-600 text-white'
                            }`}
                    >
                        {isProcessing ? 'A processar...' : 'Confirmar Fecho'}
                    </button>
                </div>
            </div>
        </div>
    );
}
