import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = 'C:\\Users\\ragory\\Desktop\\products_export_1.csv';
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const targetRows = (rows as any[]).filter(r => r['Handle'] === 'gailife-soft-support-full-coverage-bra');
console.log(targetRows.map(r => ({
  Title: r['Title'],
  Type: r['Type'],
  CustomProductType: r['Custom Product Type'],
  StandardizedProductType: r['Standardized Product Type'],
  Tags: r['Tags']
})));
