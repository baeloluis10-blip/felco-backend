// backend/src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const XLSX = require('xlsx');
const { getSystemPrompt } = require('../prompts/system');
const { listFiles, downloadFile } = require('./storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function xlsxToText(buffer, fileName) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let texto = `--- Contenido de ${fileName} ---\n`;
    workbook.SheetNames.forEach(sheetName => {
      const hoja = workbook.Sheets[sheetName];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      texto += `\nHoja: ${sheetName}\n`;
      filas.slice(0, 100).forEach(fila => {
        const linea = Object.entries(fila)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');
        texto += linea + '\n';
      });
    });
    return texto;
  } catch (e) {
    console.warn(`Error convirtiendo XLSX ${fileName}:`, e.message);
    return null;
  }
}

async function prepareArchivos(comercialId) {
  try {
    const archivos = await listFiles(comercialId);
    const contenidos = [];
    let totalChars = 0;
    const MAX_CHARS = 50000;

    for (const archivo of archivos.slice(0, 10)) {
      if (totalChars >= MAX_CHARS) break;

      const buffer = await downloadFile(comercialId, archivo.name);
      const ext = archivo.name.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        if (buffer.length < 500) {
          console.warn(`PDF vacío omitido: ${archivo.name} (${buffer.length} bytes)`);
          continue;
        }
        const base64 = buffer.toString('base64');
        contenidos.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
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

      } else if (['xlsx', 'xls'].includes(ext)) {
        // Omitir BBDDclientes — no es relevante para el informe
        if (archivo.name.toLowerCase().includes('bbddclientes')) {
          console.log(`Omitiendo BBDD clientes: ${archivo.name}`);
          continue;
        }
        const texto = await xlsxToText(buffer, archivo.name);
        if (texto) {
          const truncado = texto.substring(0, Math.min(6000, MAX_CHARS - totalChars));
          contenidos.push({ type: 'text', text: truncado });
          totalChars += truncado.length;
          console.log(`XLSX convertido a texto: ${archivo.name} (${truncado.length} chars)`);
        }

      } else if (ext === 'csv') {
        const texto = buffer.toString('utf8').substring(0, 5000);
        contenidos.push({ type: 'text', text: `--- ${archivo.name} ---\n${texto}` });
        totalChars += texto.length;

      } else {
        const texto = buffer.toString('utf8').substring(0, 3000);
        contenidos.push({ type: 'text', text: `--- ${archivo.name} ---\n${texto}` });
        totalChars += texto.length;
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
      text: `Tienes acceso a ${archivosComercial.length} archivos de este comercial con tarifas y catálogos reales. Úsalos para ser específico en precios y referencias.`
    });
    content.push(...archivosComercial);
  }

  content.push({
    type: 'text',
    text: `REPORTE DE VISITA COMERCIAL
Tipo de informe solicitado: ${tipoInforme}
Comercial: ${comercialId}

DESCRIPCIÓN DE LA VISITA:
${texto}

Genera el informe JSON completo según la estructura del system prompt.
Usa los archivos del comercial para ser específico en precios y referencias.`
  });

  if (fotos && fotos.length > 0) {
    fotos.slice(0, 3).forEach(foto => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: foto.tipo || 'image/jpeg', data: foto.datos }
      });
    });
    content.push({
      type: 'text',
      text: 'Analiza las fotos adjuntas. Identifica productos de competencia, precios visibles y oportunidades.'
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: getSystemPrompt(tipoInforme),
    messages: [{ role: 'user', content }]
  });

  const texto_respuesta = response.content[0].text;
  const json_limpio = texto_respuesta.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(json_limpio);
}

module.exports = { generateReport };