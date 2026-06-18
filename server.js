require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reportRoutes = require('./src/routes/report');
const filesRoutes  = require('./src/routes/files');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/report', reportRoutes);
app.use('/api/files',  filesRoutes);

app.get('/health', (req, res) => res.json({ ok: true, mensaje: 'Servidor funcionando' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
  console.log('BUILD: 2026-06-18 — cuadro resumen Producto + tarifas PDF + fix oferta cliente');
});