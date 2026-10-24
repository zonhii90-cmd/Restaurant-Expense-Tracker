import { useEffect,useRef,useState,type FormEvent } from 'react';
import { X,Loader2 } from 'lucide-react';
import { administerStaff,accountError,type StaffAccount } from './accounts';
export default function StaffAccountForm({account,onClose,onSaved,onBusy}:{account:StaffAccount|null;onClose:()=>void;onSaved:()=>void;onBusy:(busy:boolean)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;setError('');setBusy(true);onBusy(true);
    try{
      await administerStaff(account?{action:'reset_password',user_id:account.user_id,password}:{action:'create_staff',display_name:name.trim(),email:email.trim(),password});
      setPassword('');onSaved();
    }catch(err){setError(accountError(err));}finally{setBusy(false);onBusy(false);}
  }
  return <dialog ref={dialog} className="purchase-dialog account-dialog" aria-labelledby="account-form-title" onCancel={event=>{if(busy)event.preventDefault();}} onClose={onClose}>
    <header className="detail-header"><h2 id="account-form-title">{account?'Reset staff password':'Create staff account'}</h2><button className="icon-button" aria-label="Close account form" disabled={busy} onClick={()=>dialog.current?.close()}><X size={22} aria-hidden="true" /></button></header>
    <form className="detail-body account-form" onSubmit={submit}>{account?<p>Set a new password for <strong>{account.display_name || account.email}</strong>.</p>:<><label>Staff name<input autoFocus required maxLength={100} autoComplete="off" value={name} disabled={busy} onChange={e=>setName(e.target.value)} /></label><label>Staff email<input type="email" required maxLength={254} autoComplete="off" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} /></label></>}
      <label>{account?'New password':'Initial password'}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} /></label>
      <p className="account-hint">At least 12 characters. Share the password privately; it will not be shown again. No email is sent automatically.</p>
      {error && <div className="message error" role="alert">{error}</div>}
      <button className="primary full" disabled={busy}>{busy && <Loader2 size={18} className="spin" aria-hidden="true" />}{busy?'Saving…':account?'Save new password':'Create account'}</button>
    </form>
  </dialog>;
}
