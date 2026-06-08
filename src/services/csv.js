// backend/src/services/csv.js
const fs = require('fs');
const path = require('path');

async function createCsv(camposCrm) {
  // Lee la configuracion de columnas del CRM
  const configPath = path.join(__dirname, '../config/crm-fields.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const sep = config.separador || ';';

  // Cabecera del CSV (nombres de columnas del CRM)
  const cabecera = config.campos.map(c => c.columna_crm).join(sep);

  // Fila de datos
  const fila = config.campos.map(c => {
    let valor = camposCrm[c.campo_claude] || '';
    // Evitar que las comas/puntos y coma rompan el CSV
    valor = String(valor).replace(new RegExp(sep, 'g'), ' ');
    return valor;
  }).join(sep);

  const csv = `${cabecera}\n${fila}`;
  return Buffer.from(csv, 'utf8');
}

module.exports = { createCsv };
