// backend/src/routes/report.js
const express = require('express');
const router  = express.Router();
const { generateReport } = require('../services/claude');
const { createDocx } = require('../services/docx');
const { createPdf }  = require('../services/pdf');
const { createCsv }  = require('../services/csv');

router.post('/generate', async (req, res) => {
  try {
    const { texto, fotos, tipoInforme, formatos, comercialId } = req.body;

    // Validar que venga lo minimo necesario
    if (!texto)       return res.status(400).json({ error: 'Falta el texto de la visita' });
    if (!comercialId) return res.status(400).json({ error: 'Falta el ID del comercial' });

    // 1. Llamar a Claude (lee archivos del comercial + texto + fotos)
    const datos = await generateReport({ texto, fotos, tipoInforme, comercialId });

    // 2. Generar los archivos pedidos
    const archivos = {};
    const fmts = formatos || ['word', 'csv'];

    if (fmts.includes('word')) {
      const buf = await createDocx(datos, tipoInforme);
      archivos.word = buf.toString('base64');
    }
    if (fmts.includes('pdf')) {
      const buf = await createPdf(datos, tipoInforme);
      archivos.pdf = buf.toString('base64');
    }
    if (fmts.includes('csv')) {
      const buf = await createCsv(datos.campos_crm);
      archivos.csv = buf.toString('base64');
    }

    res.json({ ok: true, datos, archivos });
  } catch (err) {
    console.error('Error generando informe:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
