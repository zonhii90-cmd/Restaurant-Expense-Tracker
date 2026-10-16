import { ArrowUpRight } from 'lucide-react';
import { money, quantity, summarizeItems, summarizeSuppliers, totalAmount, type PurchaseLine } from './domain';

export default function Reports({ lines, onItem, tab, onTab }: {
  lines: PurchaseLine[]; onItem: (name: string) => void;
  tab: 'items' | 'suppliers'; onTab: (tab: 'items' | 'suppliers') => void;
}) {
  const items = summarizeItems(lines);
  const suppliers = summarizeSuppliers(lines);
  return <>
    <div className="report-tabs" role="group" aria-label="Report grouping">
      <button aria-pressed={tab === 'items'} className={tab === 'items' ? 'selected' : ''} onClick={() => onTab('items')}>By item</button>
      <button aria-pressed={tab === 'suppliers'} className={tab === 'suppliers' ? 'selected' : ''} onClick={() => onTab('suppliers')}>By supplier</button>
    </div>
    <div className="table-scroll desktop-table">{tab === 'items' ? <table>
      <thead><tr><th>Item</th><th>Unit</th><th className="number">Total quantity</th><th className="number">Total amount RM</th><th /></tr></thead>
      <tbody>{items.map(item => <tr key={`${item.itemId}:${item.unit}`}>
        <td><strong>{item.item}</strong></td><td><span className="unit-tag">{item.unit}</span></td>
        <td className="number">{quantity(item.quantity)}</td><td className="number amount">{item.amount.toFixed(2)}</td>
        <td><button className="text-button" onClick={() => onItem(item.item)}>View purchases <ArrowUpRight size={14} /></button></td>
      </tr>)}</tbody>
    </table> : <table>
      <thead><tr><th>Supplier</th><th className="number">Invoice count</th><th className="number">Spending RM</th></tr></thead>
      <tbody>{suppliers.map(supplier => <tr key={supplier.supplier}>
        <td><strong>{supplier.supplier}</strong></td><td className="number">{supplier.invoices}</td><td className="number amount">{supplier.amount.toFixed(2)}</td>
      </tr>)}</tbody>
    </table>}</div>
    {tab === 'items' ? <ul className="mobile-list report-cards" aria-label="Item totals">
      {items.map(item => <li className="mobile-card report-card" key={`${item.itemId}:${item.unit}`}>
        <div className="card-heading"><h3>{item.item}</h3><strong className="card-amount">{money(item.amount)}</strong></div>
        <div className="report-metrics"><div><span>Total quantity</span><strong>{quantity(item.quantity)} {item.unit}</strong></div><div><span>Purchase lines</span><strong>{item.count}</strong></div></div>
        <button className="secondary full" onClick={() => onItem(item.item)}>View purchases <ArrowUpRight size={16} /></button>
      </li>)}
    </ul> : <ul className="mobile-list report-cards" aria-label="Supplier totals">
      {suppliers.map(supplier => <li className="mobile-card report-card" key={supplier.supplier}>
        <div className="card-heading"><h3>{supplier.supplier}</h3><strong className="card-amount">{money(supplier.amount)}</strong></div>
        <div className="card-detail"><span>Invoices</span><strong>{supplier.invoices}</strong></div>
      </li>)}
    </ul>}
    <div className="table-footer"><span>Units are reported separately. Quantities are not automatically converted.</span><strong>Total {money(totalAmount(lines))}</strong></div>
  </>;
}
