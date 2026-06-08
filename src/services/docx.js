// backend/src/services/docx.js
const { Document, Packer, Paragraph, TextRun, Table,
        TableRow, TableCell, AlignmentType, BorderStyle,
        WidthType, ShadingType, VerticalAlign } = require('docx');

async function createDocx(datos, tipoInforme) {
  const children = [];

  // Cabecera
  children.push(new Paragraph({
    children: [new TextRun({
      text: `Informe ${tipoInforme.toUpperCase()} - ${datos.cliente.nombre}`,
      font: 'Arial', size: 28, bold: true, color: 'E30613'
    })]
  }));

  // Resumen
  children.push(new Paragraph({
    children: [new TextRun({ text: datos.resumen_visita, font: 'Arial', size: 20 })]
  }));

  // Oportunidades
  children.push(new Paragraph({
    children: [new TextRun({ text: 'OPORTUNIDADES DETECTADAS', font: 'Arial', size: 22, bold: true })]
  }));
  datos.oportunidades.forEach(op => {
    children.push(new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text: op, font: 'Arial', size: 19 })]
    }));
  });

  // Productos recomendados
  children.push(new Paragraph({
    children: [new TextRun({ text: 'PRODUCTOS RECOMENDADOS', font: 'Arial', size: 22, bold: true })]
  }));
  datos.productos_recomendados.forEach(prod => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${prod.ref} ${prod.nombre}  `, font: 'Arial', size: 19, bold: true }),
        new TextRun({ text: `Neto: ${prod.precio_neto}EUR | PVP: ${prod.pvp}EUR | Margen: ${prod.margen_pct}%`, font: 'Arial', size: 19, color: 'E30613' }),
        new TextRun({ text: `\n${prod.argumento}`, font: 'Arial', size: 18, break: 1 }),
      ]
    }));
  });

  // Proximos pasos segun tipo de informe
  if (tipoInforme === 'producto' && datos.informe_producto) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'ACCIONES RECOMENDADAS (PRODUCTO)', font: 'Arial', size: 22, bold: true })]
    }));
    datos.informe_producto.acciones_recomendadas.forEach(acc => {
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: acc, font: 'Arial', size: 19 })]
      }));
    });
  }

  // Construir y devolver el documento como Buffer
  const doc = new Document({
    sections: [{ children }]
  });
  return await Packer.toBuffer(doc);
}

module.exports = { createDocx };
