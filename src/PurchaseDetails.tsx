import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { dateLabel, money, quantity, totalAmount, type PurchaseLine } from './domain';
import ReceiptViewer from './ReceiptViewer';

export default function PurchaseDetails({ lines, onClose }: { lines: PurchaseLine[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState(false);
  const purchase = lines[0];
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="purchase-dialog" aria-labelledby="purchase-detail-title" onClose={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="detail-header"><div><span className="eyebrow">PURCHASE RECORD</span><h2 id="purchase-detail-title">Purchase details</h2></div><button className="icon-button" aria-label="Close purchase details" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button></header>
    <div className="detail-body"><dl className="purchase-facts"><div><dt>Supplier</dt><dd>{purchase.supplier_name}</dd></div><div><dt>Purchase date</dt><dd>{dateLabel(purchase.purchase_date)}</dd></div><div><dt>Invoice number</dt><dd>{purchase.invoice_number || 'Not provided'}</dd></div><div><dt>Items</dt><dd>{lines.length}</dd></div></dl>
      <ul className="detail-items" aria-label="Invoice items">{lines.map(line => <li key={line.id}><div><strong>{line.item_name}</strong><span>{quantity(Number(line.quantity))} {line.unit} · {money(Number(line.unit_price))} / {line.unit}</span></div><strong>{money(Number(line.total_amount))}</strong></li>)}</ul>
      <div className="detail-total"><span>Invoice total</span><strong>{money(totalAmount(lines))}</strong></div>
      {purchase.receipt_path ? <button className="secondary full" onClick={() => setReceipt(true)}><Camera size={18} aria-hidden="true" />View receipt</button> : <p className="detail-no-receipt">No receipt photo attached.</p>}
    </div>
    {receipt && <ReceiptViewer purchase={purchase} onClose={() => setReceipt(false)} />}
  </dialog>;
}
