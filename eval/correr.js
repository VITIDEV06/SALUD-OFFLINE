// Evaluación reproducible: envía cada caso sintético al servidor y escribe eval/resultados.json
import { readFileSync, writeFileSync } from 'node:fs';

const casos = JSON.parse(readFileSync('eval/casos.json', 'utf8'));
const URL = 'http://localhost:3000/api/triaje';
const resultados = [];

console.log(`Evaluando ${casos.length} casos sintéticos...\n`);

for (const c of casos) {
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion: c.descripcion })
  }).then(x => x.json());

  const ok = r.urgenciaFinal === c.esperado;
  const porReglas = r.reglas?.urgenciaMinima != null;
  resultados.push({
    id: c.id, esperado: c.esperado, obtenido: r.urgenciaFinal, soloIA: r.urgenciaIA,
    acierto: ok, reglasDispararon: porReglas, nivelReglas: r.reglas?.urgenciaMinima || null,
    fuentesUsadas: (r.fuentes || []).length,
    ttftMs: r.metricas?.ttftMs, tokPorSeg: r.metricas?.tokensPorSegundo,
    totalMs: Date.now() - t0, respuesta: r.respuesta
  });
  console.log(`${ok ? '✔' : '✘'} #${c.id}  esperado=${c.esperado}  obtenido=${r.urgenciaFinal}  (modelo solo: ${r.urgenciaIA}${porReglas ? `, reglas: ${r.reglas.urgenciaMinima}` : ''})  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const total = resultados.length;
const aciertos = resultados.filter(r => r.acierto).length;
const emerg = resultados.filter(r => r.esperado === 'emergencia');
const emergSistema = emerg.filter(r => r.obtenido === 'emergencia').length;
const emergSoloIA = emerg.filter(r => r.soloIA === 'emergencia').length;
const falsasEmerg = resultados.filter(r => r.esperado !== 'emergencia' && r.obtenido === 'emergencia').length;
const porNivel = n => { const s = resultados.filter(r => r.esperado === n); return `${s.filter(r => r.acierto).length}/${s.length}`; };
const prom = k => (resultados.reduce((a, r) => a + (r[k] || 0), 0) / total).toFixed(1);

const resumen = {
  fecha: new Date().toISOString(),
  casos: total,
  exactitud: `${aciertos}/${total} (${(100 * aciertos / total).toFixed(0)}%)`,
  porNivel: { emergencia: porNivel('emergencia'), hoy: porNivel('hoy'), espera: porNivel('espera') },
  emergenciasDetectadas: `${emergSistema}/${emerg.length} (sistema completo)`,
  emergenciasDetectadasSoloIA: `${emergSoloIA}/${emerg.length} (modelo sin reglas)`,
  falsasEmergencias: falsasEmerg,
  ttftPromedioMs: prom('ttftMs'),
  tokPorSegPromedio: prom('tokPorSeg'),
  tiempoPromedioMs: prom('totalMs')
};

console.log('\n--- RESUMEN ---');
console.table(resumen);
writeFileSync('eval/resultados.json', JSON.stringify({ resumen, resultados }, null, 2));
console.log('Guardado en eval/resultados.json');
