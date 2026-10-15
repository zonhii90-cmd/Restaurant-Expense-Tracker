export const UNITS = [
  ['kg', '公斤 kg'], ['g', '克 g'], ['litre', '公升 litre'], ['ml', '毫升 ml'],
  ['tin', '罐 tin'], ['carton', '箱 carton'], ['bag', '袋 bag'],
  ['bottle', '瓶 bottle'], ['pack', '包 pack'], ['piece', '个 piece'],
  ['tray', '托 tray'], ['box', '盒 box'],
] as const;

export type Unit = typeof UNITS[number][0];
export type CatalogEntry = { id: string; name: string };
export type PurchaseLine = {
  id: string; purchase_id: string; purchase_date: string; invoice_number: string | null;
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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份。');
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` };
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
export function totalAmount(lines: Pick<PurchaseLine, 'total_amount'>[]) {
  return lines.reduce((sum, line) => sum + Math.round(Number(line.total_amount) * 100), 0) / 100;
}
export function summarizeItems(lines: PurchaseLine[]): ItemSummary[] {
  const groups = new Map<string, { item: string; itemId: string; unit: Unit; mills: number; cents: number; count: number }>();
  for (const line of lines) {
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
  for (const line of lines) {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return '请填写采购日期。';
  if (!supplier.trim() || supplier.trim().length > 200) return '请填写供应商名称（最多 200 字）。';
  if (lines.length === 0 || lines.length > 100) return '每张单据需要 1 至 100 项商品。';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.name.trim() || line.name.trim().length > 200) return `请填写第 ${i + 1} 项的商品名称。`;
    if (!/^\d+(\.\d{1,3})?$/.test(line.quantity) || Number(line.quantity) <= 0 || Number(line.quantity) >= 1e9) return `第 ${i + 1} 项数量需要大于 0，最多 3 位小数。`;
    if (!/^\d+(\.\d{1,2})?$/.test(line.amount) || Number(line.amount) >= 1e10) return `第 ${i + 1} 项金额需要为 0 或正数，最多 2 位小数。`;
    if (!UNITS.some(([unit]) => unit === line.unit)) return `请选择第 ${i + 1} 项的单位。`;
  }
  return null;
}
