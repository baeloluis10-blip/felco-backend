require('dotenv').config();   // Carga las claves del archivo .env
const express = require('express');
const cors = require('cors');

// Importa las rutas (las crearemos mas adelante)
// const reportRoutes = require('./src/routes/report');
// const filesRoutes  = require('./src/routes/files');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));  // Permite recibir fotos grandes

// Conecta las rutas al servidor
// app.use('/api/report', reportRoutes);
// app.use('/api/files',  filesRoutes);

// Ruta de prueba - si ves {ok:true} el servidor funciona
app.get('/health', (req, res) => res.json({ ok: true, mensaje: 'Servidor funcionando' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
  console.log('Prueba en tu navegador: http://localhost:3000/health');
});
