import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { todayIso } from '@/lib/format';
import type { BookingDraft, BookingServiceType } from '@/types/hotel';

interface BookingContextValue {
  draft: BookingDraft | null;
  guestName: string;
  email: string;
  notes: string;
  setGuestName: (value: string) => void;
  setEmail: (value: string) => void;
  setNotes: (value: string) => void;
  beginDraft: (draft: BookingDraft) => void;
  clearDraft: () => void;
  hasDraft: boolean;
}

const noop = () => {};

const BookingContext = createContext<BookingContextValue>({
  draft: null,
  guestName: '',
  email: '',
  notes: '',
  setGuestName: noop,
  setEmail: noop,
  setNotes: noop,
  beginDraft: noop,
  clearDraft: noop,
  hasDraft: false,
});

/**
 * Estado partilhado do fluxo de reserva.
 *
 * O rascunho vive apenas em memória: se o sistema operativo matar a app a meio
 * do checkout, o hóspede recomeça. É intencional — um rascunho de pagamento não
 * deve sobreviver num dispositivo partilhado.
 */
export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const beginDraft = useCallback((next: BookingDraft) => {
    setDraft(next);
    setNotes(next.notes ?? '');
  }, []);

  const clearDraft = useCallback(() => {
    setDraft(null);
    setNotes('');
  }, []);

  const value = useMemo<BookingContextValue>(
    () => ({
      draft,
      guestName,
      email,
      notes,
      setGuestName,
      setEmail,
      setNotes,
      beginDraft,
      clearDraft,
      hasDraft: draft !== null,
    }),
    [draft, guestName, email, notes, beginDraft, clearDraft],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  return useContext(BookingContext);
}

/** Rascunho base para um serviço, usado pelos ecrãs de listagem. */
export function makeDraft(
  serviceType: BookingServiceType,
  title: string,
  unitPrice: number,
  quantity = 1,
  date = todayIso(),
): BookingDraft {
  return { serviceType, title, unitPrice, quantity, date };
}
