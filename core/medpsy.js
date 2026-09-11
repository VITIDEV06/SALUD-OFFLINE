import { loadModel, HEALTHCARE_1_7B_MEDICAL_Q4_K_M, completion } from '@qvac/sdk';
import { appendFileSync, mkdirSync } from 'node:fs';

const MODELO = {
  nombre: 'QVAC MedPsy-1.7B',
  repo: 'qvac/MedPsy-1.7B-GGUF',
  archivo: 'medpsy-1.7b-q4_k_m-imat.gguf',
  cuantizacion: 'Q4_K_M (imatrix)',
  constanteSdk: 'HEALTHCARE_1_7B_MEDICAL_Q4_K_M'
};

let modelId = null;
let cargaMs = null;

export function estaListo() {
  return modelId !== null;
}

export async function iniciar() {
  if (modelId) return;
  const t0 = Date.now();
  modelId = await loadModel({
    modelSrc: HEALTHCARE_1_7B_MEDICAL_Q4_K_M,
    modelConfig: { ctx_size: 4096 }
  });
  cargaMs = Date.now() - t0;
  console.log(`[medpsy] listo en ${cargaMs} ms`);
}

const SISTEMA = `Eres un asistente de triaje para personal de salud de un puesto de salud rural.
NO diagnosticas. Clasificas urgencia, señalas hallazgos, indicas signos de alarma a vigilar y a dónde referir.
Si se te dan GUÍAS DE REFERENCIA, básate en ellas y cita el número del fragmento entre corchetes.
Responde SIEMPRE en español y SOLO con el formato pedido, sin texto adicional.`;

/**
 * Ejecuta el triaje. `onEvento` recibe avances en vivo:
 *   { tipo: 'pensando', tokens }   cada ~10 tokens de razonamiento
 *   { tipo: 'texto', delta }       cada token de la respuesta final
 */
/**
 * Generación genérica: system + mensajes → respuesta con métricas.
 * `onEvento` recibe { tipo:'pensando', tokens } y { tipo:'texto', delta }.
 */
export async function generar({ sistema, mensajes, etiqueta = 'generar', onEvento = () => {} }) {
  if (!modelId) await iniciar();
  const history = [{ role: 'system', content: sistema }, ...mensajes];

  const t1 = Date.now();
  let texto = '';
  let tokensPensados = 0;

  const run = completion({ modelId, history, stream: true, captureThinking: true });
  for await (const ev of run.events) {
    if (ev.type === 'thinkingDelta') {
      tokensPensados++;
      if (tokensPensados % 10 === 0) onEvento({ tipo: 'pensando', tokens: tokensPensados });
    } else if (ev.type === 'contentDelta') {
      texto += ev.text;
      onEvento({ tipo: 'texto', delta: ev.text });
    }
  }
  const totalMs = Date.now() - t1;

  const final = await run.final;
  const stats = (await run.stats) || {};

  const pensamiento = final?.thinking?.trim()
    || (texto.match(/<think>([\s\S]*?)<\/think>/) || [])[1]?.trim()
    || null;
  const respuesta = texto.replace(/<think>[\s\S]*?<\/think>/, '').trim();

  const metricas = {
    fecha: new Date().toISOString(),
    operacion: etiqueta,
    modelo: MODELO,
    dispositivo: stats.backendDevice ?? 'desconocido',
    cargaModeloMs: cargaMs,
    promptTokens: stats.promptTokens ?? null,
    tokensGenerados: stats.generatedTokens ?? null,
    tokensRespuesta: stats.emittedTokens ?? null,
    tokensRazonamiento: tokensPensados,
    ttftMs: stats.timeToFirstToken != null ? Math.round(stats.timeToFirstToken) : null,
    tokensPorSegundo: stats.tokensPerSecond != null ? +stats.tokensPerSecond.toFixed(2) : null,
    totalMs
  };

  mkdirSync('logs', { recursive: true });
  const ultimoPrompt = mensajes[mensajes.length - 1]?.content ?? '';
  appendFileSync('logs/rendimiento.jsonl', JSON.stringify({ ...metricas, prompt: ultimoPrompt, respuesta, pensamiento }) + '\n');

  return { respuesta, pensamiento, metricas };
}

export async function triaje(descripcion, contexto = '', onEvento = () => {}, antecedentes = '') {
  const prompt = `${contexto ? `GUÍAS DE REFERENCIA:\n${contexto}\n\n` : ''}${antecedentes ? `ANTECEDENTES EN ESTE PUESTO (consultas previas del mismo paciente):\n${antecedentes}\n\n` : ''}PACIENTE:\n${descripcion}

Responde EXACTAMENTE con estas 5 líneas. En URGENCIA elige UNA palabra según estos criterios:
- emergencia: riesgo para la vida o un órgano; traslado inmediato.
- hoy: sin riesgo vital inmediato, pero requiere que un profesional lo evalúe en las próximas horas (fiebre alta, infección probable, heridas que necesitan sutura, vómitos en niños, dolor moderado persistente).
- espera: molestia leve, sin signos de alarma; puede agendar cita en los próximos días.

URGENCIA: <emergencia | hoy | espera>
HALLAZGOS: <solo lo que el paciente presenta según la descripción>
VIGILAR: <signos de alarma que, si aparecen, cambian la urgencia>
PREGUNTAR: <datos que faltan para decidir mejor>
REFERIR A: <servicio concreto> [fragmento citado si aplica]`;

  return generar({ sistema: SISTEMA, mensajes: [{ role: 'user', content: prompt }], etiqueta: 'triaje', onEvento });
}

export { MODELO };
