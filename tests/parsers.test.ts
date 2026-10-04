import { describe,it,expect } from 'vitest';
import { mkdtemp,writeFile,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { parseFile } from '../apps/api/src/parser';
import { normalizeRow,suggestMapping,recordSchema } from '../packages/core/src';
describe('cloud file processing',()=>{
 it('streams quoted CSV with Chinese headers and UTF16 BOM',async()=>{const dir=await mkdtemp(join(tmpdir(),'csv-'));try{const path=join(dir,'data.csv');await writeFile(path,'\uFEFF编号,名称,SKU,单位,币种\r\n0001,"保温杯,旅行款",001,piece,USD\r\n','utf16le');const rows=[];for await(const r of parseFile(path))rows.push(r);expect(rows[0]?.raw['编号']).toBe('0001');expect(rows[0]?.raw['名称']).toBe('保温杯,旅行款');}finally{await rm(dir,{recursive:true,force:true});}});
 it('never evaluates workbook formulas',async()=>{const dir=await mkdtemp(join(tmpdir(),'xlsx-'));try{const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('sheet');sheet.addRow(['external_id','name']);sheet.addRow(['001',{formula:'1+1',result:2}]);const path=join(dir,'formula.xlsx');await wb.xlsx.writeFile(path);const rows=[];for await(const r of parseFile(path))rows.push(r);expect(rows[0]?.raw.name).toEqual({formula:'blocked',cached_result:2});const result=normalizeRow(rows[0]!.raw,suggestMapping(['external_id','name'],'products'),'products');expect(result.errors.join()).toContain('公式');}finally{await rm(dir,{recursive:true,force:true});}});
 it('rejects invalid financial and inventory invariants',()=>{expect(recordSchema('inventory').safeParse({external_id:'i',product_id:'p',warehouse:'w',quantity:'2',reserved:'3',unit:'piece',as_of:'2026-10-05T00:00:00Z',ownership:'owned'}).success).toBe(false);});
});
