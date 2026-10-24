import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('staff administration and server-side sign-ins enforce manager-only read/write boundaries',async()=>{
 const db=new PGlite();const run=async(sql:string,args:unknown[]=[]) => (await db.query<Record<string,any>>(sql,args)).rows;
 const file=(name:string)=>readFileSync(new URL(`../supabase/${name}`,import.meta.url),'utf8');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),last_sign_in_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(file('setup.sql'));await db.exec(file('staff-accounts.sql'));
  const manager='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',otherManager='00000000-0000-4000-8000-000000000003';
  for(const [id,email] of [[manager,'manager@example.test'],[staff,'staff@example.test'],[otherManager,'other@example.test']])await run('insert into auth.users(id,email) values($1,$2)',[id,email]);
  await run("update restaurant_members set role='manager',active=true where user_id<>$1",[staff]);
  await run("update restaurant_members set display_name='Kitchen staff' where user_id=$1",[staff]);
  const asUser=async(id:string,fn:()=>Promise<void>)=>{await run("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{await fn();}finally{await db.exec('reset role');}};
  // A server-side Auth update records a real sign-in, including denied restaurant access.
  await run("update auth.users set last_sign_in_at='2026-10-24T06:00:00Z' where id=$1",[staff]);
  await run("update auth.users set last_sign_in_at=last_sign_in_at where id=$1",[staff]);
  assert.equal((await run('select * from restaurant_login_history')).length,1);
  assert.equal((await run('select * from restaurant_login_history'))[0].access_granted,false);
  await asUser(staff,async()=>{
   await assert.rejects(run('select * from restaurant_staff_directory()'));
   await assert.rejects(run('select restaurant_set_staff_active($1,true)',[staff]));
   assert.equal((await run('select * from restaurant_login_history')).length,0);
   await assert.rejects(run("insert into restaurant_login_history(user_id,email,display_name,role_at_login,access_granted,signed_in_at) values($1,'fake','fake','manager',true,now())",[staff]));
   await assert.rejects(run("update restaurant_login_history set email='fake'"));
   await assert.rejects(run('delete from restaurant_login_history'));
   await assert.rejects(run('update auth.users set last_sign_in_at=now()'));
  });
  await asUser(manager,async()=>{
   assert.equal((await run('select * from restaurant_staff_directory()')).length,3);
   await assert.rejects(run('select restaurant_set_staff_active($1,false)',[manager]));
   await assert.rejects(run('select restaurant_set_staff_active($1,false)',[otherManager]));
   await run('select restaurant_set_staff_active($1,true)',[staff]);
   assert.equal((await run('select * from restaurant_login_history')).length,1);
   await assert.rejects(run('delete from restaurant_login_history'));
  });
  await run("update auth.users set last_sign_in_at='2026-10-24T07:00:00Z' where id=$1",[staff]);
  const rows=await run('select * from restaurant_login_history order by signed_in_at');assert.equal(rows.length,2);assert.equal(rows[1].access_granted,true);assert.equal(rows[1].display_name,'Kitchen staff');
  await asUser(staff,async()=>{await assert.rejects(run('select * from restaurant_staff_directory()'));assert.equal((await run('select * from restaurant_login_history')).length,0);});
  await asUser(manager,async()=>{await run('select restaurant_set_staff_active($1,false)',[staff]);});
  await asUser(staff,async()=>{assert.equal((await run('select restaurant_is_active() as active'))[0].active,false);});
  await db.exec('set role anon');await assert.rejects(run('select * from restaurant_staff_directory()'));await assert.rejects(run('select * from restaurant_login_history'));await db.exec('reset role');
  await run('update restaurant_members set active=false where user_id=$1',[manager]);
  await asUser(manager,async()=>{await assert.rejects(run('select * from restaurant_staff_directory()'));assert.equal((await run('select * from restaurant_login_history')).length,0);});
  await db.exec(file('staff-accounts.sql'));assert.equal((await run('select * from restaurant_login_history')).length,2);
 }finally{await db.close();}
});
