/* Centinela — lógica de interfaz */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fecha = iso => new Date(iso).toLocaleString('es-PA', { dateStyle: 'short', timeStyle: 'short' });
const nivelDe = u => ['emergencia', 'hoy', 'espera'].includes(u) ? u : 'neutro';
const EXPLICA = {
  emergencia: 'Riesgo vital. Traslado o atención inmediata.',
  hoy: 'Debe ser evaluado por un profesional en las próximas horas.',
  espera: 'Sin signos de alarma. Puede agendar cita.',
  'no determinada': 'El modelo no dio una clasificación clara. Revisar manualmente.'
};

/* ---------- Lectura de streams SSE (POST) ---------- */
async function leerSSE(url, body, onEvento) {
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || resp.statusText); }
  const lector = resp.body.getReader(); const dec = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await lector.read(); if (done) break;
    buffer += dec.decode(value, { stream: true });
    const partes = buffer.split('\n\n'); buffer = partes.pop();
    for (const p of partes) if (p.startsWith('data: ')) onEvento(JSON.parse(p.slice(6)));
  }
}

/* ---------- Tema ---------- */
const temaGuardado = null; // sin almacenamiento del navegador: el tema vive en la sesión
function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  $('#btnTema span').textContent = t === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
}
$('#btnTema').onclick = () => aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro');

/* ---------- Navegación ---------- */
function mostrar(vista) {
  if (!document.getElementById('vista-' + vista)) vista = 'inicio';
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + vista));
  document.querySelectorAll('nav a.item').forEach(a => a.classList.toggle('activo', a.dataset.vista === vista));
  if (vista === 'inicio') cargarInicio();
  if (vista === 'expedientes') cargarExpedientes();
  if (vista === 'evidencia') cargarEvidencia();
  if (vista === 'inventario') cargarInventario();
}
window.addEventListener('hashchange', () => mostrar(location.hash.slice(1) || 'inicio'));
mostrar(location.hash.slice(1) || 'inicio');

/* ---------- Estado del sistema ---------- */
let ESTADO = null;
async function estado() {
  try {
    const e = await fetch('/api/estado').then(r => r.json());
    ESTADO = e;
    $('#puntoModelo').className = 'punto ' + (e.listo ? 'ok' : 'cargando');
    $('#txtModelo').textContent = e.listo ? `${e.modelo.nombre} listo` : 'Cargando modelos…';
    $('#puntoVision').className = 'punto ' + (e.visionLista ? 'ok' : '');
    $('#txtVision').textContent = e.visionLista ? `${e.vision.nombre} listo` : 'VisionPsy: se carga al usarse';
    $('#txtGuias').textContent = `${e.guias.length} guía${e.guias.length === 1 ? '' : 's'} cargada${e.guias.length === 1 ? '' : 's'}`;
    $('#modelosInfo').innerHTML = `
      <dl class="campos">
        <dt>Triaje y guías</dt><dd>${esc(e.modelo.nombre)} — ${esc(e.modelo.cuantizacion)}<br><small>${esc(e.modelo.repo)} / ${esc(e.modelo.archivo)}</small></dd>
        <dt>Visión</dt><dd>${esc(e.vision.nombre)} — ${esc(e.vision.cuantizacion)}<br><small>${esc(e.vision.repo)}</small></dd>
        <dt>Búsqueda</dt><dd>${esc(e.embeddings.nombre)} — ${esc(e.embeddings.cuantizacion)}<br><small>${esc(e.embeddings.repo)}</small></dd>
        <dt>Guías</dt><dd>${e.guias.map(esc).join('<br>') || 'Ninguna cargada'}</dd>
        <dt>Umbral</dt><dd>Solo se usan fragmentos con relevancia ≥ ${e.umbral}</dd>
      </dl>`;
    if (!e.listo) setTimeout(estado, 3000);
  } catch { setTimeout(estado, 3000); }
}
estado();
function red() { $('#txtRed').textContent = navigator.onLine ? 'Sin conexión requerida' : 'Sin internet — funcionando'; }
window.addEventListener('online', red); window.addEventListener('offline', red); red();

/* ---------- Inicio ---------- */
async function cargarInicio() {
  const d = await fetch('/api/inicio').then(r => r.json());
  const ev = d.evaluacion;
  $('#cifrasInicio').innerHTML = `
    <div class="cifra destacada"><div class="n">${d.consultasHoy}</div><div class="l">consultas hoy</div></div>
    <div class="cifra emergencia"><div class="n">${d.emergenciasHoy}</div><div class="l">emergencias hoy</div></div>
    <div class="cifra"><div class="n">${d.pacientes}</div><div class="l">pacientes con cédula</div></div>
    <div class="cifra"><div class="n">${d.consultasTotal}</div><div class="l">consultas registradas</div></div>
    <div class="cifra"><div class="n">${d.inventario.items}</div><div class="l">medicamentos en inventario${d.inventario.porVencer ? ` · ${d.inventario.porVencer} por vencer` : ''}</div></div>
    ${ev ? `<div class="cifra espera"><div class="n">${esc(ev.exactitud.split(' ')[1] || ev.exactitud)}</div><div class="l">exactitud en evaluación (${ev.casos} casos)</div></div>` : ''}`;
  $('#actividadInicio').innerHTML = d.recientes.length ? d.recientes.map(c => `
    <li><span class="etiqueta ${nivelDe(c.urgenciaFinal)}">${esc(c.urgenciaFinal)}</span>
        <div>${esc(c.paciente?.nombre || 'Sin nombre')}<small>${esc(c.resumen)}</small></div>
        <small>${fecha(c.fecha)}</small></li>`).join('') : '<li><small>Aún no hay consultas. La actividad aparece aquí.</small></li>';
  const e = ESTADO || {};
  $('#sistemaInicio').innerHTML = `
    <dt>Inferencia</dt><dd>En este equipo, sin nube</dd>
    <dt>Triaje</dt><dd>${esc(e.modelo?.nombre || 'MedPsy-1.7B')}</dd>
    <dt>Visión</dt><dd>${esc(e.vision?.nombre || 'VisionPsy-Nano')}</dd>
    <dt>Guías</dt><dd>${d.guias} documentos MINSA / propios</dd>
    <dt>Distribución</dt><dd><span class="etiqueta emergencia">${d.porNivel.emergencia}</span> <span class="etiqueta hoy">${d.porNivel.hoy}</span> <span class="etiqueta espera">${d.porNivel.espera}</span></dd>`;
}

/* ---------- Historial por cédula ---------- */
async function verHistorial() {
  const ced = $('#cedula').value.trim(); const box = $('#historialPaciente');
  if (!ced) { box.innerHTML = ''; return; }
  const h = await fetch('/api/pacientes/' + encodeURIComponent(ced) + '/historial').then(r => r.json());
  if (!h.length) { box.textContent = 'Paciente nuevo en este puesto.'; return; }
  if (h[0].paciente?.nombre && !$('#nombre').value) $('#nombre').value = h[0].paciente.nombre;
  if (h[0].paciente?.edad && !$('#edad').value) $('#edad').value = h[0].paciente.edad;
  if (h[0].paciente?.sexo && !$('#sexo').value) $('#sexo').value = h[0].paciente.sexo;
  box.innerHTML = `${h.length} consulta${h.length > 1 ? 's' : ''} previa${h.length > 1 ? 's' : ''} — se usarán como antecedente:<ul>${h.slice(0, 3).map(r => `<li>${fecha(r.fecha)}: ${esc(r.descripcion.slice(0, 70))}${r.descripcion.length > 70 ? '…' : ''} <span class="etiqueta ${nivelDe(r.urgenciaFinal)}">${esc(r.urgenciaFinal)}</span></li>`).join('')}</ul>`;
}
$('#cedula').addEventListener('change', verHistorial);

/* ---------- Triaje ---------- */
$('#form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const descripcion = $('#descripcion').value.trim(); if (!descripcion) return;
  const paciente = { nombre: $('#nombre').value, cedula: $('#cedula').value, edad: $('#edad').value, sexo: $('#sexo').value };
  const btn = $('#btnEvaluar'); btn.disabled = true; btn.textContent = 'Evaluando…';
  const out = $('#resultado');
  out.innerHTML = `<ul class="progreso"><li id="p-reglas" class="activo">Protocolo</li><li id="p-guias">Guías locales</li><li id="p-pensando">Razonando</li><li id="p-texto">Redactando</li></ul><div id="parcial"></div>`;
  const paso = (id, c) => { $('#' + id).className = c; };
  let borrador = '';
  try {
    await leerSSE('/api/triaje/stream', { descripcion, paciente }, e => {
      if (e.tipo === 'reglas') { paso('p-reglas', 'hecho'); paso('p-guias', 'activo'); if (e.alertas.length) $('#parcial').innerHTML = `<div class="protocolo"><strong>Alerta por protocolo</strong>${e.alertas.map(esc).join('<br>')}</div>`; }
      else if (e.tipo === 'antecedentes') { if (e.cantidad) $('#parcial').insertAdjacentHTML('beforeend', `<div class="antecedentes"><strong>Antecedentes</strong>${e.cantidad} consulta${e.cantidad > 1 ? 's' : ''} previa${e.cantidad > 1 ? 's' : ''} incluida${e.cantidad > 1 ? 's' : ''} en la evaluación.</div>`); }
      else if (e.tipo === 'guias') { paso('p-guias', 'hecho'); paso('p-pensando', 'activo'); $('#p-guias').textContent = e.usadas ? `Guías locales (${e.usadas})` : 'Guías locales (ninguna relevante)'; }
      else if (e.tipo === 'pensando') $('#p-pensando').textContent = `Razonando (${e.tokens} tokens)`;
      else if (e.tipo === 'texto') { paso('p-pensando', 'hecho'); paso('p-texto', 'activo'); borrador += e.delta; let b = $('#borrador'); if (!b) { b = document.createElement('div'); b.id = 'borrador'; b.className = 'borrador'; $('#parcial').appendChild(b); } b.textContent = borrador; }
      else if (e.tipo === 'fin') { paso('p-texto', 'hecho'); pintarResultado(e.resultado, out); }
      else if (e.tipo === 'error') out.innerHTML = `<div class="vacio"><strong>No se pudo evaluar</strong>${esc(e.mensaje)}</div>`;
    });
  } catch (err) { out.innerHTML = `<div class="vacio"><strong>Sin respuesta del servidor</strong>${esc(err.message)}</div>`; }
  finally { btn.disabled = false; btn.textContent = 'Evaluar caso'; }
});

function parsearRespuesta(txt) {
  const c = {};
  for (const [k, re] of Object.entries({ hallazgos: /HALLAZGOS:\s*(.+)/i, vigilar: /VIGILAR:\s*(.+)/i, preguntar: /PREGUNTAR:\s*(.+)/i, referir: /REFERIR A:\s*(.+)/i })) c[k] = (txt.match(re) || [])[1]?.trim() || '—';
  return c;
}

function pintarResultado(r, contenedor, conAcciones = true) {
  const nivel = nivelDe(r.urgenciaFinal); const c = parsearRespuesta(r.respuesta);
  const alertas = r.reglas?.alertas ?? r.alertasProtocolo ?? []; const fuentes = r.fuentes ?? []; const m = r.metricas ?? {};
  contenedor.innerHTML = `
    <div class="franja ${nivel}"><span class="nivel">${esc(r.urgenciaFinal).toUpperCase()}</span><span class="explica">${EXPLICA[r.urgenciaFinal] || ''}</span></div>
    ${alertas.length ? `<div class="protocolo"><strong>Alerta por protocolo</strong>${alertas.map(esc).join('<br>')}</div>` : ''}
    ${r.antecedentes?.length ? `<div class="antecedentes"><strong>Antecedentes considerados</strong>${r.antecedentes.map(a => `${fecha(a.fecha)}: ${esc(a.descripcion.slice(0, 80))} → ${esc(a.urgenciaFinal)}`).join('<br>')}</div>` : ''}
    <dl class="campos"><dt>Hallazgos</dt><dd>${esc(c.hallazgos)}</dd><dt>Vigilar</dt><dd>${esc(c.vigilar)}</dd><dt>Preguntar</dt><dd>${esc(c.preguntar)}</dd><dt>Referir a</dt><dd>${esc(c.referir)}</dd></dl>
    ${fuentes.length ? `<details><summary>Guías consultadas (${fuentes.length})</summary>${fuentes.map((f, i) => `<div class="fuente"><b>[${i + 1}] ${esc(f.fuente)}</b>${f.texto ? esc(f.texto) : ''}<br><small>relevancia ${f.score}</small></div>`).join('')}</details>`
                     : `<details><summary>Guías consultadas (ninguna superó el umbral)</summary><p class="nota">El modelo respondió con su conocimiento base.</p></details>`}
    <details><summary>Respuesta completa del modelo</summary><div class="borrador">${esc(r.respuesta)}</div></details>
    ${r.pensamiento ? `<details><summary>Razonamiento del modelo</summary><div class="borrador">${esc(r.pensamiento)}</div></details>` : ''}
    <p class="medidas">${esc(m.modelo?.nombre || 'MedPsy-1.7B')} · ${esc(m.dispositivo || '')} · prompt ${m.promptTokens ?? '?'} tok · generados ${m.tokensGenerados ?? '?'} tok · primer token ${m.ttftMs ?? '?'} ms · ${m.tokensPorSegundo ?? '?'} tok/s · total ${m.totalMs ? (m.totalMs / 1000).toFixed(1) + ' s' : '?'}${r.urgenciaIA && r.urgenciaIA !== r.urgenciaFinal ? ` · modelo solo: ${esc(r.urgenciaIA)}` : ''}</p>
    ${conAcciones ? `<div class="acciones"><button class="btn" onclick="location.hash='expedientes'">Ver en expedientes</button><button class="btn" id="btnImprimir">Imprimir nota</button></div>` : ''}`;
  const bi = contenedor.querySelector('#btnImprimir');
  if (bi) bi.onclick = () => imprimirNota(r, { nombre: $('#nombre').value, cedula: $('#cedula').value, edad: $('#edad').value, sexo: $('#sexo').value }, $('#descripcion').value);
}

/* ---------- Nota imprimible ---------- */
function imprimirNota(r, paciente, descripcion) {
  const c = parsearRespuesta(r.respuesta); const alertas = r.reglas?.alertas ?? r.alertasProtocolo ?? []; const fuentes = r.fuentes ?? []; const p = paciente || r.paciente || {};
  $('#nota').innerHTML = `
    <div class="cab"><div style="display:flex;align-items:center;gap:10px"><img src="img/icono.png" alt=""><h1>Nota de triaje</h1></div><small>Centinela — generada localmente el ${fecha(r.metricas?.fecha || new Date().toISOString())}</small></div>
    <div class="datos"><div><b>Paciente:</b> ${esc(p.nombre || 'Sin nombre')}</div><div><b>Cédula:</b> ${esc(p.cedula || '—')}</div><div><b>Edad / sexo:</b> ${esc(p.edad || '—')} / ${esc(p.sexo || '—')}</div></div>
    <h2>Motivo de consulta</h2><p>${esc(descripcion || r.descripcion || '')}</p>
    <h2>Clasificación</h2><div class="urg">${esc(r.urgenciaFinal).toUpperCase()} — ${EXPLICA[r.urgenciaFinal] || ''}</div>
    ${alertas.length ? `<p><b>Alertas por protocolo:</b> ${alertas.map(esc).join('; ')}</p>` : ''}
    <h2>Evaluación</h2><dl><dt>Hallazgos</dt><dd>${esc(c.hallazgos)}</dd><dt>Vigilar</dt><dd>${esc(c.vigilar)}</dd><dt>Pendiente</dt><dd>${esc(c.preguntar)}</dd><dt>Referir a</dt><dd>${esc(c.referir)}</dd></dl>
    ${fuentes.length ? `<h2>Guías consultadas</h2><div class="fuentes">${fuentes.map((f, i) => `<p>[${i + 1}] ${esc(f.fuente)}${f.texto ? ': ' + esc(f.texto.slice(0, 220)) + (f.texto.length > 220 ? '…' : '') : ''}</p>`).join('')}</div>` : ''}
    <div class="firma"><div>Personal de salud que evalúa</div><div>Fecha y hora de referencia</div></div>
    <p class="pie">Documento de apoyo generado por Centinela con ${esc(r.metricas?.modelo?.nombre || 'QVAC MedPsy-1.7B')} ejecutado en este equipo, sin conexión a internet. No constituye diagnóstico; la decisión clínica corresponde al personal de salud.</p>`;
  window.print();
}

/* ---------- Consultar guías ---------- */
const historialGuias = [];
document.querySelectorAll('.sugerencias button').forEach(b => b.onclick = () => { $('#pregunta').value = b.dataset.q; $('#formGuias').requestSubmit(); });
$('#formGuias').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pregunta = $('#pregunta').value.trim(); if (!pregunta) return;
  $('#pregunta').value = '';
  const hilo = $('#hilo'); if (hilo.querySelector('.vacio')) hilo.innerHTML = '';
  const tu = document.createElement('div'); tu.className = 'turno usuario'; tu.textContent = pregunta; hilo.appendChild(tu);
  const ta = document.createElement('div'); ta.className = 'turno asistente pensando'; ta.textContent = 'Buscando en las guías…'; hilo.appendChild(ta);
  ta.scrollIntoView({ behavior: 'smooth', block: 'end' });
  const btn = $('#btnPreguntar'); btn.disabled = true; let texto = '';
  try {
    await leerSSE('/api/consulta/stream', { pregunta, historial: historialGuias }, e => {
      if (e.tipo === 'guias') ta.textContent = e.usadas ? `Razonando con ${e.usadas} fragmento${e.usadas > 1 ? 's' : ''}…` : 'Sin guía relevante. Razonando…';
      else if (e.tipo === 'pensando') ta.textContent = `Razonando (${e.tokens} tokens)…`;
      else if (e.tipo === 'texto') { ta.classList.remove('pensando'); texto += e.delta; ta.textContent = texto; }
      else if (e.tipo === 'fin') {
        const r = e.resultado; ta.classList.remove('pensando'); ta.textContent = r.respuesta;
        const modo = { guias: ['guias', 'Respaldado por guías locales'], general: ['general', 'Conocimiento general del modelo — verificar'], sin_respaldo: ['bloqueado', 'Bloqueado por seguridad: sin guía cargada'] }[r.modo];
        const pie = document.createElement('span'); pie.className = 'respaldo ' + modo[0];
        pie.innerHTML = esc(modo[1]) + (r.fuentes.length ? '<br>' + r.fuentes.map((f, i) => `<span class="fuente-chip">[${i + 1}] ${esc(f.fuente)} · ${f.score}</span>`).join('') : '') + (r.metricas?.totalMs ? `<br><span style="font-family:var(--mono)">${(r.metricas.totalMs / 1000).toFixed(1)} s · ${r.metricas.tokensPorSegundo ?? '?'} tok/s</span>` : '');
        ta.appendChild(pie); historialGuias.push({ rol: 'usuario', texto: pregunta }, { rol: 'asistente', texto: r.respuesta });
      } else if (e.tipo === 'error') { ta.classList.remove('pensando'); ta.textContent = 'No se pudo responder: ' + e.mensaje; }
    });
  } catch (err) { ta.classList.remove('pensando'); ta.textContent = 'Sin respuesta del servidor: ' + err.message; }
  finally { btn.disabled = false; ta.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
});

/* ---------- Expedientes ---------- */
async function cargarExpedientes() {
  const lista = await fetch('/api/expedientes').then(r => r.json());
  $('#detalleExpediente').innerHTML = '';
  if (!lista.length) { $('#listaExpedientes').innerHTML = `<div class="vacio"><strong>Aún no hay consultas</strong>Cada caso evaluado se guarda aquí automáticamente.</div>`; return; }
  $('#listaExpedientes').innerHTML = `<table><thead><tr><th>Fecha</th><th>Paciente</th><th>Motivo</th><th>Urgencia</th></tr></thead><tbody>${lista.map(e => `<tr class="fila-click" data-id="${e.id}">
      <td>${fecha(e.fecha)}</td><td>${esc(e.paciente.nombre)}${e.paciente.edad ? `, ${esc(e.paciente.edad)}` : ''}${e.paciente.cedula ? `<br><small>${esc(e.paciente.cedula)}</small>` : ''}</td>
      <td>${esc(e.resumen)}</td><td><span class="etiqueta ${nivelDe(e.urgenciaFinal)}">${esc(e.urgenciaFinal)}</span></td></tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('tr.fila-click').forEach(tr => tr.onclick = async () => {
    const e = await fetch('/api/expedientes/' + tr.dataset.id).then(r => r.json()); const d = $('#detalleExpediente');
    d.innerHTML = `<h3>${esc(e.paciente.nombre)} — ${fecha(e.fecha)}</h3><p class="nota">${esc(e.descripcion)}</p><div id="detalleCuerpo"></div>`;
    pintarResultado(e, $('#detalleCuerpo'), false);
    d.insertAdjacentHTML('beforeend', '<div class="acciones"><button class="btn" id="btnImprimirExp">Imprimir nota</button></div>');
    $('#btnImprimirExp').onclick = () => imprimirNota(e, e.paciente, e.descripcion);
    d.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ---------- Inventario ---------- */
const zona = $('#zonaFoto'), archivo = $('#archivoFoto');
zona.onclick = () => archivo.click();
zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre'); });
zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); if (e.dataTransfer.files[0]) procesarFoto(e.dataTransfer.files[0]); });
archivo.onchange = () => { if (archivo.files[0]) procesarFoto(archivo.files[0]); archivo.value = ''; };

function redimensionar(file, max = 768) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const esc_ = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = rej; img.src = url;
  });
}

async function procesarFoto(file) {
  const dataUrl = await redimensionar(file);
  const previa = $('#previa'); previa.src = dataUrl; previa.hidden = false;
  const lect = $('#lecturaVision'); lect.hidden = false; lect.textContent = ESTADO?.visionLista ? 'Leyendo la etiqueta…' : 'Cargando VisionPsy (primera vez, descarga ~400 MB)…';
  let texto = '';
  try {
    await leerSSE('/api/inventario/leer', { imagenBase64: dataUrl }, e => {
      if (e.tipo === 'cargando') lect.textContent = 'Cargando VisionPsy…';
      else if (e.tipo === 'texto') { texto += e.delta; lect.textContent = texto; }
      else if (e.tipo === 'fin') {
        const d = e.resultado.datos; const m = e.resultado.metricas;
        if (d) {
          $('#itNombre').value = d.principio || ''; $('#itMarca').value = d.marca || '';
          $('#itConc').value = d.concentracion || ''; $('#itForma').value = d.forma || '';
          $('#itLote').value = d.lote || ''; $('#itVence').value = d.vence || ''; $('#itLab').value = d.laboratorio || '';
          $('#itCant').value = d.cantidad_envase || 1;
          $('#itOrigen').value = 'foto';
          const faltan = ['principio', 'concentracion', 'lote', 'vence'].filter(k => !d[k]);
          lect.innerHTML = `Leído por VisionPsy en ${(m.totalMs / 1000).toFixed(1)} s (${m.tokensPorSegundo ?? '?'} tok/s).${faltan.length ? ` No se vio en la foto: ${faltan.join(', ')}; complétalo o fotografía el otro lado.` : ' Revisa y confirma.'}<details><summary>Texto transcrito</summary><pre>${esc(e.resultado.textoCrudo)}</pre></details>`;
        } else lect.textContent = 'No pude leer la etiqueta.';
        estado();
      } else if (e.tipo === 'error') lect.textContent = 'Error: ' + e.mensaje;
    });
  } catch (err) { lect.textContent = 'Error: ' + err.message; }
}

$('#formItem').addEventListener('submit', async ev => {
  ev.preventDefault();
  const body = { nombre: $('#itNombre').value, marca: $('#itMarca').value, concentracion: $('#itConc').value, forma: $('#itForma').value, lote: $('#itLote').value, vence: $('#itVence').value, laboratorio: $('#itLab').value, cantidad: $('#itCant').value, origen: $('#itOrigen').value };
  const r = await fetch('/api/inventario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
  if (r.error) { alert(r.error); return; }
  $('#formItem').reset(); $('#itCant').value = 1; $('#itOrigen').value = 'manual'; $('#previa').hidden = true; $('#lecturaVision').hidden = true;
  cargarInventario();
});

async function cargarInventario() {
  const grupos = await fetch('/api/inventario/grupos').then(r => r.json());
  const hoy = new Date(); const limite = new Date(); limite.setDate(limite.getDate() + 90);
  const vence = v => { const m = String(v || '').match(/(\d{1,2})[\/\-](\d{4})/); return m ? new Date(+m[2], +m[1], 0) : null; };
  const estadoV = i => { const d = vence(i.vence); return !d ? '<span class="etiqueta neutro">sin fecha</span>' : d < hoy ? '<span class="etiqueta emergencia">vencido</span>' : d <= limite ? '<span class="etiqueta hoy">por vencer</span>' : '<span class="etiqueta espera">vigente</span>'; };
  const todos = grupos.flatMap(g => g.presentaciones);
  const nVenc = todos.filter(i => { const d = vence(i.vence); return d && d < hoy; }).length;
  const nPor = todos.filter(i => { const d = vence(i.vence); return d && d >= hoy && d <= limite; }).length;
  $('#cifrasInv').innerHTML = `
    <div class="cifra"><div class="n">${grupos.length}</div><div class="l">principios activos</div></div>
    <div class="cifra"><div class="n">${todos.length}</div><div class="l">presentaciones</div></div>
    <div class="cifra"><div class="n">${todos.reduce((a, i) => a + i.cantidad, 0)}</div><div class="l">unidades</div></div>
    <div class="cifra ${nPor ? 'hoy' : ''}"><div class="n">${nPor}</div><div class="l">por vencer (90 días)</div></div>
    <div class="cifra ${nVenc ? 'emergencia' : ''}"><div class="n">${nVenc}</div><div class="l">vencidas</div></div>`;
  $('#resumenInv').textContent = '';
  if (!grupos.length) { $('#tablaInventario').innerHTML = `<div class="vacio"><strong>Inventario vacío</strong>Fotografía una caja o agrega un ítem manualmente.</div>`; return; }
  $('#tablaInventario').innerHTML = grupos.map(g => `<details class="grupo" open>
    <summary><div><b>${esc(g.nombre)}</b><small>${g.presentaciones.length} presentación${g.presentaciones.length > 1 ? 'es' : ''} · ${[...new Set(g.presentaciones.map(p => p.laboratorio).filter(Boolean))].join(', ') || 'laboratorio sin registrar'}</small></div>
      <div class="total">${g.unidades}<small> unidades</small></div><div>${g.presentaciones.some(p => vence(p.vence) && vence(p.vence) < hoy) ? '<span class="etiqueta emergencia">vencido</span>' : g.presentaciones.some(p => vence(p.vence) && vence(p.vence) <= limite) ? '<span class="etiqueta hoy">por vencer</span>' : ''}</div></summary>
    <table><thead><tr><th>Presentación</th><th>Lote</th><th>Vence</th><th>Cantidad</th><th></th></tr></thead><tbody>
    ${g.presentaciones.map(i => `<tr data-id="${i.id}">
      <td><b>${esc(i.marca || i.nombre)}</b> ${esc(i.concentracion)} ${esc(i.forma)}<br><small>${esc(i.laboratorio || 'lab. sin registrar')} · ${i.origen === 'foto' ? 'por foto' : 'manual'}</small></td>
      <td><small>${esc(i.lote || '—')}</small></td><td>${esc(i.vence || '—')} ${estadoV(i)}</td>
      <td class="num"><button class="cant-btn" data-id="${i.id}" data-d="-1">−</button> ${i.cantidad} <button class="cant-btn" data-id="${i.id}" data-d="1">+</button></td>
      <td style="white-space:nowrap"><button class="btn" data-edit="${i.id}" style="padding:4px 10px">Editar</button> <button class="btn peligro" data-del="${i.id}" style="padding:4px 10px">Quitar</button></td></tr>`).join('')}
    </tbody></table></details>`).join('');
  document.querySelectorAll('.cant-btn').forEach(b => b.onclick = async () => { await fetch('/api/inventario/' + b.dataset.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: +b.dataset.d }) }); cargarInventario(); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('¿Quitar esta presentación del inventario?')) { await fetch('/api/inventario/' + b.dataset.del, { method: 'DELETE' }); cargarInventario(); } });
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editarFila(b.dataset.edit, todos.find(i => i.id === b.dataset.edit)));
}

function editarFila(id, i) {
  const tr = document.querySelector(`tr[data-id="${id}"]`); if (!tr) return;
  tr.classList.add('editando');
  const inp = (k, ph = '') => `<input data-k="${k}" value="${esc(i[k] ?? '')}" placeholder="${ph}">`;
  tr.innerHTML = `
    <td>${inp('nombre', 'Principio activo')}<div style="margin-top:4px">${inp('marca', 'Marca')}</div><div class="fila" style="margin-top:4px">${inp('concentracion', '500 mg')}${inp('forma', 'tableta')}</div><div style="margin-top:4px">${inp('laboratorio', 'Laboratorio')}</div></td>
    <td>${inp('lote')}</td><td>${inp('vence', 'MM/AAAA')}</td><td>${inp('cantidad')}</td>
    <td style="white-space:nowrap"><button class="btn primario" id="guardarEdit" style="padding:4px 10px">Guardar</button> <button class="btn" id="cancelarEdit" style="padding:4px 10px">Cancelar</button></td>`;
  tr.querySelector('#cancelarEdit').onclick = cargarInventario;
  tr.querySelector('#guardarEdit').onclick = async () => {
    const cambios = {}; tr.querySelectorAll('input[data-k]').forEach(x => cambios[x.dataset.k] = x.value);
    await fetch('/api/inventario/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) });
    cargarInventario();
  };
}

/* ---------- Evidencia ---------- */
async function cargarEvidencia() {
  const { evaluacion, rendimiento } = await fetch('/api/evidencia').then(r => r.json());
  let html = '';
  if (evaluacion) {
    const s = evaluacion.resumen;
    html += `<h3 style="margin-top:0">Evaluación con casos sintéticos</h3><div class="cifras">
        <div class="cifra destacada"><div class="n">${esc(s.exactitud)}</div><div class="l">clasificación correcta</div></div>
        <div class="cifra"><div class="n">${esc(s.emergenciasDetectadas.split(' ')[0])}</div><div class="l">emergencias detectadas (sistema completo)</div></div>
        <div class="cifra"><div class="n">${esc(s.emergenciasDetectadasSoloIA.split(' ')[0])}</div><div class="l">emergencias detectadas (modelo sin reglas)</div></div>
        <div class="cifra"><div class="n">${s.falsasEmergencias}</div><div class="l">falsas emergencias</div></div></div>
      <table><thead><tr><th>#</th><th>Esperado</th><th>Obtenido</th><th>Modelo solo</th><th>Reglas</th><th>Guías</th><th>Tiempo</th></tr></thead><tbody>${evaluacion.resultados.map(r => `<tr>
        <td>${r.id}</td><td><span class="etiqueta ${r.esperado}">${r.esperado}</span></td><td><span class="etiqueta ${nivelDe(r.obtenido)}">${esc(r.obtenido)}</span> ${r.acierto ? '' : '✘'}</td>
        <td>${esc(r.soloIA)}</td><td>${r.reglasDispararon ? 'activadas' : '—'}</td><td>${r.fuentesUsadas}</td><td>${(r.totalMs / 1000).toFixed(0)} s</td></tr>`).join('')}</tbody></table>
      <p class="nota">Casos sintéticos sin datos reales. Corrida del ${fecha(s.fecha)}. Reproducible con <code>node eval/correr.js</code>.</p>`;
  } else html += `<div class="vacio"><strong>Sin evaluación todavía</strong>Corre <code>node eval/correr.js</code> con el servidor activo.</div>`;
  if (rendimiento) {
    html += `<h3>Rendimiento en este equipo</h3><div class="cifras">
        <div class="cifra"><div class="n">${rendimiento.consultas}</div><div class="l">inferencias registradas</div></div>
        <div class="cifra"><div class="n">${rendimiento.ttftPromedioMs ?? '?'} ms</div><div class="l">primer token, promedio</div></div>
        <div class="cifra"><div class="n">${rendimiento.tokensPorSegundoPromedio ?? '?'}</div><div class="l">tokens por segundo, promedio</div></div>
        <div class="cifra"><div class="n">${rendimiento.totalMsPromedio ? (rendimiento.totalMsPromedio / 1000).toFixed(0) + ' s' : '?'}</div><div class="l">respuesta completa, promedio</div></div>
        <div class="cifra"><div class="n">${rendimiento.cargaModeloMs ? (rendimiento.cargaModeloMs / 1000).toFixed(1) + ' s' : '?'}</div><div class="l">carga del modelo</div></div>
        <div class="cifra"><div class="n">${esc(rendimiento.dispositivo || '?')}</div><div class="l">dispositivo de inferencia</div></div></div>
      <p class="nota">Registro completo por inferencia en <code>logs/rendimiento.jsonl</code>: modelo, cuantización, prompt, tokens, TTFT y throughput.</p>`;
  }
  $('#evidencia').innerHTML = html;
}
