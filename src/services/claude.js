
// backend/src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');
const { getSystemPrompt } = require('../prompts/system');
const { listFiles, downloadFile } = require('./storage');
 
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 
async function xlsxToText(buffer, fileName) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let texto = `--- Contenido de ${fileName} ---\n`;
 
    workbook.SheetNames.forEach(sheetName => {
      const hoja = workbook.Sheets[sheetName];
      const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
      if (!filasCrudas.length) return;
 
      // Muchas tarifas tienen varias filas de logo/dirección/contacto antes
      // de la fila de cabecera real. Se detecta automáticamente buscando,
      // entre las primeras 20 filas, la que tenga más celdas no vacías y
      // sean mayoritariamente texto (no números) — eso suele ser la
      // cabecera real, a diferencia de las filas de título/contacto
      // (pocas celdas) o de producto (mezcla texto+números).
      const ventana = filasCrudas.slice(0, 20);
      let headerIdx = 0;
      let mejorPuntuacion = -1;
      ventana.forEach((fila, idx) => {
        const noVacias = fila.filter(c => c !== '' && c !== null && c !== undefined);
        if (noVacias.length === 0) return;
        const todasTexto = noVacias.every(c => typeof c === 'string');
        const puntuacion = noVacias.length + (todasTexto ? 0.5 : 0);
        if (puntuacion > mejorPuntuacion) {
          mejorPuntuacion = puntuacion;
          headerIdx = idx;
        }
      });
 
      const cabeceras = filasCrudas[headerIdx].map((c, i) => (c || `Columna${i + 1}`).toString().trim());
      texto += `\nHoja: ${sheetName}\n`;
 
      // Filas con una sola celda rellena (ej. "Tijeras de batería con cable")
      // son encabezados de categoría/sección, no productos — se conservan
      // como marcador de sección en vez de tratarlas como una fila de datos.
      filasCrudas.slice(headerIdx + 1).forEach(fila => {
        const noVacias = fila.filter(c => c !== '' && c !== null && c !== undefined);
        if (noVacias.length === 0) return;
 
        if (noVacias.length === 1 && fila[0] && String(fila[0]).trim()) {
          texto += `\n## ${String(fila[0]).trim()}\n`;
          return;
        }
 
        const linea = cabeceras
          .map((cab, i) => (fila[i] !== '' && fila[i] !== undefined ? `${cab}: ${fila[i]}` : null))
          .filter(Boolean)
          .join(' | ');
        if (linea) texto += linea + '\n';
      });
    });
 
    return texto;
  } catch (e) {
    console.warn(`Error convirtiendo XLSX ${fileName}:`, e.message);
    return null;
  }
}
 
async function pdfToText(buffer, fileName) {
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const resultado = await parser.getText();
    return resultado.text || '';
  } catch (e) {
    console.warn(`Error extrayendo texto de PDF ${fileName}:`, e.message);
    return '';
  } finally {
    if (parser) await parser.destroy();
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
      nombre:         fila['Customer Name'] || '',
      contactoNombre: fila['Name'] || '',
      localidad:      fila['Destination'] || '',
      cp:             fila['Postal Code'] || '',
      telefono:       fila['Tel.'] || '',
      email:          fila['E-Mail'] || fila['Customer Mail - Backoffice'] || '',
      customerNo:     fila['Customer No.'] || '',
      comercial:      fila['Sales Rep.'] || '',
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
    const MAX_CHARS = 90000;
    const MAX_CHARS_POR_PDF = 15000;  // catálogos/leaflets: complementarios
    const MAX_CHARS_POR_XLSX = 30000; // tarifas: fuente principal de precios, más presupuesto
    const LIMITE_DOCUMENTO_VISUAL = 5000000; // por encima de esto, solo se envía como texto extraído
 
    for (const archivo of archivos.slice(0, 10)) {
      if (totalChars >= MAX_CHARS) break;
 
      const ext = archivo.name.split('.').pop().toLowerCase();
      const tamanio = archivo.metadata?.size || 0;
 
      if (['xlsx', 'xls'].includes(ext) && archivo.name.toLowerCase().includes('bbddclientes')) {
        continue;
      }
 
      const buffer = await downloadFile(comercialId, archivo.name);
 
      if (ext === 'pdf') {
        if (buffer.length < 500) {
          console.warn(`PDF vacío omitido: ${archivo.name} (${buffer.length} bytes)`);
          continue;
        }
 
        const textoExtraido = await pdfToText(buffer, archivo.name);
 
        if (textoExtraido && textoExtraido.trim().length > 200) {
          // PDF con texto real (tarifas, listados): se manda como texto,
          // independientemente de lo grande que sea el PDF original.
          // Se limita por archivo para que uno solo no agote el presupuesto
          // compartido y deje a los demás PDFs sin espacio.
          const restante = Math.min(MAX_CHARS_POR_PDF, MAX_CHARS - totalChars);
          const truncado = textoExtraido.substring(0, Math.max(0, restante));
          contenidos.push({
            type: 'text',
            text: `--- Tarifa/catálogo extraído de ${archivo.name} ---\n${truncado}`
          });
          totalChars += truncado.length;
          console.log(`PDF convertido a texto: ${archivo.name} (${truncado.length} de ${textoExtraido.length} chars)`);
 
        } else if (tamanio <= LIMITE_DOCUMENTO_VISUAL) {
          // Poco o ningún texto extraíble (probablemente escaneado/imágenes):
          // se manda el PDF como documento visual, solo si no es demasiado grande.
          const base64 = buffer.toString('base64');
          contenidos.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            title: archivo.name
          });
          console.log(`PDF enviado como documento visual (sin texto extraíble): ${archivo.name}`);
 
        } else {
          console.warn(`PDF sin texto extraíble y demasiado grande para enviar como imagen, omitido: ${archivo.name} (${tamanio} bytes)`);
          continue;
        }
 
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
        const texto = await xlsxToText(buffer, archivo.name);
        if (texto) {
          const restante = Math.min(MAX_CHARS_POR_XLSX, MAX_CHARS - totalChars);
          const truncado = texto.substring(0, Math.max(0, restante));
          contenidos.push({ type: 'text', text: truncado });
          totalChars += truncado.length;
          console.log(`XLSX convertido a texto: ${archivo.name} (${truncado.length} de ${texto.length} chars)`);
        } else {
          console.warn(`XLSX sin contenido legible, omitido: ${archivo.name}`);
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
Nº Cliente: ${datosClienteBBDD.customerNo}
Empresa: ${datosClienteBBDD.nombre}
Persona de contacto: ${datosClienteBBDD.contactoNombre}
Teléfono: ${datosClienteBBDD.telefono}
Email: ${datosClienteBBDD.email}
Localidad: ${datosClienteBBDD.localidad}
CP: ${datosClienteBBDD.cp}
Comercial: ${datosClienteBBDD.comercial}
 
Rellena el campo "cliente" del JSON así:
- nombre: usar Empresa
- tipo: el CRM no tiene un campo fiable de tipo de negocio — infiere el tipo (ej. "Distribuidor", "Vivero", "Ferretería agrícola", "Cooperativa") a partir de la descripción de la visita, nunca de los datos del CRM
- localidad: usar Localidad
- contacto: usar "Persona de contacto — Teléfono"`
      });
    }
  }
 
  const archivosComercial = await prepareArchivos(comercialId);
  if (archivosComercial.length > 0) {
    content.push({
      type: 'text',
      text: `Tienes acceso a ${archivosComercial.length} archivos de este comercial. Úsalos para ser específico en precios y referencias.`
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
 
Genera el informe JSON completo según la estructura del system prompt.`
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
 
  const fechaActual = new Date().toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
 
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    system: getSystemPrompt(tipoInforme, fechaActual),
    messages: [{ role: 'user', content }]
  });
 
  const texto_respuesta = response.content[0].text;
  const inicio = texto_respuesta.indexOf('{');
  const fin = texto_respuesta.lastIndexOf('}');
  if (inicio === -1 || fin === -1) throw new Error('No se encontró JSON en la respuesta');
  const json_limpio = texto_respuesta.substring(inicio, fin + 1);
  const datos = JSON.parse(json_limpio);
 
  // Log de verificación: si alguno de estos campos viene vacío, queda
  // registrado en los logs de Railway para poder revisar la respuesta cruda.
  const camposListaClave = {
    oportunidades: datos.oportunidades,
    riesgos: datos.informe_direccion?.riesgos,
    proximos_pasos: datos.informe_direccion?.proximos_pasos,
  };
  Object.entries(camposListaClave).forEach(([campo, valor]) => {
    if (tipoInforme === 'direccion' || campo === 'oportunidades') {
      console.log(`Campo "${campo}":`, JSON.stringify(valor));
    }
  });
 
  return datos;
}
 
module.exports = { generateReport };