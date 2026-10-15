import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL policies, monthly views, atomic saves, and retry protection', async () => {
  const db = new PGlite();
  const run = async (sql: string, args: unknown[] = []): Promise<Record<string, any>[]> => (await db.query<Record<string, any>>(sql, args)).rows;
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    const setup = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
    const rpc = readFileSync(new URL('../supabase/save-purchase.sql', import.meta.url), 'utf8');
    await db.exec(setup); await db.exec(rpc);
    const manager = '00000000-0000-4000-8000-000000000001';
    const staff = '00000000-0000-4000-8000-000000000002';
    const other = '00000000-0000-4000-8000-000000000003';
    const inactive = '00000000-0000-4000-8000-000000000004';
    for (const id of [manager, staff, other, inactive]) await run('insert into auth.users values ($1)', [id]);
    assert.equal((await run('select * from restaurant_members where active')).length, 0);
    await run('update restaurant_members set active=true where user_id <> $1', [inactive]);
    await run("update restaurant_members set role='manager' where user_id=$1", [manager]);
    const asUser = async (id: string, callback: () => Promise<void>) => {
      await run("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
      try { await callback(); } finally { await db.exec('reset role'); }
    };
    const id1 = '10000000-0000-4000-8000-000000000001';
    const id2 = '10000000-0000-4000-8000-000000000002';
    const payload = [{ name: 'Cooking Oil', quantity: '2', unit: 'tin', amount: '180.00' }];
    const save = (id: string, data: unknown, supplier = 'ABC Trading') => run('select restaurant_save_purchase($1,$2,$3,$4,$5,$6::jsonb) as id', [id, '2026-10-02', supplier, 'INV-1', null, JSON.stringify(data)]);
    await asUser(staff, async () => {
      assert.equal((await save(id1, payload))[0].id, id1);
      await save(id1, payload);
      assert.equal((await run('select * from purchases')).length, 1);
      assert.equal((await run('select * from purchase_items')).length, 1);
      await assert.rejects(save(id1, [{ ...payload[0], amount: '999' }]));
      await assert.rejects(run("update restaurant_members set role='manager' where user_id=$1", [staff]));
      await assert.rejects(run('insert into purchases(purchase_date,supplier_id,created_by) select purchase_date,supplier_id,$1 from purchases limit 1', [other]));
      // A later invalid line must roll back the header, earlier lines and catalog inserts.
      const failed = '10000000-0000-4000-8000-000000000003';
      await assert.rejects(save(failed, [
        { name: 'Rollback Item', quantity: '1', unit: 'kg', amount: '1' },
        { name: 'Broken', quantity: '0', unit: 'kg', amount: '1' },
      ], 'Rollback Supplier'));
      assert.equal((await run('select * from purchases where id=$1', [failed])).length, 0);
      assert.equal((await run("select * from items where name='Rollback Item'")).length, 0);
      assert.equal((await run("select * from suppliers where name='Rollback Supplier'")).length, 0);
      for (const field of ['NaN', 'Infinity', '-1', '1.1234'])
        await assert.rejects(save(failed, [{ ...payload[0], quantity: field }]));
      await assert.rejects(save(failed, []));
    });
    await asUser(other, async () => {
      for (const table of ['purchases', 'purchase_items', 'purchase_history', 'monthly_item_summary'])
        assert.equal((await run(`select * from ${table}`)).length, 0);
      const item = (await run('select id from items'))[0].id;
      await assert.rejects(run("insert into purchase_items(purchase_id,item_id,quantity,unit,total_amount) values ($1,$2,1,'tin',90)", [id1, item]));
      assert.equal((await run('delete from purchases where id=$1 returning id', [id1])).length, 0);
      await save(id2, [
        { name: ' cooking oil ', quantity: '3', unit: 'tin', amount: '270.00' },
        { name: 'Cooking Oil', quantity: '1', unit: 'carton', amount: '100' },
      ]);
      assert.equal((await run('select * from items')).length, 1);
      assert.equal((await run('select * from purchase_history')).length, 2);
      await assert.rejects(save(id1, payload));
    });
    await asUser(manager, async () => {
      assert.equal((await run('select * from purchases')).length, 2);
      const totals = await run('select * from monthly_item_summary');
      assert.equal(totals.length, 2);
      const tins = totals.find(row => row.unit === 'tin')!;
      assert.equal(Number(tins.total_quantity), 5);
      assert.equal(Number(tins.total_amount), 450);
      const suppliers = await run('select * from monthly_supplier_summary');
      assert.equal(Number(suppliers[0].total_amount), 550);
      assert.equal(Number(suppliers[0].invoice_count), 2);
    });
    await asUser(inactive, async () => {
      for (const table of ['suppliers', 'items', 'purchases', 'purchase_items', 'purchase_history', 'monthly_item_summary'])
        assert.equal((await run(`select * from ${table}`)).length, 0);
      await assert.rejects(save('10000000-0000-4000-8000-000000000004', payload));
    });
    await db.exec('set role anon');
    await assert.rejects(run('select * from purchases'));
    await assert.rejects(save('10000000-0000-4000-8000-000000000005', payload));
    await db.exec('reset role');
    await db.exec(setup); await db.exec(rpc);
    assert.equal((await run('select * from purchases')).length, 2);
    assert.equal((await run('select * from purchase_items')).length, 3);
    assert.equal((await run("select * from restaurant_members where role='manager' and active")).length, 1);
  } finally { await db.close(); }
});
