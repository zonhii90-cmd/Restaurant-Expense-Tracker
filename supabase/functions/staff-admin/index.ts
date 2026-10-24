// Deploy this WHOLE file as staff-admin. Service credentials stay on the server.
// Every operation checks both the real Auth token and current manager membership.
export function createStaffAdminHandler(config: { url: string; serviceKey: string; fetcher?: typeof fetch; allowedOrigins?: string[] }) {
  const request = config.fetcher || fetch;
  const origins = config.allowedOrigins || ['https://stocklog.online','https://www.stocklog.online','https://zonhii90-cmd.github.io'];
  const adminHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
  const call = (path: string, init: RequestInit = {}) => request(`${config.url}${path}`, { ...init, signal: AbortSignal.timeout(15000) });
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const headers: Record<string,string> = { 'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin' };
    if (origin && origins.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Headers']='authorization, apikey, x-client-info, content-type';
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
    const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
    if (origin && !origins.includes(origin)) return reply(403,{error:'This website is not allowed.'});
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (req.method!=='POST') return reply(405,{error:'Use POST.'});
    if (!config.url || !config.serviceKey) return reply(503,{error:'Account management is not configured.'});
    const token=req.headers.get('Authorization') || '';
    if (!/^Bearer \S+$/i.test(token)) return reply(401,{error:'Please sign in again.'});
    try {
      const auth=await call('/auth/v1/user',{headers:{apikey:config.serviceKey,Authorization:token}});
      if (!auth.ok) return reply(401,{error:'Please sign in again.'});
      const user=await auth.json();
      if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return reply(401,{error:'Please sign in again.'});
      const membership=await call(`/rest/v1/restaurant_members?user_id=eq.${user.id}&select=role,active`,{headers:adminHeaders});
      if (!membership.ok) return reply(503,{error:'Unable to check manager access.'});
      const members=await membership.json();
      if (members.length!==1 || members[0].role!=='manager' || members[0].active!==true) return reply(403,{error:'An active manager account is required.'});
      const raw=await req.text();
      if (raw.length>8192) return reply(400,{error:'Request is too large.'});
      let body:Record<string,unknown>;
      try { body=JSON.parse(raw); } catch { return reply(400,{error:'Invalid request.'}); }
      if (!body || Array.isArray(body) || typeof body!=='object') return reply(400,{error:'Invalid request.'});
      if ('role' in body || !['create_staff','reset_password'].includes(String(body.action))) return reply(400,{error:'Unsupported account operation.'});
      const password=typeof body.password==='string' ? body.password : '';
      if (password.length<12 || password.length>128) return reply(400,{error:'Use a password between 12 and 128 characters.'});
      if (body.action==='reset_password') {
        const id=typeof body.user_id==='string' ? body.user_id : '';
        if (!/^[0-9a-f-]{36}$/i.test(id) || id===user.id) return reply(400,{error:'Only staff passwords can be reset.'});
        const target=await call(`/rest/v1/restaurant_members?user_id=eq.${id}&select=role`,{headers:adminHeaders});
        if (!target.ok) return reply(503,{error:'Unable to check this staff account.'});
        const rows=await target.json();
        if (rows.length!==1 || rows[0].role!=='staff') return reply(403,{error:'Only staff passwords can be reset.'});
        const updated=await call(`/auth/v1/admin/users/${id}`,{method:'PUT',headers:adminHeaders,body:JSON.stringify({password})});
        if (!updated.ok) {
          const failure=await updated.json().catch(()=>({}));
          if (String(failure.error_code || failure.code)==='weak_password') return reply(400,{error:'This password does not meet the account policy. Use upper and lowercase letters, numbers and symbols.'});
          return reply(502,{error:'Password reset was not confirmed. Refresh the staff list before retrying.'});
        }
        return reply(200,{ok:true});
      }
      const email=typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
      const name=typeof body.display_name==='string' ? body.display_name.trim() : '';
      if (!email || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length>100) return reply(400,{error:'Enter a name and a valid email address.'});
      const created=await call('/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{display_name:name}})});
      if (!created.ok) {
        const detail=await created.json().catch(()=>({}));
        const code=String(detail.error_code || detail.code || '');
        if (code==='weak_password') return reply(400,{error:'This password does not meet the account policy. Use upper and lowercase letters, numbers and symbols.'});
        if (['email_exists','user_already_exists'].includes(code) || created.status===422) return reply(409,{error:'This email is already registered or was not accepted. Refresh staff accounts before trying again.'});
        return reply(502,{error:'Account creation was not confirmed. Refresh staff accounts before retrying.'});
      }
      const result=await created.json();
      const id=result.id || result.user?.id;
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return reply(502,{error:'Account creation was not confirmed. Refresh staff accounts before retrying.'});
      const activated=await call(`/rest/v1/restaurant_members?user_id=eq.${id}&role=eq.staff`,{method:'PATCH',headers:{...adminHeaders,Prefer:'return=representation'},body:JSON.stringify({display_name:name,active:true})});
      const rows=activated.ok ? await activated.json() : [];
      // Keep an ambiguously created account for review. Never delete it or
      // modify an existing account simply because an email already exists.
      if (!activated.ok || rows.length!==1 || rows[0].active!==true) return reply(502,{error:'The account was created but activation was not confirmed. Refresh staff accounts and check its status before retrying.'});
      return reply(200,{ok:true,user_id:id});
    } catch {
      // Never echo upstream responses, credentials or passwords.
      return reply(502,{error:'The request could not be confirmed. Refresh staff accounts before retrying.'});
    }
  };
}
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):unknown};
if (typeof Deno!=='undefined') Deno.serve(createStaffAdminHandler({url:Deno.env.get('SUPABASE_URL') || '',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}));
