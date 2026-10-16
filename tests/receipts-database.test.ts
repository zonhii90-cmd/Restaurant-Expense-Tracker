import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('private receipts enforce account scope, immutable uploads, atomic linking and safe retry', async () => {
  const db = new PGlite();
  const run = async (sql: string, args: unknown[] = []) => (await db.query<Record<string, any>>(sql, args)).rows;
  const read = (file: string) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
  try {
    // Supabase manages these schemas in production. Model their essential RLS
    // behavior locally; this does not validate the hosted Storage HTTP service.
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb, unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to authenticated, anon;
      grant select, insert, update, delete on storage.objects to authenticated;
      grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(read('setup.sql')); await db.exec(read('save-purchase.sql'));
    await db.exec(read('receipt-photos.sql'));
    const staff = '00000000-0000-4000-8000-000000000001';
    const other = '00000000-0000-4000-8000-000000000002';
    const manager = '00000000-0000-4000-8000-000000000003';
    const inactive = '00000000-0000-4000-8000-000000000004';
    for (const id of [staff, other, manager, inactive]) await run('insert into auth.users values ($1)', [id]);
    await run('update restaurant_members set active=true where user_id<>$1', [inactive]);
    await run("update restaurant_members set role='manager' where user_id=$1", [manager]);
    const asUser = async (id: string, callback: () => Promise<void>) => {
      await run("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
      try { await callback(); } finally { await db.exec('reset role'); }
    };
    const id = '10000000-0000-4000-8000-000000000001';
    const photo = '20000000-0000-4000-8000-000000000001';
    const path = `${staff}/${id}/${photo}.jpg`;
    const unlinked = `${staff}/${id}/20000000-0000-4000-8000-000000000002.jpg`;
    const lines = JSON.stringify([{ name: 'Oil', quantity: '2', amount: '180', unit: 'tin' }]);
    const save = (purchase: string, receipt: string) => run('select restaurant_save_purchase_with_receipt($1,$2,$3,$4,$5,$6::jsonb,$7) as id', [purchase, '2026-10-16', 'Supplier', null, null, lines, receipt]);
    const upload = (name: string) => run("insert into storage.objects(bucket_id,name,metadata) values ('restaurant-receipts',$1,'{\"mimetype\":\"image/jpeg\"}')", [name]);
    await asUser(staff, async () => {
      // A missing or forged photo rolls back the purchase and its item lines.
      await assert.rejects(save(id, path));
      assert.equal((await run('select * from purchases')).length, 0);
      assert.equal((await run('select * from items')).length, 0);
      await assert.rejects(upload(`${other}/${id}/${photo}.jpg`));
      await upload(path); await upload(unlinked);
      assert.equal((await run('select * from storage.objects')).length, 0, 'unlinked uploads are not readable');
      assert.equal((await save(id, path))[0].id, id);
      await save(id, path);
      assert.equal((await run('select * from purchases')).length, 1);
      assert.equal((await run('select * from purchase_items')).length, 1);
      assert.equal((await run('select * from purchase_history'))[0].receipt_path, path);
      assert.deepEqual((await run('select name from storage.objects')).map(o => o.name), [path]);
      await assert.rejects(save(id, unlinked), /different receipt/);
      await assert.rejects(run('update purchases set receipt_path=$1 where id=$2', [`${other}/${id}/${photo}.jpg`, id]));
      assert.equal((await run("update storage.objects set metadata='{}' returning id")).length, 0);
      assert.equal((await run('delete from storage.objects returning id')).length, 0);
    });
    await asUser(other, async () => {
      assert.equal((await run('select * from storage.objects')).length, 0);
      await assert.rejects(save(id, path));
    });
    await asUser(manager, async () => {
      assert.deepEqual((await run('select name from storage.objects')).map(o => o.name), [path]);
      assert.equal((await run('select * from purchase_history'))[0].receipt_path, path);
      assert.equal((await run("update storage.objects set metadata='{}' returning id")).length, 0);
    });
    await asUser(inactive, async () => {
      assert.equal((await run('select * from storage.objects')).length, 0);
      await assert.rejects(upload(`${inactive}/${id}/${photo}.jpg`));
      await assert.rejects(save(id, path));
    });
    await db.exec('set role anon');
    await assert.rejects(run('select * from storage.objects'));
    await assert.rejects(save(id, path));
    await db.exec('reset role');
    // Existing installations and complete setup can both be safely rerun.
    await db.exec(read('receipt-photos.sql'));
    await db.exec(read('setup.sql')); await db.exec(read('save-purchase.sql'));
    await db.exec(read('receipt-photos.sql'));
    assert.equal((await run('select * from purchases'))[0].receipt_path, path);
    assert.equal((await run("select public from storage.buckets where id='restaurant-receipts'"))[0].public, false);
  } finally { await db.close(); }
});
