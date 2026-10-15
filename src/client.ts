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
  if (['PGRST202', '42883', '42703'].includes(code)) return '数据库还需要更新保存功能。请联系管理员完成数据库设置。';
  if (code === '42501') return '账号没有操作权限，请联系管理员确认账号已启用。';
  if (error instanceof TypeError) return '暂时无法连接。请检查网络后重试；如刚才在保存，请先刷新记录确认是否已保存。';
  return '操作未完成，请重试。如仍有问题，请联系管理员。';
}
