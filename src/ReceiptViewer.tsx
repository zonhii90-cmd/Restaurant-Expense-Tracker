import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { receiptUrl } from './receipts';
import type { PurchaseLine } from './domain';
import { dateLabel } from './domain';

export default function ReceiptViewer({ purchase, onClose }: { purchase: PurchaseLine; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const request = useRef<{ key: string; promise: Promise<string> } | null>(null);
  useEffect(() => { dialog.current?.showModal(); closeButton.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    setUrl(''); setError('');
    const key = `${purchase.receipt_path}:${version}`;
    if (request.current?.key !== key) request.current = { key, promise: receiptUrl(purchase.receipt_path!) };
    request.current.promise.then(value => { if (active) setUrl(value); }).catch(() => { if (active) setError('Unable to load receipt. Check your connection and try again.'); });
    return () => { active = false; };
  }, [purchase.receipt_path, version]);
  return <dialog ref={dialog} className="receipt-dialog" aria-labelledby="receipt-view-title" onClose={onClose}>
    <header><div><h2 id="receipt-view-title">Receipt photo</h2><p>{purchase.supplier_name} · {dateLabel(purchase.purchase_date)}</p></div><button ref={closeButton} type="button" className="icon-button" aria-label="Close receipt" onClick={() => dialog.current?.close()}><X aria-hidden="true" size={22} /></button></header>
    {error ? <div className="receipt-loading"><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setVersion(v => v + 1)}>Try again</button></div> : url ? <><div className="receipt-image"><img src={url} alt={`Receipt from ${purchase.supplier_name} on ${dateLabel(purchase.purchase_date)}`} onError={() => setError('This receipt could not be displayed. Try loading it again.')} /></div><a className="secondary receipt-fullsize" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" size={16} />Open full size</a></> : <p className="receipt-loading" role="status"><Loader2 aria-hidden="true" size={20} className="spin" />Loading receipt…</p>}
  </dialog>;
}
