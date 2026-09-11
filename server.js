import express from 'express';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { iniciar, triaje, estaListo, MODELO } from './core/medpsy.js';
import { evaluar } from './core/reglas.js';
import { iniciarEmbeddings, buscar, EMBED } from './core/rag.js';
import { guardarConsulta, listarConsultas, obtenerConsulta, historialPaciente } from './core/expedientes.js';
import { consultar } from './core/consulta.js';
import { leerEtiqueta, iniciarVision, visionLista, VISION } from './core/visionpsy.js';
import { listarInventario, agregarItem, ajustarCantidad, editarItem, eliminarItem, resumenInventario, inventarioAgrupado } from './core/inventario.js';

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

const UMBRAL = 0.5;
const NIVEL = { emergencia: 3, hoy: 2, espera: 1, 'no determinada': 0 };
const listaGuias = () => existsSync('corpus') ? readdirSync('corpus').filter(f => /\.(txt|md)$/.test(f)) : [];

// SSE helper
function abrirSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  return (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// ---------- Pipeline de triaje: reglas → guías → antecedentes → modelo ----------
async function procesar(descripcion, paciente, onEvento = () => {}) {
  const reglas = evaluar(descripcion);
  onEvento({ tipo: 'reglas', alertas: reglas.alertas });

  const rag = await buscar(descripcion, 4);
  const relevantes = rag.fragmentos.filter(f => f.score >= UMBRAL);
  onEvento({ tipo: 'guias', usadas: relevantes.length, descartadas: rag.fragmentos.length - relevantes.length });
  const contexto = relevantes.map((f, i) => `[${i + 1}] (${f.fuente}) ${f.texto}`).join('\n\n');

  const previas = historialPaciente(paciente?.cedula).slice(0, 3);
  const antecedentes = previas.map(p => `- ${p.fecha.slice(0, 10)}: ${p.descripcion.slice(0, 160)} → ${p.urgenciaFinal}`).join('\n');
  onEvento({ tipo: 'antecedentes', cantidad: previas.length });

  const ia = await triaje(descripcion, contexto, onEvento, antecedentes);

  const lineaUrg = (ia.respuesta.match(/URGENCIA:?\s*(.+)/i) || [])[1] || '';
  const urgenciaIA = /emergencia/i.test(lineaUrg) ? 'emergencia' : /\bhoy\b/i.test(lineaUrg) ? 'hoy' : /espera/i.test(lineaUrg) ? 'espera' : 'no determinada';
  const urgenciaFinal = (NIVEL[reglas.urgenciaMinima] || 0) > (NIVEL[urgenciaIA] || 0) ? reglas.urgenciaMinima : urgenciaIA;

  const resultado = {
    urgenciaFinal, urgenciaIA, reglas, ...ia,
    fuentes: relevantes,
    antecedentes: previas.map(p => ({ id: p.id, fecha: p.fecha, urgenciaFinal: p.urgenciaFinal, descripcion: p.descripcion })),
    descartadas: rag.fragmentos.length - relevantes.length,
    busquedaMs: rag.busquedaMs
  };
  const registro = guardarConsulta({ paciente, descripcion, resultado });
  resultado.expedienteId = registro.id;
  return resultado;
}

// ---------- Estado e inicio ----------
app.get('/api/estado', (req, res) => {
  res.json({ listo: estaListo(), modelo: MODELO, embeddings: EMBED, vision: VISION, visionLista: visionLista(), guias: listaGuias(), umbral: UMBRAL });
});

app.get('/api/inicio', (req, res) => {
  const todas = listarConsultas();
  const hoy = new Date().toDateString();
  const deHoy = todas.filter(c => new Date(c.fecha).toDateString() === hoy);
  const porNivel = n => deHoy.filter(c => c.urgenciaFinal === n).length;
  let evaluacion = null;
  if (existsSync('eval/resultados.json')) { try { evaluacion = JSON.parse(readFileSync('eval/resultados.json', 'utf8')).resumen; } catch {} }
  res.json({
    consultasHoy: deHoy.length,
    emergenciasHoy: porNivel('emergencia'),
    porNivel: { emergencia: porNivel('emergencia'), hoy: porNivel('hoy'), espera: porNivel('espera') },
    consultasTotal: todas.length,
    pacientes: new Set(todas.map(c => c.paciente?.cedula).filter(Boolean)).size,
    recientes: todas.slice(0, 6),
    inventario: resumenInventario(),
    guias: listaGuias().length,
    evaluacion
  });
});

// ---------- Triaje ----------
app.post('/api/triaje', async (req, res) => {
  const { descripcion, paciente } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'Falta la descripción' });
  try { res.json(await procesar(descripcion, paciente)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/triaje/stream', async (req, res) => {
  const { descripcion, paciente } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'Falta la descripción' });
  const enviar = abrirSSE(res);
  try { enviar({ tipo: 'fin', resultado: await procesar(descripcion, paciente, enviar) }); }
  catch (e) { console.error(e); enviar({ tipo: 'error', mensaje: e.message }); }
  res.end();
});

// ---------- Consultar guías ----------
app.post('/api/consulta/stream', async (req, res) => {
  const { pregunta, historial } = req.body;
  if (!pregunta?.trim()) return res.status(400).json({ error: 'Falta la pregunta' });
  const enviar = abrirSSE(res);
  try { enviar({ tipo: 'fin', resultado: await consultar(pregunta, historial || [], enviar) }); }
  catch (e) { console.error(e); enviar({ tipo: 'error', mensaje: e.message }); }
  res.end();
});

// ---------- Inventario ----------
app.get('/api/inventario', (req, res) => res.json(listarInventario()));
app.get('/api/inventario/grupos', (req, res) => res.json(inventarioAgrupado()));
app.put('/api/inventario/:id', (req, res) => {
  const it = editarItem(req.params.id, req.body || {});
  it ? res.json(it) : res.status(404).json({ error: 'No existe' });
});
app.post('/api/inventario', (req, res) => res.json(agregarItem(req.body)));
app.patch('/api/inventario/:id', (req, res) => {
  const it = ajustarCantidad(req.params.id, parseInt(req.body.delta) || 0);
  it ? res.json(it) : res.status(404).json({ error: 'No existe' });
});
app.delete('/api/inventario/:id', (req, res) => res.json({ ok: eliminarItem(req.params.id) }));

// Foto → VisionPsy → datos (no guarda; el usuario confirma)
app.post('/api/inventario/leer', async (req, res) => {
  const { imagenBase64 } = req.body;
  if (!imagenBase64) return res.status(400).json({ error: 'Falta la imagen' });
  const enviar = abrirSSE(res);
  try {
    const bytes = new Uint8Array(Buffer.from(imagenBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    enviar({ tipo: 'fin', resultado: await leerEtiqueta(bytes, enviar) });
  } catch (e) { console.error(e); enviar({ tipo: 'error', mensaje: e.message }); }
  res.end();
});

// ---------- Expedientes ----------
app.get('/api/expedientes', (req, res) => res.json(listarConsultas()));
app.get('/api/expedientes/:id', (req, res) => {
  const r = obtenerConsulta(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'No existe' });
});
app.get('/api/pacientes/:cedula/historial', (req, res) => res.json(historialPaciente(req.params.cedula)));

// ---------- Evidencia ----------
app.get('/api/evidencia', (req, res) => {
  let evaluacion = null;
  if (existsSync('eval/resultados.json')) { try { evaluacion = JSON.parse(readFileSync('eval/resultados.json', 'utf8')); } catch {} }
  let rendimiento = null;
  if (existsSync('logs/rendimiento.jsonl')) {
    const filas = readFileSync('logs/rendimiento.jsonl', 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const conStats = filas.filter(f => f.ttftMs != null && f.tokensPorSegundo != null);
    const prom = k => conStats.length ? +(conStats.reduce((a, f) => a + (f[k] || 0), 0) / conStats.length).toFixed(1) : null;
    const ultimo = k => [...conStats].reverse().find(f => f[k] && f[k] !== 'desconocido')?.[k] ?? null;
    rendimiento = {
      consultas: filas.length, dispositivo: ultimo('dispositivo'), cargaModeloMs: ultimo('cargaModeloMs'),
      ttftPromedioMs: prom('ttftMs'), tokensPorSegundoPromedio: prom('tokensPorSegundo'),
      tokensGeneradosPromedio: prom('tokensGenerados'), totalMsPromedio: prom('totalMs')
    };
  }
  res.json({ evaluacion, rendimiento });
});

// ---------- Arranque ----------
const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`http://localhost:${PORT} — cargando modelos...`);
  await iniciarEmbeddings();
  await iniciar();
  console.log('Centinela listo (triaje y guías).');
  if (process.env.SIN_VISION !== '1') {
    iniciarVision().then(() => console.log('VisionPsy listo (inventario por foto).')).catch(e => console.error('[visionpsy] no cargó:', e.message));
  }
});
