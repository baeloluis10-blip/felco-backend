// backend/src/services/pdf.js
const PDFDocument = require('pdfkit');

async function createPdf(datos, tipoInforme) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabecera
    doc.fontSize(18).fillColor('#E30613')
       .text(`Informe ${tipoInforme.toUpperCase()} - ${datos.cliente.nombre}`, { align: 'left' });
    doc.moveDown();

    // Resumen
    doc.fontSize(11).fillColor('#000000')
       .text(datos.resumen_visita);
    doc.moveDown();

    // Oportunidades
    doc.fontSize(13).fillColor('#000000').font('Helvetica-Bold')
       .text('OPORTUNIDADES DETECTADAS');
    doc.font('Helvetica').fontSize(11);
    datos.oportunidades.forEach(op => {
      doc.text(`• ${op}`);
    });
    doc.moveDown();

    // Productos recomendados
    doc.fontSize(13).font('Helvetica-Bold')
       .text('PRODUCTOS RECOMENDADOS');
    doc.font('Helvetica').fontSize(11);
    datos.productos_recomendados.forEach(prod => {
      doc.font('Helvetica-Bold').text(`${prod.ref} ${prod.nombre}`);
      doc.font('Helvetica').fillColor('#E30613')
         .text(`Neto: ${prod.precio_neto}EUR | PVP: ${prod.pvp}EUR | Margen: ${prod.margen_pct}%`);
      doc.fillColor('#000000').text(prod.argumento);
      doc.moveDown(0.5);
    });

    // Acciones recomendadas
    if (tipoInforme === 'producto' && datos.informe_producto) {
      doc.fontSize(13).font('Helvetica-Bold')
         .text('ACCIONES RECOMENDADAS (PRODUCTO)');
      doc.font('Helvetica').fontSize(11);
      datos.informe_producto.acciones_recomendadas.forEach(acc => {
        doc.text(`• ${acc}`);
      });
    }

    doc.end();
  });
}

module.exports = { createPdf };