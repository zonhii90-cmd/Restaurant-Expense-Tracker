import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, ChefHat, ClipboardList, LayoutDashboard, Store, FileBarChart2, Leaf, Loader2, LogOut, Plus, RefreshCw, Search, ShieldCheck, ShoppingBasket, Trash2, Wallet } from 'lucide-react';
import { configured, friendlyError, supabase } from './client';
import { getCatalog, getHistory } from './api';
import PurchaseHistory from './PurchaseHistory';
import Reports from './Reports';
import ReceiptPhotoField from './ReceiptPhotoField';
import { receiptPath, uploadReceipt, type ReceiptPhoto } from './receipts';
import { dateLabel, filterLines, money, monthLabel, quantity, summarizeItems, summarizeSuppliers, today, totalAmount, UNITS, validateDraft, type CatalogEntry, type DraftLine, type PurchaseLine } from './domain';

import { resolveWorkspace, workspaceHash, type Mode, type WorkspaceRoute } from './workspaces';
import ManagementDashboard from './ManagementDashboard';
import SupplierOverview from './SupplierOverview';
import PurchaseDetails from './PurchaseDetails';

type Member = { active: boolean; role: 'manager' | 'staff' };
function Spinner() { return <Loader2 size={18} className="spin" aria-label="Loading" />; }
function Message({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div className={`message ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>{children}</div>;
}
function Brand() { return <div className="brand"><span className="brand-icon"><ChefHat size={24} /></span><div>Ledger<span>RESTAURANT EXPENSES</span></div></div>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!supabase) { setInitializing(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError('Your session could not be restored. Please sign in again.');
      setSession(data.session); setInitializing(false);
    }).catch(() => { if (alive) { setError('Unable to connect to sign-in services. Please refresh and try again.'); setInitializing(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) { setSession(next); setInitializing(false); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    setMember(null); setError('');
    if (!session || !supabase) return;
    let alive = true;
    setMemberLoading(true);
    supabase.from('restaurant_members').select('active,role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error: queryError }) => {
        if (alive) { setMember(data as Member | null); setError(queryError ? friendlyError(queryError) : ''); setMemberLoading(false); }
      }, () => { if (alive) { setError('Unable to check account permissions. Please try again.'); setMemberLoading(false); } });
    return () => { alive = false; };
  }, [session?.user.id, retry]);
  const logout = async () => {
    const { error: signoutError } = await supabase!.auth.signOut({ scope: 'local' });
    if (signoutError) { setError('Unable to sign out. Please try again.'); return; }
    setMember(null); setSession(null);
  };
  if (!configured) return <div className="auth-layout"><section className="auth-card"><Brand /><span className="eyebrow">EVERY PURCHASE, ACCOUNTED FOR</span><h1>Your restaurant ledger is being set up</h1><p>Once connected, you can sign in, record purchases and view reports here. Please contact your administrator to finish setup.</p><div className="quiet-box"><ShieldCheck size={22} /><span>Purchase records are stored in the shared restaurant database.</span></div></section></div>;
  if (initializing) return <div className="center-state"><Spinner /><p>Opening your restaurant ledger…</p></div>;
  if (!session) return <Login />;
  if (memberLoading) return <div className="center-state"><Spinner /><p>Checking account access…</p></div>;
  if (!member?.active || error) return <div className="auth-layout"><section className="auth-card"><Brand /><h1>{error ? 'Unable to load your account' : 'Waiting for account approval'}</h1><p>{error || 'You are signed in, but your account is not active yet. Please ask your restaurant administrator to approve access.'}</p><p className="subtle">{session.user.email}</p><div className="button-row"><button onClick={() => setRetry(v => v + 1)} className="primary"><RefreshCw size={16} />Check again</button><button onClick={logout} className="secondary">Sign out</button></div></section></div>;
  return <Workspace key={session.user.id} session={session} member={member} logout={logout} authError={error} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setError(result.error.message === 'Invalid login credentials' ? 'The email or password is incorrect. Please check and try again.' : 'Sign-in failed. Please check your connection and account status, then try again.');
    } catch { setError('Unable to connect. Please check your internet connection.'); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout"><section className="auth-intro"><Brand /><div><span className="eyebrow">A CLEARER VIEW OF YOUR RESTAURANT</span><h1>Good food.<br />Clearer finances.</h1><p>Daily purchases · Monthly reports · Supplier spending<br />One shared ledger, from kitchen to management.</p></div><span className="intro-foot"><Leaf size={18} /> Made for the everyday rhythm of your restaurant</span></section><section className="auth-card login-card"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your restaurant</h2><p>Use the account provided by your administrator.</p><form onSubmit={submit}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></label>{error && <Message>{error}</Message>}<button className="primary full" disabled={busy}>{busy ? <Spinner /> : <ArrowUpRight size={18} />} {busy ? 'Signing in…' : 'Sign in'}</button></form><p className="login-trust"><ShieldCheck size={16} aria-hidden="true" /> Approved restaurant accounts only</p><p className="fine-print">Need an account or a password reset? Contact your restaurant administrator.</p></section></div>;
}

function Workspace({ session, member, logout, authError }: { session: Session; member: Member; logout: () => Promise<void>; authError: string }) {
  const manager = member.role === 'manager';
  const [route, setRoute] = useState<WorkspaceRoute>(() => resolveWorkspace(window.location.hash, manager));
  const { area, mode } = route;
  const management = manager && area === 'management';
  const [month, setMonth] = useState(today().slice(0, 7));
  const [allDates, setAllDates] = useState(false);
  const [query, setQuery] = useState('');
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [suppliers, setSuppliers] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [reportTab, setReportTab] = useState<'items' | 'suppliers'>('items');
  const [purchase, setPurchase] = useState<PurchaseLine[] | null>(null);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    window.scrollTo(0, 0);
    window.history.replaceState(window.history.state, '', workspaceHash(route));
  }, [area, mode]);
  useEffect(() => {
    const change = () => {
      const next = resolveWorkspace(window.location.hash, manager);
      if (next.area === area && next.mode === mode) {
        window.history.replaceState(window.history.state, '', workspaceHash(route));
        return;
      }
      if (saving || (dirty && !window.confirm('This purchase has not been saved. Leave this page?'))) {
        window.history.replaceState(window.history.state, '', workspaceHash(route));
        return;
      }
      setRoute(next); setDirty(false); setNotice(''); setError(''); setPurchase(null);
      setQuery(''); setSupplier(''); setAllDates(false); setPage(0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [area, mode, dirty, saving, manager]);
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === 'visible' && mode !== 'entry') refresh(); }, 60000);
    const focus = () => { if (mode !== 'entry') refresh(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [mode, refresh]);
  useEffect(() => {
    if (mode === 'entry') return;
    let alive = true;
    setLoading(true); setError(''); setLines([]);
    getHistory(month, allDates, management ? undefined : session.user.id).then(data => {
      if (alive) { setLines(data); setLoading(false); }
    }).catch(err => { if (alive) { setError(friendlyError(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [month, allDates, version, mode, management, session.user.id]);
  useEffect(() => {
    let alive = true;
    Promise.all([getCatalog('items'), getCatalog('suppliers')]).then(([nextItems, nextSuppliers]) => {
      if (alive) { setItems(nextItems); setSuppliers(nextSuppliers); }
    }).catch(err => { if (alive) setError(friendlyError(err)); });
    return () => { alive = false; };
  }, [version]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { setPage(0); }, [query, supplier, month, allDates]);
  const filtered = useMemo(() => filterLines(lines, query, supplier), [lines, query, supplier]);
  const itemTotals = useMemo(() => summarizeItems(filtered), [filtered]);
  const supplierTotals = useMemo(() => summarizeSuppliers(filtered), [filtered]);
  const invoiceCount = new Set(filtered.map(l => l.purchase_id)).size;
  useEffect(() => { setPage(current => Math.min(current, Math.max(0, Math.ceil(filtered.length / 50) - 1))); }, [filtered.length]);
  function go(next: WorkspaceRoute) {
    if (saving || (next.area === area && next.mode === mode) || (!manager && next.area === 'management')) return;
    if (dirty && !window.confirm('This purchase has not been saved. Leave this page?')) return;
    setDirty(false); setRoute(next); setNotice(''); setError(''); setPurchase(null);
    if (next.mode !== 'history') setAllDates(false);
    if (next.area !== area || next.mode === 'dashboard' || next.mode === 'suppliers') { setQuery(''); setSupplier(''); setAllDates(false); }
  }
  function navigate(next: Mode) {
    go({ area: next === 'entry' ? 'staff' : next === 'history' ? area : 'management', mode: next });
  }
  function supplierPurchases(id: string) { navigate('history'); setQuery(''); setSupplier(id); setPage(0); }
  function itemPurchases(name: string) { navigate('history'); setSupplier(''); setQuery(name); setPage(0); }
  function clearFilters() { setQuery(''); setSupplier(''); setAllDates(false); }
  async function exportReport() {
    setExporting(true); setError('');
    try {
      const { downloadExcel } = await import('./export');
      await downloadExcel(filtered, allDates ? 'All dates' : month);
    } catch { setError('The Excel export failed. Please try again.'); }
    finally { setExporting(false); }
  }
  const nav = management ? [
    { mode: 'dashboard' as Mode, title: 'Dashboard', short: 'Dashboard', Icon: LayoutDashboard },
    { mode: 'history' as Mode, title: 'Purchases', short: 'Purchases', Icon: ClipboardList },
    { mode: 'reports' as Mode, title: 'Monthly reports', short: 'Reports', Icon: FileBarChart2 },
    { mode: 'suppliers' as Mode, title: 'Suppliers', short: 'Suppliers', Icon: Store },
  ] : [
    { mode: 'entry' as Mode, title: 'Add purchase', short: 'Add purchase', Icon: Plus },
    { mode: 'history' as Mode, title: 'My purchases', short: 'My purchases', Icon: ClipboardList },
  ];
  const screenTitle = mode === 'entry' ? 'Add a purchase' : mode === 'dashboard' ? 'Dashboard' : mode === 'reports' ? 'Monthly reports' : mode === 'suppliers' ? 'Suppliers' : management ? 'Purchases' : 'My purchases';
  const period = allDates ? 'All dates' : monthLabel(month);
  const unresolved = loading || Boolean(error);
  const actions = <div className="button-row"><button className="icon-button refresh" onClick={refresh} disabled={loading} aria-label="Refresh records" title="Refresh records">{loading ? <Spinner /> : <RefreshCw size={17} />}</button><button className="secondary" disabled={loading || exporting || !filtered.length} onClick={exportReport}>{exporting ? <Spinner /> : <ArrowDownToLine size={16} />}Export Excel</button></div>;
  return <div className={`app-shell ${management ? 'management-shell' : 'staff-shell'}${mode === 'entry' ? ' is-entering' : ''}`}>
    <aside className="sidebar"><Brand /><div className="restaurant-tag"><span className="live-dot" />{management ? 'Management' : 'Staff workspace'}<span className="tag">{manager ? 'Manager' : 'Staff'}</span></div><span className="nav-label">{management ? 'MANAGE YOUR RESTAURANT' : 'DAILY PURCHASES'}</span>
      <nav aria-label="Main navigation">{nav.map(({ mode: next, title, short, Icon }) => <button key={next} className={mode === next ? 'nav-link active' : 'nav-link'} aria-label={title} aria-current={mode === next ? 'page' : undefined} disabled={saving} onClick={() => navigate(next)}><Icon size={19} aria-hidden="true" /><span className="nav-label-full">{title}</span><span className="nav-label-short" aria-hidden="true">{short}</span></button>)}</nav>
      <div className="sidebar-note"><ShieldCheck size={22} /><strong>{management ? 'Your restaurant, in view' : 'One shared restaurant ledger'}</strong><p>{management ? 'Purchases entered by approved staff appear in your management workspace.' : 'Record one invoice at a time. Your manager can review the saved details.'}</p></div>
      <div className="profile"><span className="avatar" title={manager ? 'Manager account' : 'Staff account'}>{manager ? 'M' : 'S'}</span><div><strong>{manager ? 'Manager' : 'Staff member'}</strong><small title={session.user.email}>{session.user.email}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" disabled={saving} onClick={() => { if (!dirty || window.confirm('You have unsaved changes. Sign out and discard them?')) void logout(); }}><LogOut size={18} /></button></div>
    </aside>
    <main className="main"><div className="topbar"><span>{management ? 'Management workspace' : 'Staff workspace'}<span className="slash">/</span><strong>{screenTitle}</strong></span><span className="today">{dateLabel(today())} · Malaysia time</span></div><div className="main-content">
      <div className="workspace-strip"><span><ShieldCheck size={15} aria-hidden="true" />{management ? 'Management workspace' : 'Staff workspace'}</span>{manager && <button className="secondary workspace-switch" disabled={saving} onClick={() => go(management ? { area: 'staff', mode: 'entry' } : { area: 'management', mode: 'dashboard' })}>{management ? <Plus size={16} aria-hidden="true" /> : <LayoutDashboard size={16} aria-hidden="true" />}{management ? 'Staff workspace' : 'Back to management'}</button>}</div>
      <header className="page-heading"><div><span className="eyebrow">{management ? 'RESTAURANT MANAGEMENT' : 'DAILY PURCHASES'}</span><h1>{screenTitle}<span className="heading-dot">.</span></h1><p>{mode === 'entry' ? 'One invoice. Add your items, check the total, then save.' : management ? 'Review spending, check invoices and find the records you need.' : 'Your saved purchases and receipt photos.'}</p></div>{!management && mode !== 'entry' && <button className="primary" onClick={() => navigate('entry')}><Plus size={18} />Add purchase</button>}</header>
      {authError && <Message>{authError}</Message>}{notice && <Message success><CheckCircle2 size={18} /><span>{notice}</span><button className="text-button" onClick={() => navigate('entry')}>Add another</button></Message>}{error && <Message>{error}<button className="text-button" onClick={refresh}>Try again</button></Message>}
      {mode === 'entry' ? <EntryForm userId={session.user.id} items={items} suppliers={suppliers} onDirty={setDirty} onSaving={setSaving} onSaved={(date) => { setDirty(false); setSaving(false); setMonth(date.slice(0, 7)); setAllDates(false); setQuery(''); setSupplier(''); setPage(0); setNotice('Purchase saved.'); setRoute({ area: 'staff', mode: 'history' }); refresh(); }} /> : <>
        {mode === 'dashboard' && <div className="dashboard-toolbar"><label>Purchase month<input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label>{actions}</div>}
        <section className={`stats${management ? ' management-stats' : ''}`} aria-label="Purchase summary"><Stat title={allDates ? 'Selected spending' : 'Monthly spending'} value={unresolved ? '—' : money(totalAmount(filtered))} detail={management ? 'Restaurant purchases · MYR' : 'My purchases · MYR'} icon={<Wallet size={21} />} primary /><Stat title="Invoices" value={unresolved ? '—' : String(invoiceCount)} detail="Each invoice is counted once" icon={<ClipboardList size={21} />} />{management && <Stat title="Suppliers" value={unresolved ? '—' : String(supplierTotals.length)} detail="Suppliers with purchases" icon={<Store size={21} />} />}<Stat title="Items purchased" value={unresolved ? '—' : String(new Set(filtered.map(l => l.item_id)).size)} detail="Different purchased items" icon={<ShoppingBasket size={21} />} /></section>
        {mode === 'dashboard' ? loading ? <div className="empty"><Spinner /><p>Loading purchases…</p></div> : !error && <ManagementDashboard lines={filtered} onPurchases={() => navigate('history')} onSupplier={supplierPurchases} onItem={itemPurchases} onPurchase={setPurchase} /> : <section className={`records-panel${mode === 'history' ? ' purchase-records' : ''}`}>
          <div className="panel-heading"><div><h2>{mode === 'reports' ? 'Purchase summaries' : mode === 'suppliers' ? 'Supplier spending' : 'Purchase history'}</h2><p>{period}{query || supplier ? ' · Filtered' : ' · All purchases'}</p></div>{actions}</div>
          <div className="filters data-filters">{mode !== 'suppliers' && <label className="filter-label search-filter"><span>Item search</span><span className="search-field"><Search size={17} aria-hidden="true" /><input aria-label="Search items" placeholder="e.g. Cooking Oil" value={query} onChange={e => setQuery(e.target.value)} /></span></label>}{mode !== 'suppliers' && <label className="filter-label"><span>Supplier</span><select aria-label="Filter suppliers" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">All suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<label className="filter-label"><span>Purchase month</span><input type="month" value={month} disabled={allDates} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label>{mode === 'history' && <label className="check-label"><input type="checkbox" checked={allDates} onChange={e => setAllDates(e.target.checked)} />All dates</label>}{(query || supplier || allDates) && <button className="text-button clear-filters" onClick={clearFilters}>Clear filters</button>}</div>
          {loading ? <div className="empty"><Spinner /><p>Loading purchases…</p></div> : error ? <div className="empty"><p>Unable to load records. Please try again.</p></div> : !filtered.length ? <div className="empty"><span className="empty-icon"><ShoppingBasket size={28} /></span><h3>{query || supplier ? 'No matching purchases' : 'No purchases in this period yet'}</h3><p>{query || supplier ? 'Try another item name, supplier or month.' : management ? 'Staff purchases will appear here after they are saved.' : 'Add your first invoice to start tracking purchases.'}</p>{query || supplier ? <button className="secondary" onClick={clearFilters}>Clear filters</button> : <button className="secondary" onClick={() => navigate('entry')}><Plus size={16} />{management ? 'Open staff workspace' : 'Add your first purchase'}</button>}</div> : mode === 'reports' ? <Reports lines={filtered} tab={reportTab} onTab={setReportTab} onItem={itemPurchases} /> : mode === 'suppliers' ? <SupplierOverview lines={filtered} onSupplier={supplierPurchases} /> : <><PurchaseHistory lines={filtered.slice(page * 50, page * 50 + 50)} onPurchase={line => setPurchase(lines.filter(item => item.purchase_id === line.purchase_id))} /><div className="table-footer"><span>Lines: {filtered.length} · Invoices: {invoiceCount}</span><div className="pagination"><button className="text-button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>Previous</button><span>{Math.min(page + 1, Math.ceil(filtered.length / 50))} / {Math.ceil(filtered.length / 50)}</span><button className="text-button" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(v => v + 1)}>Next</button></div></div></>}
        </section>}
        {!loading && !error && itemTotals.length > 0 && <p className="page-note"><ShieldCheck size={15} />{management ? 'Shared restaurant records' : 'Your purchase records'} · Refreshes every minute. Use refresh to check for new purchases.</p>}
      </>}
      <footer className="footer"><span>Restaurant Ledger · {management ? 'Management workspace' : 'Staff workspace'}</span><span>MYR · Malaysia</span></footer>
    </div></main>{purchase && <PurchaseDetails lines={purchase} onClose={() => setPurchase(null)} />}
  </div>;
}

function Stat({ title, value, detail, icon, primary }: { title: string; value: string; detail: string; icon: ReactNode; primary?: boolean }) {
  return <div className={`stat ${primary ? 'stat-primary' : ''}`}><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function newLine(): DraftLine { return { key: crypto.randomUUID(), name: '', quantity: '', unit: 'kg', amount: '' }; }
function EntryForm({ userId, items, suppliers, onSaved, onDirty, onSaving }: { userId: string; items: CatalogEntry[]; suppliers: CatalogEntry[]; onSaved: (date: string) => void; onDirty: (value: boolean) => void; onSaving: (value: boolean) => void }) {
  const [date, setDate] = useState(today());
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const uploadedPath = useRef('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveUncertain, setSaveUncertain] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const previousLineCount = useRef(lines.length);
  useEffect(() => {
    if (lines.length > previousLineCount.current) {
      const input = document.getElementById(`item-name-${lines[lines.length - 1].key}`);
      input?.focus();
      input?.scrollIntoView({ block: 'center' });
    }
    previousLineCount.current = lines.length;
  }, [lines]);
  useEffect(() => {
    if (error) {
      feedback.current?.scrollIntoView({ block: 'center' });
      feedback.current?.focus({ preventScroll: true });
    }
  }, [error]);
  const total = lines.reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0) / 100;
  function change(key: string, patch: Partial<DraftLine>) {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || preparingPhoto) return;
    setError('');
    const validation = validateDraft(date, supplier, lines);
    if (validation) { setError(validation); return; }
    setBusy(true); onSaving(true);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let submitted = false;
    const path = photo ? receiptPath(userId, requestId, photo.key) : null;
    try {
      if (photo && path && uploadedPath.current !== path) {
        await uploadReceipt(path, photo);
        uploadedPath.current = path;
      }
      submitted = true;
      const { error: rpcError } = await supabase!.rpc(path ? 'restaurant_save_purchase_with_receipt' : 'restaurant_save_purchase', {
        ...(path ? { p_receipt_path: path } : {}),
        p_id: requestId, p_date: date, p_supplier: supplier.trim(), p_invoice: invoice.trim() || null,
        p_notes: notes.trim() || null,
        p_lines: lines.map(line => ({ name: line.name.trim(), quantity: line.quantity, unit: line.unit, amount: line.amount })),
      });
      if (rpcError) throw rpcError;
      onSaved(date);
    } catch (err) {
      setSaveUncertain(submitted);
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      const message = typeof err === 'object' && err && 'message' in err ? String(err.message) : '';
      setError(!submitted ? 'The receipt photo could not be uploaded. Your purchase has not been submitted. Try again, or remove the photo to save without it. If this keeps happening, ask your administrator to check receipt storage setup.' : path && code === 'PGRST202' ? 'Receipt storage is not ready. Contact your restaurant administrator, then retry. You can remove the photo to save without it.' : message.includes('already saved') ? 'This invoice has already been saved. Check Purchase overview before adding another invoice.' : friendlyError(err));
    } finally { setBusy(false); onSaving(false); }
  }
  return <form className="entry-layout" onSubmit={submit} onChange={() => onDirty(true)}>
    {error && <div className="entry-feedback" ref={feedback} tabIndex={-1}><Message>{error}</Message>{saveUncertain && <p className="fine-print">Check Purchase overview if the connection dropped. Retrying the same invoice will not create a duplicate.</p>}</div>}
    <div className="entry-main"><div className="entry-assurance"><ShieldCheck size={21} aria-hidden="true" /><div><strong>Approved restaurant accounts only</strong><span>Purchases are saved to your shared restaurant ledger.</span></div></div><section className="form-panel"><div className="section-title"><span className="step">01</span><div><h2>Invoice details</h2><p>Record multiple items from the same supplier on one invoice.</p></div></div><div className="form-grid"><label>Purchase date <span className="required">*</span><input type="date" required value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label><label>Supplier name <span className="required">*</span><input list="supplier-options" required maxLength={200} placeholder="Select or enter supplier" value={supplier} disabled={busy} onChange={e => setSupplier(e.target.value)} /></label></div><datalist id="supplier-options">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist></section>
      <section className="form-panel"><div className="section-title"><span className="step">02</span><div><h2>Items purchased</h2><p>Enter the line total for each item, rather than its unit price.</p></div></div><div className="entry-lines">{lines.map((line, index) => <div className="entry-line" key={line.key}><div className="line-top"><span>Item {String(index + 1).padStart(2, '0')}</span><button type="button" className="icon-button" aria-label={`Remove item ${index + 1}`} disabled={busy || lines.length === 1} onClick={() => { setLines(current => current.filter(l => l.key !== line.key)); onDirty(true); }}><Trash2 size={16} /></button></div><div className="line-grid"><label>Item name<input id={`item-name-${line.key}`} aria-label={`Item ${index + 1} name`} enterKeyHint="next" list="item-options" maxLength={200} placeholder="e.g. Cooking Oil" required disabled={busy} value={line.name} onChange={e => change(line.key, { name: e.target.value })} /></label><label>Quantity<input aria-label={`Item ${index + 1} quantity`} type="number" inputMode="decimal" min="0.001" max="999999999.999" step="0.001" placeholder="0" required disabled={busy} value={line.quantity} onChange={e => change(line.key, { quantity: e.target.value })} /></label><label>Unit<select aria-label={`Item ${index + 1} unit`} disabled={busy} value={line.unit} onChange={e => change(line.key, { unit: e.target.value as DraftLine['unit'] })}>{UNITS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Amount RM<input aria-label={`Item ${index + 1} amount`} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="0.00" required disabled={busy} value={line.amount} onChange={e => change(line.key, { amount: e.target.value })} /></label></div>{Number(line.quantity) > 0 && line.amount !== '' && <span className="line-price">Unit price: {money(Number(line.amount) / Number(line.quantity))} / {line.unit}</span>}</div>)}</div><datalist id="item-options">{items.map(item => <option key={item.id} value={item.name} />)}</datalist><button className="add-line" type="button" disabled={busy || lines.length >= 100} onClick={() => { setLines(current => [...current, newLine()]); onDirty(true); }}><Plus size={17} />Add another item</button></section>
      <details className="form-panel optional-details"><summary>Invoice number &amp; notes <span className="optional">optional</span></summary><div className="optional-fields"><label>Invoice number<input maxLength={200} placeholder="e.g. INV-2026-001" value={invoice} disabled={busy} onChange={e => setInvoice(e.target.value)} /></label><label>Notes<textarea aria-label="Notes" maxLength={2000} rows={3} value={notes} disabled={busy} placeholder="e.g. delivery details or purchase notes…" onChange={e => setNotes(e.target.value)} /></label></div></details>
      <ReceiptPhotoField photo={photo} disabled={busy} onChange={value => { setPhoto(value); onDirty(true); }} onPreparing={value => { setPreparingPhoto(value); onSaving(value); if (value) onDirty(true); }} />
    </div><aside className="invoice-summary"><span className="eyebrow">PURCHASE SUMMARY</span><h2>This purchase</h2><div className="summary-line"><span>Purchase date</span><strong>{date ? dateLabel(date) : 'Not entered'}</strong></div><div className="summary-line"><span>Supplier</span><strong>{supplier || 'Not entered'}</strong></div><div className="summary-line"><span>Line items</span><strong>{lines.length}</strong></div><div className="invoice-total"><span>Total amount</span><strong>{money(total)}</strong><small>All line totals · MYR</small></div><button type="submit" className="primary full desktop-save" disabled={busy || preparingPhoto}>{busy ? <Spinner /> : <CheckCircle2 size={18} />}{busy ? 'Saving…' : 'Save purchase'}</button><p className="fine-print"><ShieldCheck size={14} />All items are saved together. You’ll see a confirmation when your purchase is saved.</p></aside>
    <div className="mobile-savebar"><div><span>Total · {lines.length} {lines.length === 1 ? 'item' : 'items'}</span><strong>{money(total)}</strong></div><button type="submit" className="primary" disabled={busy || preparingPhoto}>{busy ? <Spinner /> : <CheckCircle2 size={18} />}{busy ? 'Saving…' : 'Save purchase'}</button></div>
  </form>;
}
