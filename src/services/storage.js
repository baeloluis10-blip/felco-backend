// backend/src/services/storage.js
// Este archivo se encarga de guardar, listar y leer los archivos
// de cada comercial en Supabase Storage.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: { transport: ws }
  }
);

const BUCKET = 'comerciales-archivos';

// Guarda un archivo para un comercial concreto
// comercialId: nombre o ID del comercial (ej: 'luis', 'emilio')
// fileName: nombre del archivo (ej: 'catalogo-felco-2026.pdf')
// fileBuffer: el archivo en binario
// mimeType: tipo de archivo (ej: 'application/pdf')
async function uploadFile(comercialId, fileName, fileBuffer, mimeType) {
  const path = `${comercialId}/${fileName}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: true  // Si ya existe, lo sobreescribe
    });
  if (error) throw error;
  return path;
}

// Lista todos los archivos de un comercial
async function listFiles(comercialId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(comercialId);
  if (error) throw error;
  return data || [];
}

// Descarga el contenido de un archivo como texto o base64
async function downloadFile(comercialId, fileName) {
  const path = `${comercialId}/${fileName}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);
  if (error) throw error;
  // Convierte el archivo a Buffer para procesarlo
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Elimina un archivo
async function deleteFile(comercialId, fileName) {
  const path = `${comercialId}/${fileName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);
  if (error) throw error;
}

module.exports = { uploadFile, listFiles, downloadFile, deleteFile };
