import { generar } from './medpsy.js';
import { buscar } from './rag.js';

const UMBRAL = 0.5;

// Preguntas que solo se responden con respaldo en guías locales
const PIDE_DOSIS = /\b(dosis|dosificaci[oó]n|mg\b|ml\b|miligramos|cu[aá]ntas? (pastillas|gotas|tabletas)|cada \d+ horas|posolog[ií]a|cu[aá]nto (le )?doy|qu[eé] (le )?doy|qu[eé] medicamento|tratamiento|recet[aeo]|prescri|antibi[oó]tico|analg[eé]sico|jarabe|pastilla)/i;

const SISTEMA_GUIAS = `Eres un asistente para personal de salud de un puesto rural. Respondes preguntas clínicas prácticas.
Tienes GUÍAS DE REFERENCIA locales. Primero decide si las guías tratan la pregunta:
- Si SÍ: responde basándote en ellas y cita el fragmento con su número, por ejemplo [1].
- Si NO: responde exactamente "Las guías cargadas no tratan este tema." y no cites nada.
Nunca inventes dosis, marcas ni precios. Responde en español, frases cortas, máximo 8 líneas.`;

const SISTEMA_GENERAL = `Eres un asistente para personal de salud de un puesto rural. No hay guías locales para esta pregunta.
Responde con conocimiento general en español, máximo 6 líneas. No des dosis, cantidades, ni nombres de medicamentos. Nunca inventes precios.`;

const palabras = t => new Set((t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-zñ]{5,}/g) || []));

/**
 * Responde una pregunta sobre las guías. `historial` son turnos previos [{rol:'usuario'|'asistente', texto}].
 * Devuelve { modo:'guias'|'general'|'sin_respaldo', respuesta, fuentes, pensamiento?, metricas? }
 */
export async function consultar(pregunta, historial = [], onEvento = () => {}) {
  const rag = await buscar(pregunta, 4);
  const pq = palabras(pregunta);
  const fuentes = rag.fragmentos.filter(f => f.score >= UMBRAL && [...palabras(f.texto)].some(w => pq.has(w)));
  onEvento({ tipo: 'guias', usadas: fuentes.length, descartadas: rag.fragmentos.length - fuentes.length });

  // Regla dura: dosis/medicamentos sin guía → no se consulta al modelo
  // Se evalúa la pregunta y el turno anterior del usuario, para que un "pero y..." no esquive el bloqueo
  const turnoPrevio = [...historial].reverse().find(t => t.rol === 'usuario')?.texto || '';
  if (!fuentes.length && (PIDE_DOSIS.test(pregunta) || PIDE_DOSIS.test(turnoPrevio))) {
    const respuesta = 'No hay una guía cargada en este equipo que respalde dosis o tratamiento para esta pregunta. Para que Centinela responda, agrega el protocolo o vademécum correspondiente en la carpeta corpus/ y vuelve a ingestar.';
    onEvento({ tipo: 'texto', delta: respuesta });
    return { modo: 'sin_respaldo', respuesta, fuentes: [], metricas: { totalMs: 0, operacion: 'consulta-bloqueada' } };
  }

  const contexto = fuentes.map((f, i) => `[${i + 1}] (${f.fuente}) ${f.texto}`).join('\n\n');
  const previos = historial.slice(-4).map(t => ({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.texto }));
  const mensajes = [
    ...previos,
    { role: 'user', content: fuentes.length ? `GUÍAS DE REFERENCIA:\n${contexto}\n\nPREGUNTA: ${pregunta}` : `PREGUNTA: ${pregunta}` }
  ];

  const r = await generar({
    sistema: fuentes.length ? SISTEMA_GUIAS : SISTEMA_GENERAL,
    mensajes,
    etiqueta: fuentes.length ? 'consulta-guias' : 'consulta-general',
    onEvento
  });

  return { modo: fuentes.length ? 'guias' : 'general', fuentes, ...r };
}
