import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const RUTA = 'data/expedientes.json';

function leer() {
  if (!existsSync(RUTA)) return [];
  try { return JSON.parse(readFileSync(RUTA, 'utf8')); } catch { return []; }
}

function escribir(lista) {
  mkdirSync('data', { recursive: true });
  writeFileSync(RUTA, JSON.stringify(lista, null, 2));
}

export function guardarConsulta({ paciente, descripcion, resultado }) {
  const lista = leer();
  const registro = {
    id: randomUUID().slice(0, 8),
    fecha: new Date().toISOString(),
    paciente: {
      nombre: paciente?.nombre?.trim() || 'Sin nombre',
      cedula: paciente?.cedula?.trim() || '',
      edad: paciente?.edad || '',
      sexo: paciente?.sexo || ''
    },
    descripcion,
    urgenciaFinal: resultado.urgenciaFinal,
    urgenciaIA: resultado.urgenciaIA,
    alertasProtocolo: resultado.reglas.alertas,
    respuesta: resultado.respuesta,
    fuentes: resultado.fuentes.map(f => ({ fuente: f.fuente, score: f.score })),
    antecedentesUsados: (resultado.antecedentes || []).map(a => a.id),
    pensamiento: resultado.pensamiento || null,
    metricas: resultado.metricas
  };
  lista.unshift(registro);
  escribir(lista);
  return registro;
}

export function listarConsultas() {
  return leer().map(({ id, fecha, paciente, urgenciaFinal, descripcion }) => ({
    id, fecha, paciente, urgenciaFinal,
    resumen: descripcion.length > 90 ? descripcion.slice(0, 90) + '…' : descripcion
  }));
}

export function obtenerConsulta(id) {
  return leer().find(r => r.id === id) || null;
}

export function historialPaciente(cedula) {
  if (!cedula) return [];
  return leer().filter(r => r.paciente.cedula === cedula);
}
