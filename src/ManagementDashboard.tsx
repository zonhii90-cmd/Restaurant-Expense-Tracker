import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { dateLabel, money, quantity, summarizeItems, summarizeSuppliers, totalAmount, type PurchaseLine } from './domain';

export default function ManagementDashboard({ lines, onPurchases, onSupplier, onItem, onPurchase }: {
  lines: PurchaseLine[]; onPurchases: () => void; onSupplier: (id: string) => void;
  onItem: (name: string) => void; onPurchase: (lines: PurchaseLine[]) => void;
}) {
  const invoices = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const group = invoices.get(line.purchase_id);
    if (group) group.push(line); else invoices.set(line.purchase_id, [line]);
  }
  const recent = [...invoices.values()].sort((a, b) => b[0].purchase_date.localeCompare(a[0].purchase_date) || b[0].purchase_id.localeCompare(a[0].purchase_id)).slice(0, 5);
  const suppliers = summarizeSuppliers(lines).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const items = summarizeItems(lines).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const total = totalAmount(lines);
  return <div className="dashboard-content">
    <section className="records-panel recent-panel"><div className="panel-heading"><div><h2>Recent invoices</h2><p>Open a purchase to check every item and receipt.</p></div><button className="text-button" onClick={onPurchases}>View all <ArrowUpRight size={16} aria-hidden="true" /></button></div>
      {!recent.length ? <div className="empty"><ClipboardList size={30} /><h3>No purchases this month</h3><p>Purchases entered in the staff workspace will appear here.</p></div> : <>
        <div className="table-scroll desktop-table"><table><thead><tr><th>Date</th><th>Supplier / invoice</th><th className="number">Items</th><th className="number">Total RM</th><th /></tr></thead><tbody>{recent.map(invoice => <tr key={invoice[0].purchase_id}><td>{dateLabel(invoice[0].purchase_date)}</td><td><strong>{invoice[0].supplier_name}</strong><small>{invoice[0].invoice_number || 'No invoice number'}</small></td><td className="number">{invoice.length}</td><td className="number amount">{totalAmount(invoice).toFixed(2)}</td><td><button className="text-button" onClick={() => onPurchase(invoice)}>View purchase <ArrowUpRight size={14} aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
        <ul className="mobile-list" aria-label="Recent invoices">{recent.map(invoice => <li className="mobile-card" key={invoice[0].purchase_id}><div className="card-meta"><time dateTime={invoice[0].purchase_date}>{dateLabel(invoice[0].purchase_date)}</time><span>{invoice.length} {invoice.length === 1 ? 'item' : 'items'}</span></div><div className="card-heading"><h3>{invoice[0].supplier_name}</h3><strong className="card-amount">{money(totalAmount(invoice))}</strong></div>{invoice[0].invoice_number && <p className="invoice-reference">{invoice[0].invoice_number}</p>}<button className="secondary full" onClick={() => onPurchase(invoice)}>View purchase <ArrowUpRight size={16} aria-hidden="true" /></button></li>)}</ul>
      </>}
    </section>
    <div className="insights-grid"><section className="records-panel"><div className="panel-heading"><div><h2>Spending by supplier</h2><p>Top five suppliers in the selected month.</p></div></div><ul className="insight-list" aria-label="Top suppliers">{suppliers.map(supplier => <li key={supplier.supplier}><button onClick={() => onSupplier(lines.find(line => line.supplier_name === supplier.supplier)!.supplier_id)}><span className="insight-name"><span>{supplier.supplier}</span><small>{supplier.invoices} {supplier.invoices === 1 ? 'invoice' : 'invoices'}</small></span><strong>{money(supplier.amount)}</strong><ArrowUpRight size={16} aria-hidden="true" /></button><meter min={0} max={Math.max(total, 1)} value={supplier.amount} aria-label={`${supplier.supplier} share of spending`} /></li>)}</ul>{!suppliers.length && <p className="insight-empty">No supplier spending to show.</p>}</section>
      <section className="records-panel"><div className="panel-heading"><div><h2>Top purchased items</h2><p>Ranked by spending; each unit stays separate.</p></div></div><ul className="insight-list" aria-label="Top items">{items.map(item => <li key={`${item.itemId}:${item.unit}`}><button onClick={() => onItem(item.item)}><span className="insight-name"><span>{item.item}</span><small>{quantity(item.quantity)} {item.unit}</small></span><strong>{money(item.amount)}</strong><ArrowUpRight size={16} aria-hidden="true" /></button></li>)}</ul>{!items.length && <p className="insight-empty">No purchased items to show.</p>}</section></div>
  </div>;
}
