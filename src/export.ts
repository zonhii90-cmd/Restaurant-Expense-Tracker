import ExcelJS from 'exceljs';
import { summarizeItems, summarizeSuppliers, type PurchaseLine } from './domain';

export async function createWorkbook(lines: PurchaseLine[], period: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '餐账 Restaurant Expense Tracker';
  const sheets: { name: string; headers: string[]; rows: (string | number)[][] }[] = [
    { name: '采购明细', headers: ['日期', '供应商', '单据编号', '商品', '数量', '单位', '总金额 RM', '单价 RM'], rows: lines.map(line => [line.purchase_date, line.supplier_name, line.invoice_number ?? '', line.item_name, Number(line.quantity), line.unit, Number(line.total_amount), Number(line.unit_price)]) },
    { name: '商品汇总', headers: ['商品', '单位', '总数量', '总金额 RM', '采购明细数'], rows: summarizeItems(lines).map(item => [item.item, item.unit, item.quantity, item.amount, item.count]) },
    { name: '供应商汇总', headers: ['供应商', '总金额 RM', '单据数'], rows: summarizeSuppliers(lines).map(supplier => [supplier.supplier, supplier.amount, supplier.invoices]) },
  ];
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.addRow(sheet.headers);
    worksheet.addRows(sheet.rows);
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183E31' } };
    worksheet.columns.forEach((column, index) => {
      column.width = index < 4 ? 24 : 18;
      if (sheet.headers[index].includes('RM')) column.numFmt = '#,##0.00';
      else if (sheet.headers[index].includes('数量')) column.numFmt = '#,##0.###';
    });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, worksheet.rowCount), column: sheet.headers.length } };
  }
  workbook.subject = `采购记录 ${period}`;
  return workbook.xlsx.writeBuffer();
}

export async function downloadExcel(lines: PurchaseLine[], period: string) {
  const buffer = await createWorkbook(lines, period);
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `餐厅采购-${period}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
