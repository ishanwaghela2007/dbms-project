import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { createWorker } from 'tesseract.js';

const execFileAsync = promisify(execFile);

async function tryOcr(pdfBuffer, maxPages = 40) {
  if ((process.env.PDF_OCR_ENABLED || 'true').toLowerCase() !== 'true') return { text: '', mode: 'FAILED' };
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-pdf-'));
  const pdfPath = path.join(tmpDir, 'source.pdf');
  const outPrefix = path.join(tmpDir, 'page');
  let worker;
  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    // Poppler's pdftoppm is an OS dependency. If missing, the caller will show a manual-review result.
    await execFileAsync('pdftoppm', ['-f', '1', '-l', String(maxPages), '-r', '160', '-png', pdfPath, outPrefix], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const pages = (await fs.readdir(tmpDir)).filter(name => /^page-\d+\.png$/.test(name)).sort((a,b) => Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));
    if (!pages.length) return { text: '', mode: 'FAILED' };
    worker = await createWorker('eng');
    const chunks = [];
    for (const page of pages) {
      const result = await worker.recognize(path.join(tmpDir, page));
      chunks.push(`\n[PAGE ${page}]\n${result.data.text || ''}`);
    }
    return { text: chunks.join('\n'), mode: 'OCR' };
  } catch (error) {
    return { text: '', mode: 'FAILED', error: `OCR unavailable: ${error.message}` };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extractPdfText(pdfBuffer) {
  let text = '';
  let mode = 'TEXT';
  let textError = null;
  try {
    const result = await pdfParse(pdfBuffer, { max: Number(process.env.PDF_MAX_PAGES || 40) });
    text = result.text || '';
  } catch (error) { textError = error.message; }
  if (text.replace(/\s/g, '').length < 30) {
    const ocr = await tryOcr(pdfBuffer, Number(process.env.PDF_MAX_PAGES || 40));
    if (ocr.text) { text = ocr.text; mode = 'OCR'; }
    else if (textError) throw new Error(`Could not extract PDF text (${textError}). ${ocr.error || 'OCR did not return text.'}`);
    else mode = 'FAILED';
  }
  return { text, mode };
}

export { findMarksForIdentifier } from './mark-matcher.js';
