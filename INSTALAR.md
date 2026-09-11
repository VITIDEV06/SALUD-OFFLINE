# Puesta en marcha rápida

Checklist para dejar Centinela corriendo desde cero en una máquina Windows.

## 1. Requisitos

- Node.js 22.17 o superior (`node -v`)
- ~3 GB libres para los modelos
- Internet solo la primera vez, para instalar y descargar modelos

Si PowerShell bloquea npm:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Instalar

```powershell
npm install
```

## 3. Indexar las guías

```powershell
node ingestar.js
```

Descarga EmbeddingGemma (328 MB) la primera vez. Al terminar imprime cuántos fragmentos indexó. Repetir este paso cada vez que se agregue o cambie un archivo de `corpus/`. El servidor debe estar apagado mientras se ingesta.

## 4. Arrancar

```powershell
node server.js
```

Orden esperado en consola: embeddings listos → `[medpsy] listo` → `Centinela listo (triaje y guías)` → descarga de VisionPsy (410 MB la primera vez) → `VisionPsy listo`. Abrir http://localhost:3000

Para omitir VisionPsy en equipos con poca RAM:

```powershell
$env:SIN_VISION="1"; node server.js
```

## 5. Evaluación

Con el servidor corriendo, en **otra** terminal:

```powershell
node eval/correr.js
```

Tarda entre 10 y 20 minutos (15 casos). Escribe `eval/resultados.json`, que la pestaña Evidencia muestra dentro de la aplicación. Pegar el resumen en el README antes de entregar.

## 6. Pruebas de humo antes de grabar el video

1. Triaje: `mujer de 45 años, dolor de cabeza fuerte desde hace 3 días, visión borrosa, presión 170/110` → EMERGENCIA, alerta por protocolo y guía MINSA citada.
2. Triaje: `niño de 8 años, tos seca desde ayer, sin fiebre, come y juega normal` → ESPERA, sin fuentes sobre el umbral.
3. Consultar guías: `¿con qué se inicia el tratamiento de hipertensión?` → cita la vía clínica del MINSA.
4. Consultar guías: `¿qué dosis de amoxicilina le doy a un niño de 15 kg?` → bloqueado al instante, sin llamar al modelo.
5. Inventario: foto de una caja → campos rellenados; lo que no aparece en la foto queda vacío.
6. Apagar el wifi y repetir el paso 1: debe funcionar igual.

## Problemas comunes

**`RPC_INIT_TIMEOUT`**: el worker no arrancó a tiempo. Causas habituales: hay otro proceso de Node usando los modelos (`taskkill /F /IM node.exe`), o Windows Defender está escaneando el binario la primera vez. `rpcInitTimeoutMs` ya está en 180000 en `qvac.config.json`.

**La búsqueda no devuelve las guías nuevas**: falta correr `node ingestar.js` después de copiar los archivos, con el servidor apagado.

**Respuestas sin formato**: revisar la sección «Respuesta completa del modelo» en el resultado para ver qué escribió el modelo.
