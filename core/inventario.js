import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const RUTA = 'data/inventario.json';

function leer() {
  if (!existsSync(RUTA)) return [];
  try { return JSON.parse(readFileSync(RUTA, 'utf8')); } catch { return []; }
}
function escribir(lista) { mkdirSync('data', { recursive: true }); writeFileSync(RUTA, JSON.stringify(lista, null, 2)); }

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function listarInventario() {
  return leer().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Agrega un ítem; si ya existe uno con el mismo nombre + concentración + lote, suma la cantidad. */
export function agregarItem({ nombre, marca, concentracion, forma, lote, vence, laboratorio, cantidad, origen }) {
  const lista = leer();
  // Misma presentación = mismo principio + concentración + laboratorio + lote
  const clave = i => [i.nombre, i.concentracion, i.laboratorio, i.lote].map(norm).join('|');
  const nuevo = {
    nombre: (nombre || 'Sin nombre').trim(), marca: (marca || '').trim(), concentracion: concentracion || '', forma: forma || '',
    lote: lote || '', vence: vence || '', laboratorio: laboratorio || '',
    cantidad: Math.max(0, parseInt(cantidad) || 0), origen: origen || 'manual'
  };
  const existente = lista.find(i => clave(i) === clave(nuevo));
  if (existente) {
    existente.cantidad += nuevo.cantidad;
    existente.actualizado = new Date().toISOString();
    if (!existente.vence && nuevo.vence) existente.vence = nuevo.vence;
    escribir(lista);
    return { item: existente, fusionado: true };
  }
  const item = { id: randomUUID().slice(0, 8), ...nuevo, creado: new Date().toISOString(), actualizado: new Date().toISOString() };
  lista.push(item); escribir(lista);
  return { item, fusionado: false };
}

export function editarItem(id, cambios) {
  const lista = leer(); const it = lista.find(i => i.id === id);
  if (!it) return null;
  for (const k of ['nombre', 'marca', 'concentracion', 'forma', 'lote', 'vence', 'laboratorio']) if (k in cambios) it[k] = String(cambios[k] ?? '').trim();
  if ('cantidad' in cambios) it.cantidad = Math.max(0, parseInt(cambios.cantidad) || 0);
  it.actualizado = new Date().toISOString();
  escribir(lista); return it;
}

/** Agrupa por principio activo: cada grupo con sus presentaciones (marca/lab/concentración/lote). */
export function inventarioAgrupado() {
  const grupos = {};
  for (const i of leer()) {
    const k = norm(i.nombre);
    (grupos[k] ||= { nombre: i.nombre, unidades: 0, presentaciones: [] });
    grupos[k].unidades += i.cantidad;
    grupos[k].presentaciones.push(i);
  }
  return Object.values(grupos).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function ajustarCantidad(id, delta) {
  const lista = leer(); const it = lista.find(i => i.id === id);
  if (!it) return null;
  it.cantidad = Math.max(0, it.cantidad + delta); it.actualizado = new Date().toISOString();
  escribir(lista); return it;
}

export function eliminarItem(id) {
  const lista = leer(); const n = lista.length;
  escribir(lista.filter(i => i.id !== id)); return lista.length !== n;
}

/** Resumen para el panel de inicio: total, por vencer (< 90 días), sin stock. */
export function resumenInventario() {
  const lista = leer(); const hoy = new Date();
  const meses = v => { const m = String(v).match(/(\d{1,2})\s*[\/-]\s*(\d{4})/); return m ? new Date(+m[2], +m[1], 0) : null; };
  const porVencer = lista.filter(i => { const d = meses(i.vence); return d && (d - hoy) / 86400000 < 90; }).length;
  return { items: lista.length, unidades: lista.reduce((a, i) => a + i.cantidad, 0), porVencer, sinStock: lista.filter(i => i.cantidad === 0).length };
}
