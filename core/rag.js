// Búsqueda en las guías locales: EmbeddingGemma + vector store del SDK.
import { loadModel, EMBEDDINGGEMMA_300M_Q8_0, ragIngest, ragSearch } from '@qvac/sdk';
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const WORKSPACE = 'guias-salud';
const EMBED = {
  nombre: 'EmbeddingGemma-300M',
  repo: 'unsloth/embeddinggemma-300m-GGUF',
  archivo: 'embeddinggemma-300M-Q8_0.gguf',
  cuantizacion: 'Q8_0',
  constanteSdk: 'EMBEDDINGGEMMA_300M_Q8_0'
};

let modelId = null;

export async function iniciarEmbeddings() {
  if (modelId) return;
  const t0 = Date.now();
  modelId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
  console.log(`[rag] embeddings listos en ${Date.now() - t0} ms`);
}

// Corta respetando párrafos y, si un párrafo excede el máximo, por oraciones.
function fragmentar(texto, max = 500) {
  const parrafos = texto.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 40);
  const piezas = [];
  for (const p of parrafos) {
    if (p.length <= max) { piezas.push(p); continue; }
    let actual = '';
    for (const oracion of p.split(/(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)) {
      if ((actual + ' ' + oracion).length > max && actual) { piezas.push(actual); actual = oracion; }
      else actual = actual ? actual + ' ' + oracion : oracion;
    }
    if (actual) piezas.push(actual);
  }
  return piezas;
}

export async function ingestarCarpeta(carpeta = 'corpus') {
  if (!modelId) await iniciarEmbeddings();
  const archivos = readdirSync(carpeta).filter(f => /\.(txt|md)$/.test(f));
  const documentos = [];
  for (const f of archivos) {
    const fuente = basename(f).replace(/\.(txt|md)$/, '');
    for (const frag of fragmentar(readFileSync(join(carpeta, f), 'utf8'))) documentos.push(`[FUENTE: ${fuente}]\n${frag}`);
  }
  const t0 = Date.now();
  const r = await ragIngest({ modelId, workspace: WORKSPACE, documents: documentos, chunk: false });
  console.log(`[rag] ${archivos.length} archivos → ${r.processed.length} fragmentos en ${Date.now() - t0} ms`);
  return r.processed.length;
}

export async function buscar(consulta, topK = 4) {
  if (!modelId) await iniciarEmbeddings();
  const t0 = Date.now();
  const res = await ragSearch({ modelId, workspace: WORKSPACE, query: consulta, topK });
  const fragmentos = res.map(r => {
    const m = r.content.match(/^\[FUENTE: (.+?)\]\n([\s\S]*)$/);
    return { fuente: m ? m[1] : 'desconocida', texto: m ? m[2] : r.content, score: +(+r.score).toFixed(3) };
  });
  return { fragmentos, busquedaMs: Date.now() - t0 };
}

export { EMBED, WORKSPACE };
