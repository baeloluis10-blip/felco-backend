// backend/src/routes/report.js
const express = require('express');
const router  = express.Router();
const { generateReport } = require('../services/claude');
const { createDocx } = require('../services/docx');
const { createPdf }  = require('../services/pdf');
const { createCsv }  = require('../services/csv');
const { enviarInforme } = require('../services/email');

router.post('/generate', async (req, res) => {
  const { texto, fotos, tipoInforme, formatos, comercialId } = req.body;

  if (!texto)       return res.status(400).json({ error: 'Falta el texto de la visita' });
  if (!comercialId) return res.status(400).json({ error: 'Falta el ID del comercial' });

  try {
    const datos = await generateReport({ texto, fotos, tipoInforme, comercialId });

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

    // Enviar email en segundo plano (no bloquea la respuesta)
    enviarInforme({ datos, tipoInforme, comercialId, archivosAdjuntos: archivos })
      .catch(err => console.error('Error enviando email:', err.message));

    // Responder con los archivos generados
    res.json({ ok: true, datos, archivos });

  } catch (err) {
    console.error('Error generando informe:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;