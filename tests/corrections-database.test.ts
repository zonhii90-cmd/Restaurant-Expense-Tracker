import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('corrections preserve provenance, audit, own-only requests, retries, version conflicts and voided report exclusions',async()=>{
 const db=new PGlite(); const read=(f:string)=>readFileSync(new URL(`../supabase/${f}`,import.meta.url),'utf8');
 const q=async(s:string,a:unknown[]=[]) => (await db.query<Record<string,any>>(s,a)).rows;
 const staff='00000000-0000-4000-8000-000000000001',manager='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
 const purchase='10000000-0000-4000-8000-000000000001', request='20000000-0000-4000-8000-000000000001';
 const op=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const original=[{name:'Oil',quantity:'2',unit:'tin',amount:'500'}];
 const save=()=>q('select restaurant_save_purchase($1,$2,$3,$4,$5,$6::jsonb)',[purchase,'2026-10-02','ABC',null,'Original notes',JSON.stringify(original)]);
 const resolve=(action:string,revision:number,n:number,data:unknown=null,req:string|null=null)=>q('select restaurant_resolve_purchase($1,$2,$3,$4,$5,$6::jsonb,$7)',[op(n),purchase,revision,action,'Checked receipt',JSON.stringify(data),req]);
 const as=async(id:string,fn:()=>Promise<void>)=>{await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{await fn();}finally{await db.exec('reset role');}};
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(read('setup.sql'));await db.exec(read('save-purchase.sql'));
 await db.exec('alter table restaurant_members add column display_name text not null default \'\'');
 // Model the hosted receipt RPC signature to test its privilege upgrade and origin guard.
 await db.exec(`create function restaurant_save_purchase_with_receipt(uuid,date,text,text,text,jsonb,text) returns uuid language sql as $$select restaurant_save_purchase($1,$2,$3,$4,$5,$6)$$`);
 await db.exec(read('purchase-corrections.sql'));
 for(const id of [staff,manager,other])await q('insert into auth.users values($1)',[id]);
 await db.exec("update restaurant_members set active=true,display_name='Member';");await q("update restaurant_members set role='manager' where user_id=$1",[manager]);
 await as(staff,async()=>{
  await save();await save();
  for(const sql of ["update purchases set notes='changed'",'delete from purchases','delete from purchase_items',"update items set name='changed'",'insert into restaurant_purchase_changes(id) values(gen_random_uuid())'])await assert.rejects(q(sql));
  await q('select restaurant_request_correction($1,$2,1,$3)',[request,purchase,'Amount should be 50']);
  await q('select restaurant_request_correction($1,$2,1,$3)',[request,purchase,'Amount should be 50']);
  await assert.rejects(resolve('voided',1,99));
  assert.equal((await q('select * from restaurant_correction_requests')).length,1);
 });
 await as(other,async()=>{
  await assert.rejects(q('select restaurant_purchase_detail($1)',[purchase]));
  await assert.rejects(q('select restaurant_request_correction($1,$2,1,$3)',[op(98),purchase,'wrong']));
  assert.equal((await q('select * from restaurant_purchase_changes')).length,0);
 });
 const data={date:'2026-11-02',supplier:'ABC',invoice:'INV-1',notes:'Corrected notes',lines:[{...original[0],amount:'50'}]};
 await as(manager,async()=>{
  await assert.rejects(resolve('corrected',1,1,{...data,lines:[{...original[0],quantity:'0'}]},request));
  assert.equal((await q('select revision from purchases'))[0].revision,1);
  assert.equal(Number((await q('select total_amount from purchase_items'))[0].total_amount),500);
  await resolve('corrected',1,1,data,request);await resolve('corrected',1,1,data,request);
  assert.equal((await q('select * from restaurant_purchase_changes')).length,2);
  assert.equal((await q('select status from restaurant_correction_requests'))[0].status,'corrected');
  assert.equal((await q('select created_by from purchases'))[0].created_by,staff);
  assert.equal(Number((await q('select total_amount from monthly_item_summary'))[0].total_amount),50);
  assert.equal(new Date((await q('select month from monthly_item_summary'))[0].month).toISOString().slice(0,7),'2026-11');
  await assert.rejects(resolve('voided',1,2));
  await assert.rejects(resolve('corrected',2,3,data),/No changes/);
  await resolve('voided',2,4);await resolve('voided',2,4);
  assert.equal((await q('select * from monthly_item_summary')).length,0);
  assert.equal((await q('select * from monthly_supplier_summary')).length,0);
  assert.equal((await q('select status from purchase_history'))[0].status,'voided');
  const event=(await q("select before_data,after_data from restaurant_purchase_changes where action='corrected'"))[0];
  assert.equal(event.before_data.lines[0].amount,'500.00');assert.equal(event.after_data.lines[0].amount,'50.00');
  await assert.rejects(q('delete from restaurant_purchase_changes'));
 });
 await as(staff,async()=>{
  await save(); // Original request retry cannot resurrect or undo a correction.
  const detail=(await q('select restaurant_purchase_detail($1) as d',[purchase]))[0].d;
  assert.equal(detail.purchase.status,'voided');assert.equal(detail.purchase.lines[0].amount,'50.00');
  await assert.rejects(q('select restaurant_request_correction($1,$2,3,$3)',[op(97),purchase,'again']));
 });
 await db.exec(read('purchase-corrections.sql')); // safe rerun keeps audit and provenance
 assert.equal((await q('select * from restaurant_purchase_changes')).length,3);
 await q('update restaurant_members set active=false where user_id=$1',[staff]);
 await as(staff,async()=>{await assert.rejects(save());await assert.rejects(q('select restaurant_purchase_detail($1)',[purchase]));assert.equal((await q('select * from restaurant_purchase_changes')).length,0);});
 }finally{await db.close();}
});
