import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { dateLabel, money, quantity, totalAmount, type PurchaseLine } from './domain';
import ReceiptViewer from './ReceiptViewer';
import PurchaseCorrections from './PurchaseCorrections';
import {purchaseDetail,snapshotLines,correctionError,type Detail} from './corrections';

export default function PurchaseDetails({ lines: initialLines, onClose, manager=false, onChanged=()=>{}, onBusy=()=>{}, onDirty=()=>{} }: { lines: PurchaseLine[]; onClose: () => void; manager?:boolean; onChanged?:()=>void; onBusy?:(busy:boolean)=>void; onDirty?:(dirty:boolean)=>void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState(false);
  const [detail,setDetail]=useState<Detail|null>(null); const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [editing,setEditing]=useState(false);
  const id=initialLines[0].purchase_id;
  const load=useCallback(async()=>{setLoading(true);setError('');try{setDetail(await purchaseDetail(id));}catch(err){setError(correctionError(err));throw err;}finally{setLoading(false);}},[id]);
  useEffect(()=>{void load().catch(()=>{});},[load]);
  const lines=detail?snapshotLines(detail.purchase):initialLines;
  const purchase = lines[0];
  const markDirty=useCallback((value:boolean)=>{setEditing(value);onDirty(value);},[onDirty]);
  const close=()=>{if(!busy && (!editing || window.confirm('Discard this unsaved correction?')))dialog.current?.close();};
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="purchase-dialog" aria-labelledby="purchase-detail-title" onCancel={event=>{if(busy || (editing && !window.confirm('Discard this unsaved correction?')))event.preventDefault();}} onClose={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="detail-header"><div><span className="eyebrow">PURCHASE RECORD</span><h2 id="purchase-detail-title">Purchase details</h2></div><button className="icon-button" aria-label="Close purchase details" disabled={busy} onClick={close}><X size={22} aria-hidden="true" /></button></header>
    <div className="detail-body"><dl className="purchase-facts"><div><dt>Supplier</dt><dd>{purchase.supplier_name}</dd></div><div><dt>Purchase date</dt><dd>{dateLabel(purchase.purchase_date)}</dd></div><div><dt>Invoice number</dt><dd>{purchase.invoice_number || 'Not provided'}</dd></div><div><dt>Items</dt><dd>{lines.length}</dd></div></dl>
      {detail && <dl className="purchase-facts"><div><dt>Entered by</dt><dd>{detail.purchase.entered_by}</dd></div><div><dt>Status</dt><dd>{detail.purchase.status==='voided'?'Voided':'Active'}</dd></div><div><dt>Notes</dt><dd>{detail.purchase.notes || 'Not provided'}</dd></div></dl>}
      <ul className="detail-items" aria-label="Invoice items">{lines.map(line => <li key={line.id}><div><strong>{line.item_name}</strong><span>{quantity(Number(line.quantity))} {line.unit} · {money(Number(line.unit_price))} / {line.unit}</span></div><strong>{money(Number(line.total_amount))}</strong></li>)}</ul>
      <div className="detail-total"><span>Invoice total</span><strong>{money(totalAmount(lines))}</strong></div>
      {purchase.receipt_path ? <button className="secondary full" onClick={() => setReceipt(true)}><Camera size={18} aria-hidden="true" />View receipt</button> : <p className="detail-no-receipt">No receipt photo attached.</p>}
      {loading && <p role="status">Loading correction status…</p>}
      {error && <div className="message error" role="alert">{error}<button className="text-button" onClick={()=>void load().catch(()=>{})}>Refresh purchase</button></div>}
      {detail && !error && <PurchaseCorrections detail={detail} manager={manager} onReload={load} onChanged={onChanged} onDirty={markDirty} onBusy={value=>{setBusy(value);onBusy(value);}}/>}
    </div>
    {receipt && <ReceiptViewer purchase={purchase} onClose={() => setReceipt(false)} />}
  </dialog>;
}
