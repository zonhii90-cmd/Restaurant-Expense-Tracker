import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStaffAdminHandler} from '../supabase/functions/staff-admin/index.ts';
const manager='00000000-0000-4000-8000-000000000001';
const staff='00000000-0000-4000-8000-000000000002';
const password='test-password-12345';
function backend(options:{role?:string;active?:boolean;valid?:boolean;targetRole?:string;duplicate?:boolean;activationFail?:boolean;weak?:boolean}={}){
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher:typeof fetch=async(input,init={})=>{
    const url=String(input);calls.push({url,init});
    const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if(url.endsWith('/auth/v1/user')){assert.equal(new Headers(init.headers).get('Authorization'),'Bearer real-user-token');return json({id:manager},options.valid===false?401:200);}
    assert.equal(new Headers(init.headers).get('Authorization'),'Bearer server-test-key');
    if(url.includes('/restaurant_members')){
      if(init.method==='PATCH')return options.activationFail?json({},500):json([{user_id:staff,role:'staff',active:true}]);
      if(url.includes(`eq.${manager}`))return json([{role:options.role||'manager',active:options.active!==false}]);
      return json([{role:options.targetRole||'staff'}]);
    }
    if(url.endsWith('/admin/users'))return options.weak?json({error_code:'weak_password'},422):options.duplicate?json({error_code:'email_exists',message:password},422):json({id:staff});
    if(url.endsWith(`/admin/users/${staff}`))return json({id:staff});
    throw new Error(`Unexpected request ${url}`);
  };
  const handler=createStaffAdminHandler({url:'https://project.test',serviceKey:'server-test-key',fetcher});
  const invoke=(body:object,token=true,origin='https://stocklog.online')=>handler(new Request('https://project.test/functions/v1/staff-admin',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer real-user-token'}:{})},body:JSON.stringify(body)}));
  return {calls,invoke,handler};
}
const create={action:'create_staff',email:'STAFF@example.test',display_name:' Kitchen staff ',password};
test('staff creation authenticates the caller, checks current manager membership and activates only the new staff row',async()=>{
 const {calls,invoke}=backend();const result=await invoke(create);assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{ok:true,user_id:staff});
 const auth=calls.find(c=>c.url.endsWith('/admin/users'))!;const payload=JSON.parse(String(auth.init.body));
 assert.equal(payload.email,'staff@example.test');assert.equal(payload.password,password);assert.equal(payload.email_confirm,true);assert.equal(payload.role,undefined);
 const activation=calls.find(c=>c.init.method==='PATCH')!;assert.ok(activation.url.includes(`user_id=eq.${staff}&role=eq.staff`));
 assert.deepEqual(JSON.parse(String(activation.init.body)),{display_name:'Kitchen staff',active:true});
});
test('missing, forged, staff and inactive credentials never reach Auth admin operations',async()=>{
 for(const options of [{valid:false},{role:'staff'},{active:false}]){
  const {calls,invoke}=backend(options);const result=await invoke(create);assert.ok([401,403].includes(result.status));assert.equal(calls.some(c=>c.url.includes('/admin/')),false);
 }
 const {calls,invoke}=backend();assert.equal((await invoke(create,false)).status,401);assert.equal(calls.length,0);
});
test('password reset rejects managers and self, and only changes a verified staff account',async()=>{
 const a=backend();assert.equal((await a.invoke({action:'reset_password',user_id:manager,password})).status,400);assert.equal(a.calls.some(c=>c.url.includes('/admin/')),false);
 const b=backend({targetRole:'manager'});assert.equal((await b.invoke({action:'reset_password',user_id:staff,password})).status,403);assert.equal(b.calls.some(c=>c.url.includes('/admin/')),false);
 const c=backend();assert.equal((await c.invoke({action:'reset_password',user_id:staff,password})).status,200);assert.deepEqual(JSON.parse(String(c.calls.at(-1)!.init.body)),{password});
});
test('role injection, weak credentials and unapproved origins are rejected',async()=>{
 for(const patch of [{role:'manager'},{password:'short'},{email:'invalid'},{display_name:' '}]){
  const {calls,invoke}=backend();assert.equal((await invoke({...create,...patch})).status,400);assert.equal(calls.some(c=>c.url.includes('/admin/')),false);
 }
 const {calls,invoke}=backend();assert.equal((await invoke(create,true,'https://untrusted.test')).status,403);assert.equal(calls.length,0);
});
test('duplicate and partially activated accounts are not silently retried, deleted or reported as success',async()=>{
 const a=backend({duplicate:true});const result=await a.invoke(create);assert.equal(result.status,409);const text=await result.text();assert.ok(!text.includes(password));assert.ok(!text.includes('server-test-key'));assert.equal(a.calls.some(c=>c.init.method==='PATCH'),false);
 const weak=backend({weak:true});assert.equal((await weak.invoke(create)).status,400);
 const b=backend({activationFail:true});assert.equal((await b.invoke(create)).status,502);assert.equal(b.calls.filter(c=>c.url.endsWith('/admin/users')).length,1);assert.equal(b.calls.some(c=>c.init.method==='DELETE'),false);
});
