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

async function buscarClienteEnBBDD(comercialId, nombreCliente) {
  try {
    const archivos = await listFiles(comercialId);
    const bbdd = archivos.find(a => a.name.toLowerCase().includes('bbddclientes'));
    if (!bbdd) return null;

    const buffer = await downloadFile(comercialId, bbdd.name);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

    const q = nombreCliente.toLowerCase();
    const fila = filas.find(f =>
      (f['Customer Name'] || '').toLowerCase().includes(q) ||
      (f['Search name'] || '').toLowerCase().includes(q) ||
      (f['Name'] || '').toLowerCase().includes(q)
    );

    if (!fila) return null;

    return {
      nombre:     fila['Customer Name'] || fila['Name'] || '',
      localidad:  fila['Destination'] || '',
      cp:         fila['Postal Code'] || '',
      telefono:   fila['Tel.'] || '',
      email:      fila['E-Mail'] || '',
      customerNo: fila['Customer No.'] || '',
      comercial:  fila['Sales Rep.'] || '',
      tipo:       fila['Duty'] || '',
    };
  } catch (e) {
    console.warn('Error buscando cliente en BBDD:', e.message);
    return null;
  }
}

async function prepareArchivos(comercialId) {
  try {
    const archivos = await listFiles(comercialId);
    const contenidos = [];
    let totalChars = 0;
    const MAX_CHARS = 10000;

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

      } else if (false && ['xlsx', 'xls'].includes(ext)) {
        // Omitir BBDDclientes — se procesa por separado
        if (archivo.name.toLowerCase().includes('bbddclientes')) {
          console.log(`Omitiendo BBDD clientes de archivos: ${archivo.name}`);
          continue;
        }
        const texto = await xlsxToText(buffer, archivo.name);
        if (texto) {
          const truncado = texto.substring(0, Math.min(3000, MAX_CHARS - totalChars));
          contenidos.push({ type: 'text', text: truncado });
          totalChars += truncado.length;
          console.log(`XLSX convertido a texto: ${archivo.name} (${truncado.length} chars)`);
        }

      } else if (ext === 'csv') {
        const texto = buffer.toString('utf8').substring(0, 3000);
        contenidos.push({ type: 'text', text: `--- ${archivo.name} ---\n${texto}` });
        totalChars += texto.length;

      } else {
        const texto = buffer.toString('utf8').substring(0, 2000);
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

  // ── BUSCAR CLIENTE EN BBDD ────────────────────────────────────
  // Extraer nombre del cliente del texto para buscarlo en la BBDD
  const nombreMatch = texto.match(/DATOS CLIENTE CRM:\s*Nombre:\s*([^\n]+)/);
  const nombreCliente = nombreMatch ? nombreMatch[1].trim() : null;

  let datosClienteBBDD = null;
  if (nombreCliente) {
    datosClienteBBDD = await buscarClienteEnBBDD(comercialId, nombreCliente);
    if (datosClienteBBDD) {
      console.log(`Cliente encontrado en BBDD: ${datosClienteBBDD.nombre}`);
      content.push({
        type: 'text',
        text: `DATOS OFICIALES DEL CLIENTE (extraídos de BBDDclientes):
Nombre: ${datosClienteBBDD.nombre}
Tipo: ${datosClienteBBDD.tipo}
Localidad: ${datosClienteBBDD.localidad}
CP: ${datosClienteBBDD.cp}
Teléfono: ${datosClienteBBDD.telefono}
Email: ${datosClienteBBDD.email}
Nº Cliente: ${datosClienteBBDD.customerNo}
Comercial: ${datosClienteBBDD.comercial}

Usa estos datos para rellenar el campo "cliente" del JSON con la máxima precisión.`
      });
    }
  }

  // ── ARCHIVOS DEL COMERCIAL ────────────────────────────────────
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
    max_tokens: 2048,
    system: getSystemPrompt(tipoInforme),
    messages: [{ role: 'user', content }]
  });

  const texto_respuesta = response.content[0].text;
  const json_limpio = texto_respuesta.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(json_limpio);
}

module.exports = { generateReport };