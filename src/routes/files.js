const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const storage = require('../services/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }  // 200 MB
});

router.post('/upload', (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ ok: false, error: `Error multer: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
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

router.get('/list/:comercialId', async (req, res) => {
  try {
    const archivos = await storage.listFiles(req.params.comercialId);
    res.json({ ok: true, archivos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/:comercialId/:fileName', async (req, res) => {
  try {
    await storage.deleteFile(req.params.comercialId, req.params.fileName);
    res.json({ ok: true });
  } catch (err) {
    console.error('ERROR UPLOAD:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;