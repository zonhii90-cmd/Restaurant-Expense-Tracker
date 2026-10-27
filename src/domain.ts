export const UNITS = [
  ['kg', 'kg'], ['g', 'g'], ['litre', 'litre'], ['ml', 'ml'],
  ['tin', 'tin'], ['carton', 'carton'], ['bag', 'bag'],
  ['bottle', 'bottle'], ['pack', 'pack'], ['piece', 'piece'],
  ['tray', 'tray'], ['box', 'box'],
] as const;

export type Unit = typeof UNITS[number][0];
export type CatalogEntry = { id: string; name: string };
export type PurchaseLine = {
  status?: 'active' | 'voided'; revision?: number; notes?: string | null; entered_by?: string;
  id: string; purchase_id: string; purchase_date: string; invoice_number: string | null;
  receipt_path?: string | null;
  created_by: string; supplier_id: string; supplier_name: string;
  item_id: string; item_name: string; quantity: number; unit: Unit;
  total_amount: number; unit_price: number;
};
export type DraftLine = { key: string; name: string; quantity: string; unit: Unit; amount: string };
export type ItemSummary = { item: string; itemId: string; unit: Unit; quantity: number; amount: number; count: number };
export type SupplierSummary = { supplier: string; amount: number; invoices: number };

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuching', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` };
}

export function monthLabel(month: string) {
  monthRange(month);
  return new Intl.DateTimeFormat('en-MY', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function money(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
}
export function quantity(value: number) {
  return new Intl.NumberFormat('en-MY', { maximumFractionDigits: 3 }).format(value);
}
export function dateLabel(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
export function activeLines<T extends {status?: string}>(lines: T[]): T[] { return lines.filter(line => line.status !== 'voided'); }
export function totalAmount(lines: Pick<PurchaseLine, 'total_amount'>[]) {
  return lines.reduce((sum, line) => sum + Math.round(Number(line.total_amount) * 100), 0) / 100;
}
export function summarizeItems(lines: PurchaseLine[]): ItemSummary[] {
  const groups = new Map<string, { item: string; itemId: string; unit: Unit; mills: number; cents: number; count: number }>();
  for (const line of activeLines(lines)) {
    const key = `${line.item_id}:${line.unit}`;
    const value = groups.get(key) ?? { item: line.item_name, itemId: line.item_id, unit: line.unit, mills: 0, cents: 0, count: 0 };
    value.mills += Math.round(Number(line.quantity) * 1000);
    value.cents += Math.round(Number(line.total_amount) * 100);
    value.count += 1;
    groups.set(key, value);
  }
  return [...groups.values()].map(v => ({ item: v.item, itemId: v.itemId, unit: v.unit, quantity: v.mills / 1000, amount: v.cents / 100, count: v.count }))
    .sort((a, b) => b.amount - a.amount || a.item.localeCompare(b.item));
}
export function summarizeSuppliers(lines: PurchaseLine[]): SupplierSummary[] {
  const groups = new Map<string, { supplier: string; cents: number; invoices: Set<string> }>();
  for (const line of activeLines(lines)) {
    const value = groups.get(line.supplier_id) ?? { supplier: line.supplier_name, cents: 0, invoices: new Set<string>() };
    value.cents += Math.round(Number(line.total_amount) * 100);
    value.invoices.add(line.purchase_id);
    groups.set(line.supplier_id, value);
  }
  return [...groups.values()].map(v => ({ supplier: v.supplier, amount: v.cents / 100, invoices: v.invoices.size }))
    .sort((a, b) => b.amount - a.amount);
}
export function filterLines(lines: PurchaseLine[], query: string, supplier: string) {
  const term = query.trim().toLocaleLowerCase();
  return lines.filter(line => (!supplier || line.supplier_id === supplier) &&
    (!term || line.item_name.toLocaleLowerCase().includes(term)));
}
export function validateDraft(date: string, supplier: string, lines: DraftLine[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Enter a purchase date.';
  if (!supplier.trim() || supplier.trim().length > 200) return 'Enter a supplier name (up to 200 characters).';
  if (lines.length === 0 || lines.length > 100) return 'Each invoice must contain 1 to 100 items.';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.name.trim() || line.name.trim().length > 200) return `Enter a name for item ${i + 1}.`;
    if (!/^\d+(\.\d{1,3})?$/.test(line.quantity) || Number(line.quantity) <= 0 || Number(line.quantity) >= 1e9) return `Item ${i + 1} needs a quantity greater than zero, with up to 3 decimal places.`;
    if (!/^\d+(\.\d{1,2})?$/.test(line.amount) || Number(line.amount) >= 1e10) return `Item ${i + 1} needs a nonnegative amount, with up to 2 decimal places.`;
    if (!UNITS.some(([unit]) => unit === line.unit)) return `Choose a unit for item ${i + 1}.`;
  }
  return null;
}
