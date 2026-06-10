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

  // Responder inmediatamente
  res.json({ ok: true, message: 'Informe en proceso. Lo recibirás por email en unos minutos.' });

  // Procesar en segundo plano
  (async () => {
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

      await enviarInforme({ datos, tipoInforme, comercialId, archivosAdjuntos: archivos });
      console.log(`Informe enviado: ${comercialId} - ${tipoInforme}`);

    } catch (err) {
      console.error('Error generando informe en background:', err.message);
    }
  })();
});

module.exports = router;