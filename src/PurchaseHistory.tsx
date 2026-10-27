import { useState } from 'react';
import { Camera, ArrowUpRight } from 'lucide-react';
import ReceiptViewer from './ReceiptViewer';
import { dateLabel, money, quantity, type PurchaseLine } from './domain';

export default function PurchaseHistory({ lines, onPurchase }: { lines: PurchaseLine[]; onPurchase: (line: PurchaseLine) => void }) {
  const [receipt, setReceipt] = useState<PurchaseLine | null>(null);
  const viewReceipt = (line: PurchaseLine) => <button type="button" className="text-button view-receipt" aria-label={`View receipt for ${line.item_name}`} onClick={() => setReceipt(line)}><Camera aria-hidden="true" size={16} />View receipt</button>;
  return <>
    <div className="table-scroll desktop-table">
      <table className="history-table">
        <thead><tr><th>Date / Supplier</th><th>Item</th><th className="number">Quantity</th><th className="number">Unit price RM</th><th className="number">Amount RM</th><th><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{lines.map(line => <tr key={line.id}>
          <td>{line.status==='voided' && <span className="void-label">Voided · Excluded from totals</span>}<strong>{dateLabel(line.purchase_date)}</strong><small>{line.supplier_name}{line.invoice_number ? ` · ${line.invoice_number}` : ''}</small>{line.receipt_path && viewReceipt(line)}</td>
          <td><span className="item-name">{line.item_name}</span></td>
          <td className="number">{quantity(Number(line.quantity))} <span className="unit">{line.unit}</span></td>
          <td className="number subtle">{quantity(Number(line.unit_price))}</td>
          <td className="number amount">{Number(line.total_amount).toFixed(2)}</td><td><button className="text-button" onClick={() => onPurchase(line)}>View purchase <ArrowUpRight size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <ul className="mobile-list history-cards" aria-label="Purchase records">
      {lines.map(line => <li className="mobile-card purchase-card" key={line.id}>
        {line.status==='voided' && <p className="void-label">Voided · Excluded from totals</p>}<div className="card-meta"><span>{line.supplier_name}</span><time dateTime={line.purchase_date}>{dateLabel(line.purchase_date)}</time></div>
        <div className="card-heading"><h3>{line.item_name}</h3><strong className="card-amount">{money(Number(line.total_amount))}</strong></div>
        <div className="card-detail"><strong>{quantity(Number(line.quantity))} {line.unit}</strong><span>{money(Number(line.unit_price))} / {line.unit}</span></div>
        {line.invoice_number && <p className="invoice-reference">Invoice {line.invoice_number}</p>}
        <div className="purchase-card-actions"><button className="text-button" onClick={() => onPurchase(line)}>View purchase <ArrowUpRight size={14} aria-hidden="true" /></button>{line.receipt_path && viewReceipt(line)}</div>
      </li>)}
    </ul>
    {receipt && <ReceiptViewer purchase={receipt} onClose={() => setReceipt(null)} />}
  </>;
}
