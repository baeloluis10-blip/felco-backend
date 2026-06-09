// backend/src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const { getSystemPrompt } = require('../prompts/system');
const { listFiles, downloadFile } = require('./storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function prepareArchivos(comercialId) {
  try {
    const archivos = await listFiles(comercialId);
    const contenidos = [];

    for (const archivo of archivos.slice(0, 10)) {
      const buffer = await downloadFile(comercialId, archivo.name);
      const ext = archivo.name.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        const base64 = buffer.toString('base64');
        // Verificar que el PDF tiene contenido real (más de 500 bytes)
        if (buffer.length < 500) {
          console.warn(`PDF vacío omitido: ${archivo.name} (${buffer.length} bytes)`);
          continue;
        }
        contenidos.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64
          },
          title: archivo.name
        });
      } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
        contenidos.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            data: buffer.toString('base64')
          }
        });
      } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        // Excel y CSV: omitidos (binario no legible por Claude)
        console.log(`Omitiendo archivo no soportado por Claude: ${archivo.name}`);
      } else {
        contenidos.push({
          type: 'text',
          text: `--- Contenido de ${archivo.name} ---\n${buffer.toString('utf8')}`
        });
      }
    }
    return contenidos;
  } catch (err) {
    console.warn('Error leyendo archivos:', err.message);
    return [];
  }
}

async function generateReport({ texto, fotos, tipoInforme, comercialId }) {
  const content = [];

  const archivosComercial = await prepareArchivos(comercialId);
  if (archivosComercial.length > 0) {
    content.push({
      type: 'text',
      text: `Tienes acceso a ${archivosComercial.length} archivos de este comercial. Usalos para enriquecer el informe con datos especificos y reales.`
    });
    content.push(...archivosComercial);
  }

  content.push({
    type: 'text',
    text: `REPORTE DE VISITA COMERCIAL
Tipo de informe solicitado: ${tipoInforme}
Comercial: ${comercialId}

DESCRIPCION DE LA VISITA (en lenguaje natural del comercial):
${texto}

Genera el informe JSON completo segun la estructura del system prompt.
Usa los archivos del comercial para ser especifico en precios y referencias.`
  });

  if (fotos && fotos.length > 0) {
    fotos.slice(0, 5).forEach(foto => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: foto.tipo || 'image/jpeg', data: foto.datos }
      });
    });
    content.push({
      type: 'text',
      text: 'Analiza las fotos adjuntas de la visita. Identifica productos de competencia, precios visibles, calidad del expositor y oportunidades estrategicos.'
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: getSystemPrompt(tipoInforme),
    messages: [{ role: 'user', content }]
  });

  const texto_respuesta = response.content[0].text;
  
  // Limpiar posibles markdown fences antes de parsear
  const json_limpio = texto_respuesta.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(json_limpio);
}

module.exports = { generateReport };