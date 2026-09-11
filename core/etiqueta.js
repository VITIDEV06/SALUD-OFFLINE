// Clasificación determinista del texto transcrito de una caja de medicamento.
// VisionPsy transcribe; este módulo decide qué es cada cosa.

export const PRINCIPIOS = [
  'acetaminofen', 'paracetamol', 'ibuprofeno', 'diclofenaco', 'naproxeno', 'aspirina', 'acido acetilsalicilico',
  'metformina', 'gliclazida', 'glibenclamida', 'insulina',
  'losartan', 'enalapril', 'lisinopril', 'perindopril', 'amlodipino', 'indapamida', 'hidroclorotiazida', 'espironolactona', 'irbesartan', 'atenolol', 'carvedilol',
  'atorvastatina', 'rosuvastatina', 'simvastatina',
  'amoxicilina', 'amoxicilina clavulanato', 'ampicilina', 'azitromicina', 'ciprofloxacina', 'cefalexina', 'doxiciclina', 'metronidazol', 'nitrofurantoina', 'trimetoprim sulfametoxazol', 'penicilina', 'clindamicina',
  'omeprazol', 'ranitidina', 'loratadina', 'cetirizina', 'clorfeniramina', 'salbutamol', 'beclometasona', 'prednisona', 'dexametasona', 'hidrocortisona',
  'sales de rehidratacion oral', 'zinc', 'acido folico', 'sulfato ferroso', 'hierro', 'vitamina', 'albendazol', 'mebendazol',
  'ondansetron', 'metoclopramida', 'dimenhidrinato', 'loperamida', 'butilhioscina', 'tramadol', 'ketorolaco', 'levotiroxina', 'clopidogrel', 'warfarina', 'furosemida', 'sertralina', 'fluoxetina', 'diazepam', 'clonazepam', 'oxitocina', 'misoprostol'
];
export const LABORATORIOS = ['pisa', 'bayer', 'pfizer', 'roche', 'novartis', 'sanofi', 'genfar', 'lafrancol', 'mk', 'tecnoquimicas', 'medipharm', 'laboratorios rowe', 'rowe', 'infarma', 'menarini', 'abbott', 'gsk', 'glaxosmithkline', 'teva', 'sandoz', 'cipla', 'lupin', 'sun pharma', 'la sante', 'procaps', 'calox', 'medicamentos genericos', 'ciplaquim', 'bago', 'roemmers', 'megalabs', 'siegfried'];
const FORMAS = ['tableta', 'tabletas', 'comprimido', 'comprimidos', 'capsula', 'capsulas', 'jarabe', 'suspension', 'solucion', 'gotas', 'ampolla', 'ampollas', 'inyectable', 'crema', 'ungüento', 'unguento', 'gel', 'supositorio', 'sobre', 'sobres', 'polvo', 'inhalador', 'ovulo', 'ovulos', 'parche'];

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function clasificarEtiqueta(texto) {
  const t = norm(texto).replace(/[|]/g, ' ');
  const lineas = String(texto).split(/\n+/).map(l => l.trim()).filter(l => l.length > 1);
  const out = { principio: null, marca: null, concentracion: null, forma: null, cantidad_envase: null, lote: null, vence: null, laboratorio: null, via: null };

  // Principio activo: el más largo que aparezca en el texto
  const encontrados = PRINCIPIOS.filter(p => t.includes(p)).sort((a, b) => b.length - a.length);
  if (encontrados.length) out.principio = encontrados[0].replace(/\b\w/g, c => c.toUpperCase());

  // Concentración: número + unidad
  const conc = t.match(/(\d+(?:[.,]\d+)?)\s*(mg\/ml|mg\/5\s?ml|mcg|µg|ug|mg|g|ml|ui|%)\b/);
  if (conc) out.concentracion = `${conc[1].replace(',', '.')} ${conc[2].replace(/\s/g, '')}`;

  // Forma farmacéutica
  const forma = FORMAS.find(f => new RegExp(`\\b${f}\\b`).test(t));
  if (forma) out.forma = forma.replace(/s$/, '') === 'tableta' ? 'tableta' : forma;

  // Cantidad por envase: "caja con 30 tabletas", "30 comprimidos", "x 20"
  const cant = t.match(/(?:caja|frasco|envase|contiene)\s*(?:con|de)?\s*(\d{1,4})\s*(?:tab|comp|caps|sobres|ampoll|unid|ml)/) || t.match(/\b(\d{1,4})\s*(?:tabletas|comprimidos|capsulas|sobres|ampollas)\b/) || t.match(/\bx\s?(\d{1,4})\b/);
  if (cant) out.cantidad_envase = parseInt(cant[1]);

  // Vencimiento: "vence 03/2027", "exp 2027-03", "cad: mar 2027", "03/27"
  const meses = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, jan: 1, apr: 4, aug: 8, dec: 12 };
  let v = t.match(/(?:venc\w*|vence|exp\w*|cad\w*|fecha de vencimiento)[\s:.]*(\d{1,2})[\/.\- ](\d{2,4})/) || t.match(/(?:venc\w*|vence|exp\w*|cad\w*)[\s:.]*([a-z]{3})\w*[\s.\/\-]*(\d{2,4})/) || t.match(/(?:venc\w*|vence|exp\w*|cad\w*)[\s:.]*(\d{4})[\/.\-](\d{1,2})/);
  if (v) {
    let mes, anio;
    if (/^\d{4}$/.test(v[1])) { anio = +v[1]; mes = +v[2]; }
    else if (/^\d+$/.test(v[1])) { mes = +v[1]; anio = +v[2]; }
    else { mes = meses[v[1]]; anio = +v[2]; }
    if (anio < 100) anio += 2000;
    if (mes >= 1 && mes <= 12 && anio >= 2020 && anio <= 2040) out.vence = `${String(mes).padStart(2, '0')}/${anio}`;
  }

  // Lote: "lote ABC123", "lot: 2024A", "l: 55021"
  const lote = t.match(/\b(?:lote|lot|l\.?)[\s:.#]*([a-z0-9][a-z0-9\-\/]{2,14})\b/);
  if (lote && lote[1] !== conc?.[1]) out.lote = lote[1].toUpperCase();

  // Laboratorio: catálogo, o "laboratorio X" / "lab. X"
  const lab = LABORATORIOS.find(l => new RegExp(`\\b${l}\\b`).test(t));
  if (lab) out.laboratorio = lab.replace(/\b\w/g, c => c.toUpperCase());
  else { const m = t.match(/\b(?:laboratorios?|lab\.?)\s+([a-z][a-z&.\- ]{2,25})/); if (m) out.laboratorio = m[1].trim().replace(/\b\w/g, c => c.toUpperCase()); }

  // Vía
  const via = t.match(/\bvia\s*(?:de\s*administracion)?[\s:]*(oral|topica|intramuscular|intravenosa|subcutanea|rectal|inhalada|oftalmica|otica)\b/);
  if (via) out.via = via[1];

  // Marca: primera línea "de título" que no sea el principio, ni concentración, ni palabras de relleno
  const relleno = /propiedad|css|panama|minsa|ministerio|caja con|via de|tableta|comprimid|capsula|mg|ml|lote|vence|exp|reg\.?|sanitario|caja/i;
  const candidatas = lineas.filter(l => l.length >= 3 && l.length <= 30 && !relleno.test(norm(l)) && !/\d/.test(l) && !/:/.test(l)
    && (!out.principio || norm(l) !== norm(out.principio)) && !LABORATORIOS.includes(norm(l).replace(/[^a-z ]/g, '')));
  const marca = candidatas.find(l => /^[A-ZÁÉÍÓÚ][a-záéíóú]{2,}/.test(l)) || candidatas[0];
  if (marca) out.marca = marca.replace(/[®™*]/g, '').trim();
  if (!out.principio && out.marca) out.principio = out.marca; // sin catálogo, la marca hace de nombre

  return out;
}
