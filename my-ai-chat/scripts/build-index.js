/**
 * 批量构建向量索引脚本
 * 遍历 knowledge-base/raw/ 下的文档，解析、分块、向量化后存入 embeddings/
 *
 * 用法:
 *   node scripts/build-index.js
 *   node scripts/build-index.js --source ./custom-docs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RAW_DIR = process.argv.includes('--source')
  ? path.resolve(process.cwd(), process.argv[process.argv.indexOf('--source') + 1])
  : path.join(ROOT, 'knowledge-base', 'raw');

const EMBEDDINGS_DIR = path.join(ROOT, 'knowledge-base', 'embeddings');

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

async function buildIndex() {
  console.log('Building RAG index...');
  console.log('Source:', RAW_DIR);

  await ensureDir(EMBEDDINGS_DIR);

  try {
    const files = await fs.readdir(RAW_DIR);
    const docs = files.filter(f => /\.(txt|md|json)$/i.test(f));

    if (docs.length === 0) {
      console.log('No documents found in', RAW_DIR);
      return;
    }

    for (const file of docs) {
      const filePath = path.join(RAW_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`Processing: ${file} (${content.length} chars)`);

      // TODO: 调用解析、分块、向量化逻辑
      // 这里预留接口，待接入具体实现
    }

    console.log('Index build complete (stub).');
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

buildIndex();
