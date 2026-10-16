import { supabase } from './client';
import { monthRange, type CatalogEntry, type PurchaseLine } from './domain';

async function collect<T>(getPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getPage(offset, offset + 999);
    if (error) throw error;
    result.push(...(data ?? []) as T[]);
    if (!data || data.length < 1000) return result;
  }
}
export async function getCatalog(table: 'items' | 'suppliers') {
  const entries = await collect<CatalogEntry>((from, to) => supabase!.from(table).select('id,name').order('id').range(from, to));
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
export async function getHistory(month: string, allDates: boolean, createdBy?: string) {
  const range = monthRange(month);
  return collect<PurchaseLine>((from, to) => {
    let query = supabase!.from('purchase_history').select('*');
    if (createdBy) query = query.eq('created_by', createdBy);
    if (!allDates) query = query.gte('purchase_date', range.from).lt('purchase_date', range.to);
    return query.order('purchase_date', { ascending: false }).order('id').range(from, to);
  });
}
