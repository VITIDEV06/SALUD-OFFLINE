// Capa de protocolo: reglas deterministas. Fijan el nivel MÍNIMO de urgencia,
// independientemente de lo que responda el modelo. Manejan negaciones ("sin fiebre").

const BANDERAS = [
  { patron: /dolor (en el |de )?pecho|opresi[oó]n tor[aá]cica/i, alerta: 'Dolor torácico: descartar síndrome coronario agudo' },
  { patron: /dificultad (para )?respirar|falta de aire|disnea|no puede terminar frases|labios morados/i, alerta: 'Dificultad respiratoria' },
  { patron: /p[eé]rdida de (la )?conciencia|desmay|inconsciente|convulsi|dif[ií]cil de despertar/i, alerta: 'Alteración de conciencia o convulsión' },
  { patron: /sangrado (abundante|profuso)|hemorragia|sangra(do)? que no para/i, alerta: 'Hemorragia' },
  { patron: /par[aá]lisis|no puede mover|cara ca[ií]da|habla arrastrada/i, alerta: 'Déficit neurológico agudo: posible ACV' },
  { patron: /embaraz.*(sangrado|dolor fuerte)|(sangrado|dolor fuerte).*embaraz/i, alerta: 'Emergencia obstétrica' },
  { patron: /(beb[eé]|lactante|reci[eé]n nacido).*(fiebre|no come|letargo|muy dormido)/i, alerta: 'Lactante con signo de peligro' },
  { patron: /hinch[oó] (la )?(cara|labios|lengua)|se le cierra la garganta/i, alerta: 'Posible anafilaxia' },
  { patron: /hacerse da[ñn]o|quitarse la vida|suicid|no quiere vivir/i, alerta: 'Riesgo de autolesión: atención inmediata' }
];

const SEGUNDO_NIVEL = [
  { patron: /no puede (caminar|apoyar|cargar peso|mover)|no carga peso|cojea mucho/i, alerta: 'No carga peso o no moviliza: evaluar hoy' },
  { patron: /sal(e|iendo) (l[ií]quido|pus|secreci[oó]n)|supura|derrame/i, alerta: 'Herida o articulación con secreción: evaluar hoy' },
  { patron: /fiebre (de )?(3[89]|40)|fiebre alta|39\.\d|40\.\d/i, alerta: 'Fiebre alta: evaluar hoy' },
  { patron: /v[oó]mit.*(ni[ñn]|beb[eé]|lactante)|(ni[ñn]|beb[eé]|lactante).*v[oó]mit/i, alerta: 'Vómitos en menor: evaluar hoy' },
  { patron: /herida.*(profund|abierta|sutur)|(profund|abierta).*herida|cortada.*profund/i, alerta: 'Herida que puede requerir sutura: evaluar hoy' },
  { patron: /ardor al orinar|orina con sangre|dolor (al|para) orinar/i, alerta: 'Síntomas urinarios: evaluar hoy' },
  { patron: /dolor.*(8|9|10)\/10|dolor (intenso|severo|muy fuerte)/i, alerta: 'Dolor intenso: evaluar hoy' }
];

const NEGACION = /\b(sin|no|niega|ninguna?|nada de)\s+(\w+\s+){0,2}$/i;

function coincideSinNegacion(patron, texto) {
  const re = new RegExp(patron.source, 'gi');
  let m;
  while ((m = re.exec(texto)) !== null) {
    const antes = texto.slice(Math.max(0, m.index - 25), m.index);
    if (!NEGACION.test(antes)) return true;
  }
  return false;
}

function presion(texto) {
  const m = texto.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return m ? { sis: +m[1], dia: +m[2] } : null;
}

const NEURO = /visi[oó]n borrosa|confusi[oó]n|dolor de cabeza (fuerte|intenso|severo)|cefalea/i;

export function evaluar(texto) {
  const alertas = BANDERAS.filter(b => coincideSinNegacion(b.patron, texto)).map(b => b.alerta);

  const pa = presion(texto);
  if (pa) {
    if (pa.sis >= 180 || pa.dia >= 120) alertas.push(`Presión ${pa.sis}/${pa.dia}: crisis hipertensiva`);
    else if ((pa.sis >= 160 || pa.dia >= 100) && NEURO.test(texto)) alertas.push(`Presión ${pa.sis}/${pa.dia} con síntomas neurológicos: posible emergencia hipertensiva`);
    if (pa.sis < 90) alertas.push(`Presión ${pa.sis}/${pa.dia}: hipotensión, descartar shock`);
  }

  const alertasHoy = SEGUNDO_NIVEL.filter(b => coincideSinNegacion(b.patron, texto)).map(b => b.alerta);

  return {
    urgenciaMinima: alertas.length ? 'emergencia' : alertasHoy.length ? 'hoy' : null,
    alertas: [...alertas, ...alertasHoy]
  };
}
