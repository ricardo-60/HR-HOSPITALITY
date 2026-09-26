import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

type ElectronAuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type BrowserWithElectron = Window & {
  electronAPI?: { authStorage?: ElectronAuthStorage };
};

function getElectronAuthStorage(): ElectronAuthStorage | null {
  if (typeof window === 'undefined') return null;
  const storage = (window as BrowserWithElectron).electronAPI?.authStorage;
  if (
    storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function'
  ) {
    return storage;
  }
  return null;
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const electronAuthStorage = getElectronAuthStorage();

export const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(electronAuthStorage ? { storage: electronAuthStorage } : {})
      }
    })
  : null;
