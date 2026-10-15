import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { filterLines, monthRange, summarizeItems, summarizeSuppliers, totalAmount, validateDraft, type PurchaseLine } from '../src/domain';
import { createWorkbook } from '../src/export';

const base: PurchaseLine = {
  id: 'l1', purchase_id: 'p1', purchase_date: '2026-10-02', invoice_number: 'INV-1',
  created_by: 'u1', supplier_id: 's1', supplier_name: 'ABC Trading', item_id: 'i1',
  item_name: 'Cooking Oil', quantity: 2, unit: 'tin', total_amount: 180, unit_price: 90,
};
const lines: PurchaseLine[] = [base,
  { ...base, id: 'l2', purchase_id: 'p2', purchase_date: '2026-10-12', quantity: 3, total_amount: 270 },
  { ...base, id: 'l3', purchase_id: 'p2', quantity: 1, unit: 'carton', total_amount: 100, unit_price: 100 },
];
test('monthly totals combine the same item and keep units separate', () => {
  const totals = summarizeItems(lines);
  assert.equal(totals.length, 2);
  assert.deepEqual(totals.find(i => i.unit === 'tin'), { item: 'Cooking Oil', itemId: 'i1', unit: 'tin', quantity: 5, amount: 450, count: 2 });
  assert.equal(totalAmount(lines), 550);
  assert.deepEqual(summarizeSuppliers(lines), [{ supplier: 'ABC Trading', amount: 550, invoices: 2 }]);
});
test('month date boundaries include December rollover', () => {
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2027-01-01' });
  assert.throws(() => monthRange('2026-13'));
});
test('search ignores case and whitespace and supports supplier filtering', () => {
  assert.equal(filterLines(lines, '  cooking OIL ', '').length, 3);
  assert.equal(filterLines(lines, '', 'different-supplier').length, 0);
});
test('entry validates quantity, monetary precision, and required fields', () => {
  const line = { key: '1', name: 'Oil', quantity: '2.5', unit: 'tin' as const, amount: '180.00' };
  assert.equal(validateDraft('2026-10-02', 'ABC', [line]), null);
  for (const patch of [{ quantity: '0' }, { quantity: '-1' }, { quantity: 'NaN' }, { amount: '-1' }, { amount: '1.999' }, { name: ' ' }])
    assert.ok(validateDraft('2026-10-02', 'ABC', [{ ...line, ...patch }]));
  assert.ok(validateDraft('2026-10-02', '', [line]));
});
test('real Excel file contains detail and correctly calculated reports; text cannot become a formula', async () => {
  const workbook = new ExcelJS.Workbook();
  const buffer = await createWorkbook([...lines, { ...base, id: 'l4', item_id: 'i2', item_name: '=HYPERLINK("https://example.com")', quantity: 1, total_amount: 0 }], '2026-10');
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map(s => s.name), ['采购明细', '商品汇总', '供应商汇总']);
  const detail = workbook.getWorksheet('采购明细')!;
  assert.equal(detail.rowCount, 5);
  assert.equal(detail.getCell('D5').type, ExcelJS.ValueType.String);
  assert.equal(detail.getCell('G2').value, 180);
  assert.equal(workbook.getWorksheet('商品汇总')!.getCell('D2').value, 450);
});
