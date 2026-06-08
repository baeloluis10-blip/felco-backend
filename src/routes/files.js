// backend/src/routes/files.js
const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const storage = require('../services/storage');

// multer gestiona la subida de archivos al servidor
// memoryStorage = guarda en memoria temporalmente (no en disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }  // Maximo 20 MB por archivo
});

// ── SUBIR UN ARCHIVO ──────────────────────────────────────────
// La app envia: el archivo + el ID del comercial
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    const { comercialId } = req.body;
    if (!comercialId) return res.status(400).json({ error: 'Falta comercialId' });
    if (!req.file)    return res.status(400).json({ error: 'Falta el archivo' });

    const path = await storage.uploadFile(
      comercialId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );
    res.json({ ok: true, path });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── LISTAR ARCHIVOS DE UN COMERCIAL ──────────────────────────
router.get('/list/:comercialId', async (req, res) => {
  try {
    const archivos = await storage.listFiles(req.params.comercialId);
    res.json({ ok: true, archivos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── ELIMINAR UN ARCHIVO ───────────────────────────────────────
router.delete('/:comercialId/:fileName', async (req, res) => {
  try {
    await storage.deleteFile(req.params.comercialId, req.params.fileName);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
