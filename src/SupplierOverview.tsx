import { ArrowUpRight } from 'lucide-react';
import { dateLabel, money, totalAmount, type PurchaseLine } from './domain';

export default function SupplierOverview({ lines, onSupplier }: { lines: PurchaseLine[]; onSupplier: (id: string) => void }) {
  const groups = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const group = groups.get(line.supplier_id);
    if (group) group.push(line); else groups.set(line.supplier_id, [line]);
  }
  const suppliers = [...groups.entries()].map(([id, purchases]) => ({ id, name: purchases[0].supplier_name, amount: totalAmount(purchases), invoices: new Set(purchases.map(line => line.purchase_id)).size, latest: purchases.map(line => line.purchase_date).sort().at(-1)! })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return <><div className="table-scroll desktop-table"><table><thead><tr><th>Supplier</th><th>Latest purchase</th><th className="number">Invoices</th><th className="number">Spending RM</th><th /></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.id}><td><strong>{supplier.name}</strong></td><td>{dateLabel(supplier.latest)}</td><td className="number">{supplier.invoices}</td><td className="number amount">{supplier.amount.toFixed(2)}</td><td><button className="text-button" onClick={() => onSupplier(supplier.id)}>View purchases <ArrowUpRight size={14} aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
    <ul className="mobile-list" aria-label="Supplier spending">{suppliers.map(supplier => <li className="mobile-card" key={supplier.id}><div className="card-heading"><h3>{supplier.name}</h3><strong className="card-amount">{money(supplier.amount)}</strong></div><div className="card-detail"><span>{supplier.invoices} {supplier.invoices === 1 ? 'invoice' : 'invoices'}</span><span>Latest: {dateLabel(supplier.latest)}</span></div><button className="secondary full supplier-drilldown" onClick={() => onSupplier(supplier.id)}>View purchases <ArrowUpRight size={16} aria-hidden="true" /></button></li>)}</ul>
    <div className="table-footer"><span>{suppliers.length} {suppliers.length === 1 ? 'supplier' : 'suppliers'} with purchases in this period</span><strong>Total {money(totalAmount(lines))}</strong></div>
  </>;
}
