import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function isPublicKey(value: string) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const part = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).role === 'anon';
  } catch { return false; }
}

export const configured = Boolean(url?.startsWith('https://') && key && isPublicKey(key));
export const supabase = configured ? createClient(url!, key!) : null;

export function friendlyError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (['PGRST202', '42883', '42703'].includes(code)) return 'Purchase saving has not been set up yet. Please contact your administrator to finish database setup.';
  if (code === '42501') return 'You do not have permission. Please ask your administrator to confirm that your account is active.';
  if (error instanceof TypeError) return 'Unable to connect. Check your internet connection and try again. If you were saving, refresh the records first to check whether the invoice was saved.';
  return 'The operation could not be completed. Please try again or contact your administrator.';
}
