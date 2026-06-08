// backend/src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const { getSystemPrompt } = require('../prompts/system');
const { listFiles, downloadFile } = require('./storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Lee los archivos del comercial y los convierte a texto/base64 para Claude
async function prepareArchivos(comercialId) {
  try {
    const archivos = await listFiles(comercialId);
    const contenidos = [];

    for (const archivo of archivos.slice(0, 10)) { // Max 10 archivos
      const buffer = await downloadFile(comercialId, archivo.name);
      const ext = archivo.name.split('.').pop().toLowerCase();

      if (['pdf'].includes(ext)) {
        // Los PDF se envian como imagen/documento a Claude
        contenidos.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: buffer.toString('base64')
          },
          title: archivo.name
        });
      } else if (['jpg','jpeg','png'].includes(ext)) {
        // Las imagenes se envian como imagen
        contenidos.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            data: buffer.toString('base64')
          }
        });
      } else {
        // Excel, CSV, TXT: se convierten a texto
        contenidos.push({
          type: 'text',
          text: `--- Contenido de ${archivo.name} ---\n${buffer.toString('utf8')}`
        });
      }
    }
    return contenidos;
  } catch (err) {
    console.warn('Error leyendo archivos:', err.message);
    return [];  // Si falla, continua sin archivos
  }
}

// Funcion principal: genera el informe completo
async function generateReport({ texto, fotos, tipoInforme, comercialId }) {
  const content = [];

  // 1. Archivos del comercial (catalogos, tarifas, clientes)
  const archivosComercial = await prepareArchivos(comercialId);
  if (archivosComercial.length > 0) {
    content.push({
      type: 'text',
      text: `Tienes acceso a ${archivosComercial.length} archivos de este comercial.
      Usalos para enriquecer el informe con datos especificos y reales.`
    });
    content.push(...archivosComercial);
  }

  // 2. Texto del comercial en lenguaje natural
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

  // 3. Fotos de la visita (lineales, competencia, precios)
  if (fotos && fotos.length > 0) {
    fotos.slice(0, 5).forEach(foto => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: foto.tipo || 'image/jpeg', data: foto.datos }
      });
    });
    content.push({
      type: 'text',
      text: 'Analiza las fotos adjuntas de la visita. Identifica productos de competencia, precios visibles, calidad del expositor y oportunidades estrategicas.'
    });
  }

  // 4. Llamada a Claude
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: getSystemPrompt(),
    messages: [{ role: 'user', content }]
  });

  // 5. Parsear y devolver el JSON
  const texto_respuesta = response.content[0].text;
  return JSON.parse(texto_respuesta);
}

module.exports = { generateReport };
