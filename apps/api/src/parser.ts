import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { createReadStream,createWriteStream } from 'node:fs';
import { readFile,stat,mkdir,open } from 'node:fs/promises';
import { extname,join } from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { limits } from '@workbench/core';
export type ParsedRow={rowNumber:number;raw:Record<string,unknown>};
function plain(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('每行必须是对象');return Object.fromEntries(Object.entries(v).map(([k,v])=>[k.trim(),v]));}
export async function* parseFile(path:string,filename=path):AsyncGenerator<ParsedRow>{
  const ext=extname(filename).toLowerCase();let n=0;
  if(ext==='.csv'){
    // UTF-8 or UTF-16LE BOM; GB18030 must be converted explicitly to avoid silently mangling headers.
    const file=await open(path,'r');const head=Buffer.alloc(3);await file.read(head,0,3,0);await file.close();const utf16=head[0]===255&&head[1]===254;
    const stream=createReadStream(path,{encoding:utf16?'utf16le':'utf8'}).pipe(parse({columns:(cols:string[])=>{if(new Set(cols).size!==cols.length)throw Error('CSV 表头重复');return cols;},bom:true,skip_empty_lines:true,max_record_size:1024*1024,relax_column_count:false}));
    for await(const raw of stream){if(++n>limits.rows)throw Error('超过行数限制，请拆分');if(JSON.stringify(raw).includes('�'))throw Error('文件编码无法可靠识别；请转换为 UTF-8');yield {rowNumber:n,raw:plain(raw)};}
  }else if(ext==='.jsonl'){
    const lines=createInterface({input:createReadStream(path,{encoding:'utf8'}),crlfDelay:Infinity});for await(const line of lines){if(!line.trim())continue;if(++n>limits.rows)throw Error('超过行数限制');yield {rowNumber:n,raw:plain(JSON.parse(line))};}
  }else if(ext==='.json'){
    const array=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(array)||array.length>limits.rows)throw Error('JSON 必须为有界对象数组');for(const raw of array)yield {rowNumber:++n,raw:plain(raw)};
  }else if(ext==='.xlsx'){
    // ExcelJS never evaluates macros/formulas/links. Cached formula results still need human review.
    const reader=new ExcelJS.stream.xlsx.WorkbookReader(path,{worksheets:'emit',sharedStrings:'cache',hyperlinks:'ignore',styles:'cache'});let sheets=0;
    for await(const sheet of reader){if(++sheets>1)throw Error('首版每文件只接收一张工作表，请分别导出');let headers:string[]=[];
      for await(const row of sheet){const vals=(row.values as ExcelJS.CellValue[]).slice(1);
        if(!headers.length){headers=vals.map(v=>String(v??'').trim());if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('表头为空或重复');continue;}
        const raw:Record<string,unknown>={};headers.forEach((h,i)=>{const v=vals[i];raw[h]=v instanceof Date?v.toISOString():v&&typeof v==='object'?('formula' in v?{formula:'blocked',cached_result:v.result}: 'richText' in v?v.richText.map(t=>t.text).join(''):{unsupported:true}):v??null;});
        if(++n>limits.rows)throw Error('超过行数限制');yield {rowNumber:n,raw};
      }
    }
  }else throw Error('格式不支持');
}
export async function extractZip(path:string,dest:string):Promise<string[]>{
  await mkdir(dest,{recursive:true});return new Promise((resolve,reject)=>{
    yauzl.open(path,{lazyEntries:true,validateEntrySizes:true},(err,zip)=>{
      if(err||!zip)return reject(err??Error('ZIP 打开失败'));let bytes=0;const files:string[]=[];let failed=false;
      const abort=(e:unknown)=>{failed=true;zip.close();reject(e);};zip.on('error',abort);zip.on('end',()=>resolve(files));
      zip.on('entry',async entry=>{try{
        if(failed)return;const name=entry.fileName;
        if(!/^[^/\\]+\.(csv|xlsx|json|jsonl)$/i.test(name)||name.startsWith('.')||/[\x00-\x1f]/.test(name)||(entry.externalFileAttributes>>>16&0xf000)===0xa000)throw Error('ZIP 仅允许根目录的数据文件，拒绝目录、链接与嵌套归档');
        bytes+=entry.uncompressedSize;if(bytes>limits.expanded||files.length>=limits.files||entry.uncompressedSize>limits.file)throw Error('ZIP 解压大小或数量超限');
        if(files.some(p=>p.endsWith('/'+name)||p.endsWith('\\'+name)))throw Error('ZIP 文件名重复');
        const output=join(dest,name);const stream=await new Promise<NodeJS.ReadableStream>((r,j)=>zip.openReadStream(entry,(e,s)=>e||!s?j(e):r(s)));
        await pipeline(stream,createWriteStream(output,{flags:'wx'}));if((await stat(output)).size!==entry.uncompressedSize)throw Error('ZIP 大小校验失败');files.push(output);zip.readEntry();
      }catch(e){abort(e);}});zip.readEntry();
    });
  });
}
