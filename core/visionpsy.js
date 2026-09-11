import { loadModel, completion, VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 } from '@qvac/sdk';
import { appendFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { clasificarEtiqueta } from './etiqueta.js';

const VISION = {
  nombre: 'QVAC VisionPsy-Nano-460M',
  repo: 'qvac/VisionPsy-Nano-460M-Flash-GGUFs',
  archivo: 'visionpsy-nano-460m-flash-q4_k_m.gguf + mmproj q8_0',
  cuantizacion: 'Q4_K_M (modelo) / Q8_0 (proyector)',
  constanteSdk: 'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M'
};

let modelId = null;
let cargaMs = null;

export function visionLista() { return modelId !== null; }

export async function iniciarVision() {
  if (modelId) return;
  const t0 = Date.now();
  modelId = await loadModel({
    modelSrc: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
    modelConfig: { projectionModelSrc: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0, ctx_size: 4096 }
  });
  cargaMs = Date.now() - t0;
  console.log(`[visionpsy] listo en ${cargaMs} ms`);
}

const PROMPT = `Transcribe todo el texto impreso en esta caja o etiqueta de medicamento, línea por línea, tal como aparece, sin explicar ni resumir. Incluye nombre, principio activo, concentración, forma, cantidad, lote, fecha de vencimiento y laboratorio si se ven.`;


/**
 * Lee una imagen (Uint8Array o Buffer, JPEG/PNG) y devuelve { datos, textoCrudo, metricas }.
 */
export async function leerEtiqueta(imagenBytes, onEvento = () => {}) {
  if (!modelId) { onEvento({ tipo: 'cargando' }); await iniciarVision(); }

  // El SDK recibe la imagen como archivo adjunto por ruta
  mkdirSync('data/tmp', { recursive: true });
  const ruta = resolve(`data/tmp/etiqueta-${Date.now()}.jpg`);
  writeFileSync(ruta, Buffer.from(imagenBytes));

  const t1 = Date.now();
  let texto = '';
  let stats = {};
  try {
    const run = completion({
      modelId,
      history: [{ role: 'user', content: PROMPT, attachments: [{ path: ruta }] }],
      stream: true
    });
    for await (const tok of run.tokenStream) { texto += tok; onEvento({ tipo: 'texto', delta: tok }); }
    stats = (await run.stats) || {};
  } finally {
    try { unlinkSync(ruta); } catch {}
  }
  const totalMs = Date.now() - t1;

  const datos = clasificarEtiqueta(texto);
  const metricas = {
    fecha: new Date().toISOString(),
    operacion: 'vision-etiqueta',
    modelo: VISION,
    dispositivo: stats.backendDevice ?? 'desconocido',
    cargaModeloMs: cargaMs,
    promptTokens: stats.promptTokens ?? null,
    tokensGenerados: stats.generatedTokens ?? null,
    ttftMs: stats.timeToFirstToken != null ? Math.round(stats.timeToFirstToken) : null,
    tokensPorSegundo: stats.tokensPerSecond != null ? +stats.tokensPerSecond.toFixed(2) : null,
    totalMs,
    imagenBytes: imagenBytes.length
  };
  mkdirSync('logs', { recursive: true });
  appendFileSync('logs/rendimiento.jsonl', JSON.stringify({ ...metricas, prompt: PROMPT, respuesta: texto }) + '\n');

  return { datos, textoCrudo: texto.trim(), metricas };
}

export { VISION };
