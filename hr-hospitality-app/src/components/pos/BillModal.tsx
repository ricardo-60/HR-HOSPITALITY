'use client';

import { Table, Guest } from '@/types';
import { useState, useEffect } from 'react';
import { CreditCard, Home, X } from 'lucide-react';
import { localQuery, localExecute } from '@/lib/db/localDB';

interface BillModalProps {
    table: Table;
    onClose: () => void;
    onBillClosed?: (tableId: string) => void;
}

export function BillModal({ table, onClose, onBillClosed }: BillModalProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'warn'; text: string } | null>(null);
    const [paymentType, setPaymentType] = useState<'IMMEDIATE' | 'ROOM' | null>(null);
    const [selectedGuestId, setSelectedGuestId] = useState('');
    const [activeGuests, setActiveGuests] = useState<Guest[]>([]);

    useEffect(() => {
        async function fetchGuests() {
            try {
                // Selecionar reservas checked_in ou confirmadas
                const rows = await localQuery(`
                    SELECT id, guest_name as fullName, room_number as roomId, email 
                    FROM hotel_reservations 
                    WHERE status IN ('CHECKED_IN', 'CONFIRMADA')
                `);
                
                if (rows && rows.length > 0) {
                    // Converter para o tipo Guest
                    const formatted: Guest[] = rows.map((r: any) => ({
                        id: r.id,
                        fullName: r.fullName,
                        documentId: 'NIF-' + r.id.substring(0, 5),
                        email: r.email,
                        status: 'ACTIVE',
                        roomId: r.roomId
                    }));
                    setActiveGuests(formatted);
                } else {
                    // Fallback de demonstração caso o banco de dados local esteja sem hóspedes
                    setActiveGuests([
                        { id: 'res-demo-2', fullName: 'Maria da Conceição', documentId: '54321098', email: 'm.conceicao@email.com', status: 'ACTIVE', roomId: '202' },
                        { id: 'res-demo-4', fullName: 'Ana Paula Silva', documentId: '98765432', email: 'ana.silva@gmail.com', status: 'ACTIVE', roomId: '104' },
                        { id: 'res-demo-1', fullName: 'Hermenegildo Ricardo', documentId: '12345678', email: 'h.ricardo@email.com', status: 'ACTIVE', roomId: '101' }
                    ]);
                }
            } catch (err) {
                console.error('[HOSPITALITY/BillModal] Falha ao ler hóspedes ativos:', err);
                // Fallback de segurança
                setActiveGuests([
                    { id: 'res-demo-2', fullName: 'Maria da Conceição', documentId: '54321098', email: 'm.conceicao@email.com', status: 'ACTIVE', roomId: '202' }
                ]);
            }
        }

        fetchGuests();
    }, []);

    const handleCloseBill = async () => {
        if (!paymentType) return;

        if (paymentType === 'ROOM' && !selectedGuestId) {
            setNotice({ tone: 'error', text: 'Selecione um hóspede ativo para lançar a conta no quarto.' });
            return;
        }

        setNotice(null);
        setIsProcessing(true);

        try {
            if (paymentType === 'ROOM') {
                // Lançar no consumo do banco local SQLite de verdade!
                const description = `Consumo Restaurante/Snack-Bar - Mesa ${table.number}`;
                const billAmount = table.currentBill || 0;

                await localExecute(`
                    INSERT INTO hotel_consumptions (
                        id, tenant_id, reservation_id, description, quantity, unit_price, total_price, category, registered_at
                    ) VALUES (
                        lower(hex(randomblob(16))),
                        '11111111-1111-1111-1111-111111111111',
                        ?,
                        ?,
                        1,
                        ?,
                        ?,
                        'restaurante',
                        datetime('now')
                    )
                `, [selectedGuestId, description, billAmount, billAmount]);

                setNotice({ tone: 'success', text: `Conta de ${billAmount.toFixed(2)}Kz lançada com sucesso no Quarto do hóspede!` });
            } else {
                setNotice({ tone: 'success', text: `Conta da Mesa ${table.number} fechada com sucesso via Pagamento Imediato!` });
            }

            // Notificar o pai que a mesa foi liberada (após o utilizador ver o aviso inline)
            setTimeout(() => {
                if (onBillClosed) {
                    onBillClosed(table.id);
                }
                onClose();
            }, 1200);
        } catch (err: any) {
            console.error('[HOSPITALITY/BillModal] Falha ao processar fecho de conta:', err);
            setNotice({ tone: 'warn', text: 'Aviso: Banco de Dados offline. A fechar a conta em Modo Demo.' });
            setTimeout(() => {
                if (onBillClosed) {
                    onBillClosed(table.id);
                }
                onClose();
            }, 1600);
        } finally {
            setIsProcessing(false);
        }
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
                                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium outline-none focus:border-blue-400 transition-colors text-slate-800"
                            >
                                <option value="">Selecione o Hóspede...</option>
                                {activeGuests.map(guest => (
                                    <option key={guest.id} value={guest.id}>{guest.fullName} (Quarto {guest.roomId})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {notice && (
                        <p className={`p-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-center border ${notice.tone === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : notice.tone === 'warn' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {notice.text}
                    </p>
                    )}

                    <button
                        disabled={!paymentType || isProcessing}
                        onClick={handleCloseBill}
                        className={`w-full py-3.5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-xl shadow-blue-200 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${paymentType === 'IMMEDIATE' ? 'bg-green-600 text-white shadow-green-200 hover:bg-green-500' : 'bg-blue-600 text-white hover:bg-blue-500'
                            }`}
                    >
                        {isProcessing ? 'A processar...' : 'Confirmar Fecho'}
                    </button>
                </div>
            </div>
        </div>
    );
}
