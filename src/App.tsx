import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, ChefHat, ClipboardList, FileBarChart2, Leaf, Loader2, LogOut, Plus, RefreshCw, Search, ShieldCheck, ShoppingBasket, Trash2, Wallet } from 'lucide-react';
import { configured, friendlyError, supabase } from './client';
import { getCatalog, getHistory } from './api';
import { dateLabel, filterLines, money, quantity, summarizeItems, summarizeSuppliers, today, totalAmount, UNITS, validateDraft, type CatalogEntry, type DraftLine, type PurchaseLine } from './domain';

type Mode = 'history' | 'entry' | 'reports';
type Member = { active: boolean; role: 'manager' | 'staff' };
const navItems = [
  { mode: 'history' as Mode, title: '采购总览', Icon: ClipboardList },
  { mode: 'entry' as Mode, title: '记录采购', Icon: Plus },
  { mode: 'reports' as Mode, title: '月度报表', Icon: FileBarChart2 },
];
function Spinner() { return <Loader2 size={18} className="spin" aria-label="加载中" />; }
function Message({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div className={`message ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>{children}</div>;
}
function Brand() { return <div className="brand"><span className="brand-icon"><ChefHat size={24} /></span><div>餐账<span>RESTAURANT LEDGER</span></div></div>; }

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
      if (sessionError) setError('无法恢复登录状态，请重新登录。');
      setSession(data.session); setInitializing(false);
    }).catch(() => { if (alive) { setError('无法连接登录服务，请刷新重试。'); setInitializing(false); } });
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
      }, () => { if (alive) { setError('暂时无法读取账号权限，请重试。'); setMemberLoading(false); } });
    return () => { alive = false; };
  }, [session?.user.id, retry]);
  const logout = async () => {
    const { error: signoutError } = await supabase!.auth.signOut({ scope: 'local' });
    if (signoutError) { setError('退出失败，请重试。'); return; }
    setMember(null); setSession(null);
  };
  if (!configured) return <div className="auth-layout"><section className="auth-card"><Brand /><span className="eyebrow">一起把每一笔，记清楚</span><h1>餐厅账本正在准备中</h1><p>连接完成后，就能在这里登录、记录采购和查看报表。请联系管理员完成连接。</p><div className="quiet-box"><ShieldCheck size={22} /><span>采购记录将保存在餐厅的共享数据库中。</span></div></section></div>;
  if (initializing) return <div className="center-state"><Spinner /><p>正在打开餐厅账本…</p></div>;
  if (!session) return <Login />;
  if (memberLoading) return <div className="center-state"><Spinner /><p>正在确认账号权限…</p></div>;
  if (!member?.active || error) return <div className="auth-layout"><section className="auth-card"><Brand /><h1>{error ? '暂时无法读取账号' : '等待管理员启用'}</h1><p>{error || '你的账号已登录，但还未启用。请让管理员在 Supabase 中确认账号权限。'}</p><p className="subtle">{session.user.email}</p><div className="button-row"><button onClick={() => setRetry(v => v + 1)} className="primary"><RefreshCw size={16} />重新检查</button><button onClick={logout} className="secondary">退出登录</button></div></section></div>;
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
      if (result.error) setError(result.error.message === 'Invalid login credentials' ? '邮箱或密码不正确，请检查后重试。' : '登录失败，请检查网络和账号状态后重试。');
    } catch { setError('无法连接登录服务，请检查网络。'); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout"><section className="auth-intro"><Brand /><div><span className="eyebrow">餐厅的每一笔，都心中有数。</span><h1>好好经营，<br />从记好每笔采购开始。</h1><p>每日采购 · 月度汇总 · 供应商支出<br />一本账，连接厨房与管理。</p></div><span className="intro-foot"><Leaf size={18} /> 为日常忙碌的餐厅而做</span></section><section className="auth-card login-card"><span className="eyebrow">欢迎回来</span><h2>登录你的餐厅账本</h2><p>使用管理员为你开通的账号。</p><form onSubmit={submit}><label>邮箱<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>密码<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入登录密码" /></label>{error && <Message>{error}</Message>}<button className="primary full" disabled={busy}>{busy ? <Spinner /> : <ArrowUpRight size={18} />} {busy ? '正在登录…' : '登录'}</button></form><p className="fine-print">需要开通账号或重设密码？请联系餐厅管理员。</p></section></div>;
}

function Workspace({ session, member, logout, authError }: { session: Session; member: Member; logout: () => Promise<void>; authError: string }) {
  const [mode, setMode] = useState<Mode>('history');
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
  const manager = member.role === 'manager';
  const refresh = useCallback(() => setVersion(v => v + 1), []);
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
    getHistory(month, allDates).then(data => {
      if (alive) { setLines(data); setLoading(false); }
    }).catch(err => { if (alive) { setError(friendlyError(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [month, allDates, version, mode]);
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
  useEffect(() => {
    setPage(current => Math.min(current, Math.max(0, Math.ceil(filtered.length / 50) - 1)));
  }, [filtered.length]);
  function navigate(next: Mode) {
    if (saving) return;
    if (mode === 'entry' && dirty && !window.confirm('采购还没有保存，确定离开吗？')) return;
    setDirty(false); setMode(next); setNotice(''); setError('');
    if (next === 'reports') setAllDates(false);
  }
  async function exportReport() {
    setExporting(true); setError('');
    try {
      const { downloadExcel } = await import('./export');
      await downloadExcel(filtered, allDates ? '全部日期' : month);
    } catch { setError('Excel 导出失败，请重试。'); }
    finally { setExporting(false); }
  }
  const screenTitle = mode === 'entry' ? '记下今天的采购' : mode === 'reports' ? '月度报表' : '采购总览';
  return <div className="app-shell"><aside className="sidebar"><Brand /><div className="restaurant-tag"><span className="live-dot" /> 我的餐厅<span className="tag">{manager ? '管理端' : '员工端'}</span></div><span className="nav-label">工作台</span><nav aria-label="主导航">{navItems.filter(n => manager || n.mode !== 'reports').map(({ mode: next, title, Icon }) => <button key={next} className={mode === next ? 'nav-link active' : 'nav-link'} aria-current={mode === next ? 'page' : undefined} disabled={saving} onClick={() => navigate(next)}><Icon size={19} />{title}{next === 'entry' && <span className="nav-plus">＋</span>}</button>)}</nav><div className="sidebar-note"><Leaf size={22} /><strong>采购有记录，经营有底气。</strong><p>一张单据，记下多个商品。<br />月底汇总，少一点忙乱。</p></div><div className="profile"><span className="avatar">{manager ? '管' : '员'}</span><div><strong>{manager ? '餐厅管理员' : '采购员工'}</strong><small title={session.user.email}>{session.user.email}</small></div><button className="icon-button" aria-label="退出登录" title="退出登录" disabled={saving} onClick={() => { if (!dirty || window.confirm('未保存的内容将丢失，确定退出吗？')) void logout(); }}><LogOut size={18} /></button></div></aside>
    <main className="main"><div className="topbar"><span>我的餐厅 <span className="slash">/</span> <strong>{screenTitle}</strong></span><span className="today"><span className="live-dot" /> {dateLabel(today())} · 马来西亚时间</span></div><div className="main-content"><header className="page-heading"><div><span className="eyebrow">{mode === 'entry' ? 'DAILY PURCHASES' : mode === 'reports' ? 'MONTHLY INSIGHTS' : 'YOUR RESTAURANT, AT A GLANCE'}</span><h1>{screenTitle}<span className="heading-dot">.</span></h1><p>{mode === 'entry' ? '把单据放在手边，逐项记录就好。' : manager ? '从每一笔采购，看清餐厅的日常开支。' : '这里显示你自己录入的采购，管理端可查看全店记录。'}</p></div>{mode !== 'entry' && <button className="primary" onClick={() => navigate('entry')}><Plus size={18} />记录采购</button>}</header>
      {authError && <Message>{authError}</Message>}{notice && <Message success><CheckCircle2 size={18} />{notice}</Message>}{error && <Message>{error}<button className="text-button" onClick={refresh}>重试</button></Message>}
      {mode === 'entry' ? <EntryForm items={items} suppliers={suppliers} onDirty={setDirty} onSaving={setSaving} onSaved={(date) => { setDirty(false); setSaving(false); setMonth(date.slice(0, 7)); setAllDates(false); setQuery(''); setSupplier(''); setPage(0); setNotice('采购已保存，所有商品已一起记入账本。'); setMode('history'); refresh(); }} /> : <>
        <section className="stats" aria-label="采购概况"><Stat title={allDates ? '所选记录支出' : '本月所选支出'} value={loading ? '—' : money(totalAmount(filtered))} detail={manager ? '全店采购 · RM 马币' : '我的采购 · RM 马币'} icon={<Wallet size={21} />} primary /><Stat title="采购单据" value={loading ? '—' : String(invoiceCount)} detail="同张单据只计一次" icon={<ClipboardList size={21} />} /><Stat title="采购商品" value={loading ? '—' : String(new Set(filtered.map(l => l.item_id)).size)} detail={loading ? '正在读取记录' : `来自 ${supplierTotals.length} 家供应商`} icon={<ShoppingBasket size={21} />} /></section>
        <section className="records-panel"><div className="panel-heading"><div><h2>{mode === 'reports' ? '每一份采购，都有迹可循' : '采购记录'}</h2><p>{allDates ? '全部日期' : `${month.replace('-', ' 年 ')} 月`}{query || supplier ? ' · 已筛选' : ' · 所有商品'}</p></div><div className="button-row"><button className="icon-button refresh" onClick={refresh} disabled={loading} aria-label="刷新记录" title="刷新记录">{loading ? <Spinner /> : <RefreshCw size={17} />}</button><button className="secondary" disabled={loading || exporting || !filtered.length} onClick={exportReport}>{exporting ? <Spinner /> : <ArrowDownToLine size={16} />}导出 Excel</button></div></div>
          <div className="filters"><label className="search-field"><Search size={17} /><input aria-label="搜索商品" placeholder="搜索商品，例如：Cooking Oil" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="sr-only" htmlFor="supplier-filter">筛选供应商</label><select id="supplier-filter" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">所有供应商</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><label className="sr-only" htmlFor="month-filter">采购月份</label><input id="month-filter" type="month" value={month} disabled={allDates} onChange={e => { if (e.target.value) setMonth(e.target.value); }} />{mode === 'history' && <label className="check-label"><input type="checkbox" checked={allDates} onChange={e => setAllDates(e.target.checked)} />全部日期</label>}</div>
          {loading ? <div className="empty"><Spinner /><p>正在读取采购记录…</p></div> : error ? <div className="empty"><p>记录暂时无法读取，请点击重试。</p></div> : !filtered.length ? <div className="empty"><span className="empty-icon"><ShoppingBasket size={28} /></span><h3>{query || supplier ? '没有找到符合条件的采购' : '这个月份还没有采购记录'}</h3><p>{query || supplier ? '试试其他商品名称、供应商，或选择其他月份。' : '录入第一张单据，开始整理餐厅的日常采购。'}</p>{query || supplier ? <button className="secondary" onClick={() => { setQuery(''); setSupplier(''); }}>清除筛选</button> : <button className="secondary" onClick={() => navigate('entry')}><Plus size={16} />记录第一笔采购</button>}</div> : mode === 'reports' ? <Reports lines={filtered} onItem={(name) => { setQuery(name); setMode('history'); setPage(0); }} /> : <><div className="table-scroll"><table className="history-table"><thead><tr><th>采购日期 / 供应商</th><th>商品</th><th className="number">数量</th><th className="number">单价 RM</th><th className="number">金额 RM</th></tr></thead><tbody>{filtered.slice(page * 50, page * 50 + 50).map(line => <tr key={line.id}><td><strong>{dateLabel(line.purchase_date)}</strong><small>{line.supplier_name}{line.invoice_number ? ` · ${line.invoice_number}` : ''}</small></td><td><span className="item-name">{line.item_name}</span></td><td className="number">{quantity(Number(line.quantity))} <span className="unit">{line.unit}</span></td><td className="number subtle">{quantity(Number(line.unit_price))}</td><td className="number amount">{Number(line.total_amount).toFixed(2)}</td></tr>)}</tbody></table></div><div className="table-footer"><span>共 {filtered.length} 项明细 · {invoiceCount} 张单据</span><div className="pagination"><button className="text-button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>上一页</button><span>{Math.min(page + 1, Math.ceil(filtered.length / 50))} / {Math.ceil(filtered.length / 50)}</span><button className="text-button" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(v => v + 1)}>下一页</button></div></div></>}
        </section>{mode !== 'reports' && !loading && itemTotals.length > 0 && <p className="page-note"><ShieldCheck size={15} />记录保存在共享数据库中。页面每分钟更新，也可点击刷新查看最新采购。</p>}
      </>}
      <footer className="footer"><span>餐账 · 把账记清，把餐厅经营好。</span><span>MYR · 马来西亚</span></footer></div></main></div>;
}

function Stat({ title, value, detail, icon, primary }: { title: string; value: string; detail: string; icon: ReactNode; primary?: boolean }) {
  return <div className={`stat ${primary ? 'stat-primary' : ''}`}><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function Reports({ lines, onItem }: { lines: PurchaseLine[]; onItem: (name: string) => void }) {
  const [tab, setTab] = useState<'items' | 'suppliers'>('items');
  const items = summarizeItems(lines);
  const suppliers = summarizeSuppliers(lines);
  return <><div className="report-tabs"><button className={tab === 'items' ? 'selected' : ''} onClick={() => setTab('items')}>按商品汇总</button><button className={tab === 'suppliers' ? 'selected' : ''} onClick={() => setTab('suppliers')}>按供应商汇总</button></div><div className="table-scroll">{tab === 'items' ? <table><thead><tr><th>商品</th><th>单位</th><th className="number">总数量</th><th className="number">总金额 RM</th><th /></tr></thead><tbody>{items.map(item => <tr key={`${item.itemId}:${item.unit}`}><td><strong>{item.item}</strong></td><td><span className="unit-tag">{item.unit}</span></td><td className="number">{quantity(item.quantity)}</td><td className="number amount">{item.amount.toFixed(2)}</td><td><button className="text-button" onClick={() => onItem(item.item)}>查看明细 <ArrowUpRight size={14} /></button></td></tr>)}</tbody></table> : <table><thead><tr><th>供应商</th><th className="number">采购单据数</th><th className="number">支出 RM</th></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.supplier}><td><strong>{supplier.supplier}</strong></td><td className="number">{supplier.invoices}</td><td className="number amount">{supplier.amount.toFixed(2)}</td></tr>)}</tbody></table>}</div><div className="table-footer"><span>不同单位分别统计，不自动换算。</span><strong>合计 {money(totalAmount(lines))}</strong></div></>;
}

function newLine(): DraftLine { return { key: crypto.randomUUID(), name: '', quantity: '', unit: 'kg', amount: '' }; }
function EntryForm({ items, suppliers, onSaved, onDirty, onSaving }: { items: CatalogEntry[]; suppliers: CatalogEntry[]; onSaved: (date: string) => void; onDirty: (value: boolean) => void; onSaving: (value: boolean) => void }) {
  const [date, setDate] = useState(today());
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveUncertain, setSaveUncertain] = useState(false);
  const total = lines.reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0) / 100;
  function change(key: string, patch: Partial<DraftLine>) {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const validation = validateDraft(date, supplier, lines);
    if (validation) { setError(validation); return; }
    setBusy(true); onSaving(true);
    try {
      const { error: rpcError } = await supabase!.rpc('restaurant_save_purchase', {
        p_id: requestId, p_date: date, p_supplier: supplier.trim(), p_invoice: invoice.trim() || null,
        p_notes: notes.trim() || null,
        p_lines: lines.map(line => ({ name: line.name.trim(), quantity: line.quantity, unit: line.unit, amount: line.amount })),
      });
      if (rpcError) throw rpcError;
      onSaved(date);
    } catch (err) {
      setSaveUncertain(true);
      const message = typeof err === 'object' && err && 'message' in err ? String(err.message) : '';
      setError(message.includes('already saved') ? '这张单据已保存过。请先返回采购总览确认记录，再录入下一张。' : friendlyError(err));
    } finally { setBusy(false); onSaving(false); }
  }
  return <form className="entry-layout" onSubmit={submit} onChange={() => onDirty(true)}>
    <div className="entry-main"><section className="form-panel"><div className="section-title"><span className="step">01</span><div><h2>单据信息</h2><p>同一供应商的多个商品，可以一起记录。</p></div></div><div className="form-grid"><label>采购日期 <span className="required">*</span><input type="date" required value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label><label>供应商名称 <span className="required">*</span><input list="supplier-options" required maxLength={200} placeholder="选择已有供应商，或输入新名称" value={supplier} disabled={busy} onChange={e => setSupplier(e.target.value)} /></label><label className="span-two">单据编号 <span className="optional">选填</span><input maxLength={200} placeholder="例如 INV-2026-001" value={invoice} disabled={busy} onChange={e => setInvoice(e.target.value)} /></label></div><datalist id="supplier-options">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist></section>
      <section className="form-panel"><div className="section-title"><span className="step">02</span><div><h2>采购商品</h2><p>金额填写该商品的小计，而不是单价。</p></div></div><div className="entry-lines">{lines.map((line, index) => <div className="entry-line" key={line.key}><div className="line-top"><span>商品 {String(index + 1).padStart(2, '0')}</span><button type="button" className="icon-button" aria-label={`删除商品 ${index + 1}`} disabled={busy || lines.length === 1} onClick={() => { setLines(current => current.filter(l => l.key !== line.key)); onDirty(true); }}><Trash2 size={16} /></button></div><div className="line-grid"><label>商品名称<input aria-label={`商品 ${index + 1} 名称`} list="item-options" maxLength={200} placeholder="例如 Cooking Oil" required disabled={busy} value={line.name} onChange={e => change(line.key, { name: e.target.value })} /></label><label>数量<input aria-label={`商品 ${index + 1} 数量`} type="number" inputMode="decimal" min="0.001" max="999999999.999" step="0.001" placeholder="0" required disabled={busy} value={line.quantity} onChange={e => change(line.key, { quantity: e.target.value })} /></label><label>单位<select aria-label={`商品 ${index + 1} 单位`} disabled={busy} value={line.unit} onChange={e => change(line.key, { unit: e.target.value as DraftLine['unit'] })}>{UNITS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>金额 RM<input aria-label={`商品 ${index + 1} 金额`} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="0.00" required disabled={busy} value={line.amount} onChange={e => change(line.key, { amount: e.target.value })} /></label></div>{Number(line.quantity) > 0 && line.amount !== '' && <span className="line-price">单价参考：{money(Number(line.amount) / Number(line.quantity))} / {line.unit}</span>}</div>)}</div><datalist id="item-options">{items.map(item => <option key={item.id} value={item.name} />)}</datalist><button className="add-line" type="button" disabled={busy || lines.length >= 100} onClick={() => { setLines(current => [...current, newLine()]); onDirty(true); }}><Plus size={17} />再加一项商品</button></section>
      <section className="form-panel"><label>备注 <span className="optional">选填</span><textarea maxLength={2000} rows={3} value={notes} disabled={busy} placeholder="例如：送货费用、采购说明…" onChange={e => setNotes(e.target.value)} /></label></section>
    </div><aside className="invoice-summary"><span className="eyebrow">PURCHASE SUMMARY</span><h2>本次采购</h2><div className="summary-line"><span>采购日期</span><strong>{date ? dateLabel(date) : '未填写'}</strong></div><div className="summary-line"><span>供应商</span><strong>{supplier || '未填写'}</strong></div><div className="summary-line"><span>商品项数</span><strong>{lines.length} 项</strong></div><div className="invoice-total"><span>合计金额</span><strong>{money(total)}</strong><small>所有商品小计 · 马币</small></div>{error && <Message>{error}</Message>}{saveUncertain && <p className="fine-print">如果网络中断，先查看采购总览确认是否已保存。重试同一张单据不会重复记账。</p>}<button type="submit" className="primary full" disabled={busy}>{busy ? <Spinner /> : <CheckCircle2 size={18} />}{busy ? '正在保存…' : '保存采购'}</button><p className="fine-print"><ShieldCheck size={14} />全部商品一起保存，避免漏项。</p></aside>
  </form>;
}
