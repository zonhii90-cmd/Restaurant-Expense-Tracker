import {useEffect,useState,type FormEvent} from 'react';
import {UNITS,validateDraft,money,totalAmount,type DraftLine} from './domain';
import {accountTime} from './accounts';
import {correctionError,requestCorrection,resolvePurchase,snapshotLines,type Detail,type Snapshot} from './corrections';

export function SnapshotCard({purchase:p}:{purchase:Snapshot}){return <div className="change-snapshot"><p>{p.date} · {p.supplier} · {p.status}</p><p>Invoice: {p.invoice || 'Not provided'} · Notes: {p.notes || 'Not provided'}</p><ul>{p.lines.map((l,i)=><li key={i}>{l.name}: {l.quantity} {l.unit} · {money(Number(l.amount))}</li>)}</ul><strong>{money(totalAmount(snapshotLines(p)))}</strong></div>;}
export default function PurchaseCorrections({detail,manager,onReload,onChanged,onBusy,onDirty}:{detail:Detail;manager:boolean;onReload:()=>Promise<void>;onChanged:()=>void;onBusy:(busy:boolean)=>void;onDirty:(dirty:boolean)=>void}){
 const p=detail.purchase;const pending=detail.requests.find(r=>r.status==='pending');
 const [action,setAction]=useState('');const [reason,setReason]=useState('');const [operation,setOperation]=useState('');
 const [date,setDate]=useState(p.date);const [supplier,setSupplier]=useState(p.supplier);const [invoice,setInvoice]=useState(p.invoice || '');const [notes,setNotes]=useState(p.notes || '');
 const [lines,setLines]=useState<DraftLine[]>([]);const [review,setReview]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [uncertain,setUncertain]=useState(false);
 useEffect(()=>{onDirty(Boolean(action));return()=>onDirty(false);},[action,onDirty]);
 const data={date,supplier,invoice:invoice || null,notes:notes || null,lines:lines.map(l=>({name:l.name.trim(),quantity:l.quantity,unit:l.unit,amount:l.amount}))};
 function begin(next:string){setAction(next);setReason('');setOperation(crypto.randomUUID());setError('');setNotice('');setUncertain(false);setReview(false);setDate(p.date);setSupplier(p.supplier);setInvoice(p.invoice || '');setNotes(p.notes || '');setLines(p.lines.map(l=>({key:l.id,name:l.name,quantity:l.quantity,unit:l.unit,amount:l.amount})));}
 async function submit(event:FormEvent){event.preventDefault();if(busy || uncertain)return;setError('');if(!reason.trim()){setError('Enter a reason or explanation.');return;}
  if(action==='corrected'){const invalid=validateDraft(date,supplier,lines);if(invalid){setError(invalid);return;}if(!review){setReview(true);return;}}
  setBusy(true);onBusy(true);
  try{if(action==='requested')await requestCorrection(operation,p,reason.trim());else await resolvePurchase(operation,p,action,reason.trim(),action==='corrected'?data:null,pending?.id || null);
   setAction('');onChanged();await onReload();setNotice(action==='requested'?'Correction request submitted.':action==='corrected'?'Purchase corrected.':action==='voided'?'Purchase voided.':'Request declined.');
  }catch(err){setError(correctionError(err));setUncertain(true);}finally{setBusy(false);onBusy(false);}
 }
 function changeLine(index:number,patch:Partial<DraftLine>){setLines(old=>old.map((l,i)=>i===index?{...l,...patch}:l));setReview(false);}
 return <section className="corrections" aria-label="Purchase corrections">
  {notice && <p className="account-message message success" role="status">{notice}</p>}
  {p.status==='voided' && <p className="message error">Voided · Kept for reference. Excluded from purchase totals.</p>}
  <h3>Correction requests</h3>
  {detail.requests.length===0?<p>No correction requests.</p>:detail.requests.map(r=><article className="change-card" key={r.id}><strong>{r.status[0].toUpperCase()+r.status.slice(1)} · {r.actor_name}</strong><p>{r.reason}</p><small>{accountTime(r.created_at)} · Malaysia</small>{r.resolution && <p>Manager response: {r.resolution}</p>}</article>)}
  {!action && p.status==='active' && <div className="button-row">{manager?<><button className="primary" disabled={busy} onClick={()=>begin('corrected')}>Correct purchase</button><button className="secondary danger" disabled={busy} onClick={()=>begin('voided')}>Void purchase</button>{pending && <button className="secondary" disabled={busy} onClick={()=>begin('declined')}>Decline request</button>}</>:!pending && <button className="primary" disabled={busy} onClick={()=>begin('requested')}>Request correction</button>}</div>}
  {action && <form className="correction-form" onSubmit={submit} onChange={()=>setReview(false)}>
   <h3>{action==='requested'?'Request correction':action==='corrected'?'Correct purchase':action==='voided'?'Void purchase':'Decline request'}</h3>
   {action==='corrected' && <>
    <label>Purchase date<input type="date" required value={date} disabled={busy || uncertain} onChange={e=>setDate(e.target.value)}/></label>
    <label>Supplier<input required maxLength={200} value={supplier} disabled={busy || uncertain} onChange={e=>setSupplier(e.target.value)}/></label>
    <label>Invoice number<input maxLength={200} value={invoice} disabled={busy || uncertain} onChange={e=>setInvoice(e.target.value)}/></label>
    <label>Notes<textarea maxLength={2000} value={notes} disabled={busy || uncertain} onChange={e=>setNotes(e.target.value)}/></label>
    {lines.map((l,i)=><fieldset className="correction-line" key={l.key} disabled={busy || uncertain}><legend>Item {i+1}</legend><label>Item name<input required maxLength={200} value={l.name} onChange={e=>changeLine(i,{name:e.target.value})}/></label><div className="correction-pair"><label>Quantity<input inputMode="decimal" required value={l.quantity} onChange={e=>changeLine(i,{quantity:e.target.value})}/></label><label>Unit<select value={l.unit} onChange={e=>changeLine(i,{unit:e.target.value as DraftLine['unit']})}>{UNITS.map(([v,title])=><option key={v} value={v}>{title}</option>)}</select></label></div><label>Line total RM<input inputMode="decimal" required value={l.amount} onChange={e=>changeLine(i,{amount:e.target.value})}/></label><button type="button" className="text-button danger" disabled={lines.length===1} onClick={()=>{setLines(old=>old.filter((_,n)=>n!==i));setReview(false);}}>Remove item {i+1}</button></fieldset>)}
    <button type="button" className="secondary" disabled={busy || uncertain || lines.length>=100} onClick={()=>{setLines(old=>[...old,{key:crypto.randomUUID(),name:'',quantity:'',unit:'kg',amount:''}]);setReview(false);}}>Add item</button>
    <p>Original receipt photo is retained. The original author is unchanged.</p>
   </>}
   <label>{action==='requested'?'What needs correcting?':'Reason'}<textarea aria-label={action==='requested'?'What needs correcting?':'Reason'} required maxLength={2000} disabled={busy || uncertain} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {action==='voided' && <p className="message error">This purchase will remain in history and no longer count in reports. This version does not restore voided purchases.</p>}
   {action==='requested' && <p>The original purchase stays in reports until a manager corrects or voids it.</p>}
   {review && action==='corrected' && <div className="correction-review"><h4>Before correction</h4><SnapshotCard purchase={p}/><h4>After correction</h4><SnapshotCard purchase={{...p,...data,lines:lines.map(l=>({id:l.key,item_id:l.key,name:l.name,quantity:l.quantity,unit:l.unit,amount:l.amount}))}}/></div>}
   {error && <div className="message error" role="alert">{error}</div>}
   {uncertain?<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await onReload();setAction('');setError('');setUncertain(false);onChanged();}catch(err){setError(correctionError(err));}finally{setBusy(false);}}} >Refresh purchase</button>:<button className={action==='voided'?'secondary danger full':'primary full'} disabled={busy}>{busy?'Saving…':action==='corrected'?(review?'Save correction':'Review changes'):action==='requested'?'Submit request':action==='voided'?'Void purchase':'Decline request'}</button>}
   <button type="button" className="text-button" disabled={busy} onClick={()=>{if(!reason || window.confirm('Discard this unsaved correction?')){setAction('');setError('');}}}>Cancel</button>
  </form>}
  <h3>Change history</h3>
  {detail.changes.length===0?<p>No changes recorded.</p>:detail.changes.map(c=><details className="change-card" key={c.id}><summary>{c.action[0].toUpperCase()+c.action.slice(1)} · {c.actor_name} · {accountTime(c.created_at)}</summary><p>{c.reason}</p>{c.action==='corrected'?<><h4>Before</h4><SnapshotCard purchase={c.before_data}/><h4>After</h4><SnapshotCard purchase={c.after_data}/></>:c.action==='voided'?<SnapshotCard purchase={c.before_data}/>:null}</details>)}
 </section>;
}
