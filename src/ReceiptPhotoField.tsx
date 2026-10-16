import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { prepareReceipt, type ReceiptPhoto } from './receipts';

export default function ReceiptPhotoField({ photo, disabled, onChange, onPreparing }: {
  photo: ReceiptPhoto | null; disabled: boolean;
  onChange: (photo: ReceiptPhoto | null) => void; onPreparing: (value: boolean) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function select(file?: File) {
    if (!file) return;
    setError(''); setPreparing(true); onPreparing(true);
    try { onChange(await prepareReceipt(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to prepare photo. Please try again.'); }
    finally { setPreparing(false); onPreparing(false); }
  }
  const locked = disabled || preparing;
  return <section className="form-panel receipt-field" aria-labelledby="receipt-title">
    <div className="section-title"><span className="step"><Camera aria-hidden="true" size={17} /></span><div><h2 id="receipt-title">Receipt photo <span className="optional">optional</span></h2><p>Keep a photo of the invoice for future reference.</p></div></div>
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" aria-label="Take receipt photo" hidden disabled={locked} onChange={event => { void select(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Choose receipt photo" hidden disabled={locked} onChange={event => { void select(event.target.files?.[0]); event.target.value = ''; }} />
    {preview && <div className="receipt-preview"><img src={preview} alt="Receipt photo preview" /><div><span>{photo?.name}</span><button type="button" className="text-button" disabled={locked} onClick={() => { onChange(null); setError(''); }}><Trash2 aria-hidden="true" size={16} />Remove photo</button></div></div>}
    <div className="receipt-actions"><button type="button" className="secondary" disabled={locked} onClick={() => camera.current?.click()}><Camera aria-hidden="true" size={18} />{photo ? 'Retake photo' : 'Take photo'}</button><button type="button" className="secondary" disabled={locked} onClick={() => gallery.current?.click()}><ImagePlus aria-hidden="true" size={18} />{photo ? 'Replace photo' : 'Choose photo'}</button></div>
    {preparing && <p className="receipt-hint" role="status"><Loader2 aria-hidden="true" size={16} className="spin" />Preparing photo…</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <p className="receipt-hint">One photo per invoice · Up to 20 MB. Uploaded when you save the purchase.</p>
  </section>;
}
