// backend/src/services/docx.js
const path = require('path');
const fs   = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, ImageRun
} = require('docx');

const ROJO        = 'E30613';
const GRIS_OSCURO = '3D4F52';
const GRIS_CLARO  = 'F5F5F5';
const NEGRO       = '222222';

const LOGO_PATH = path.join(__dirname, '../../assets/logo-felco.jpg');

function parrafoTitulo(texto) {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [new TextRun({
      text: texto.toUpperCase(),
      font: 'Arial', size: 22, bold: true, color: ROJO
    })]
  });
}

function parrafoSubtitulo(texto) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({
      text: texto, font: 'Arial', size: 20, bold: true, color: GRIS_OSCURO
    })]
  });
}

function parrafoTexto(texto) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: texto, font: 'Arial', size: 19, color: NEGRO })]
  });
}

function parrafoBullet(texto) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: texto, font: 'Arial', size: 19, color: NEGRO })]
  });
}

function lineaDivisoria() {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { color: ROJO, size: 6, style: BorderStyle.SINGLE } },
    children: []
  });
}

function celdaHeader(texto, ancho) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new TableCell({
    borders,
    width: { size: ancho, type: WidthType.DXA },
    shading: { fill: ROJO, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({
        text: texto, font: 'Arial', size: 18, bold: true, color: 'FFFFFF'
      })],
      alignment: AlignmentType.CENTER
    })]
  });
}

function tablaProductos(productos) {
  const colWidths = [1200, 2000, 900, 900, 800, 2560];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const filaHeader = new TableRow({
    children: [
      celdaHeader('Referencia', colWidths[0]),
      celdaHeader('Producto', colWidths[1]),
      celdaHeader('Neto EUR', colWidths[2]),
      celdaHeader('PVP EUR', colWidths[3]),
      celdaHeader('Margen', colWidths[4]),
      celdaHeader('Argumento comercial', colWidths[5]),
    ]
  });

  const filas = productos.map((p, i) => new TableRow({
    children: [
      new TableCell({ borders, width: { size: colWidths[0], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: p.ref || '', font: 'Arial', size: 18, bold: true })] })] }),
      new TableCell({ borders, width: { size: colWidths[1], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: p.nombre || '', font: 'Arial', size: 18 })] })] }),
      new TableCell({ borders, width: { size: colWidths[2], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: `${p.precio_neto}`, font: 'Arial', size: 18 })], alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders, width: { size: colWidths[3], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: `${p.pvp}`, font: 'Arial', size: 18 })], alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders, width: { size: colWidths[4], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: `${p.margen_pct}%`, font: 'Arial', size: 18 })], alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders, width: { size: colWidths[5], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: p.argumento || '', font: 'Arial', size: 18 })] })] }),
    ]
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [filaHeader, ...filas]
  });
}

function tablaCompetencia(competencia) {
  const colWidths = [1400, 2000, 1000, 1400, 2560];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const filaHeader = new TableRow({
    children: [
      celdaHeader('Marca', colWidths[0]),
      celdaHeader('Producto', colWidths[1]),
      celdaHeader('PVP EUR', colWidths[2]),
      celdaHeader('Precio compra est.', colWidths[3]),
      celdaHeader('Observaciones', colWidths[4]),
    ]
  });

  const filas = competencia.map((c, i) => new TableRow({
    children: [
      new TableCell({ borders, width: { size: colWidths[0], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: c.marca || '', font: 'Arial', size: 18, bold: true })] })] }),
      new TableCell({ borders, width: { size: colWidths[1], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: c.producto || '', font: 'Arial', size: 18 })] })] }),
      new TableCell({ borders, width: { size: colWidths[2], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: `${c.precio_pvp}`, font: 'Arial', size: 18 })], alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders, width: { size: colWidths[3], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: `${c.precio_compra_est}`, font: 'Arial', size: 18 })], alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders, width: { size: colWidths[4], type: WidthType.DXA }, shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {}, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: c.obs || '', font: 'Arial', size: 18 })] })] }),
    ]
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [filaHeader, ...filas]
  });
}

async function createDocx(datos, tipoInforme) {
  const fecha      = new Date().toLocaleDateString('es-ES');
  const cliente    = datos.cliente?.nombre || 'Cliente no especificado';
  const localidad  = datos.cliente?.localidad || '';
  const tipoLabel  = {
    producto: 'Producto', marketing: 'Marketing',
    direccion: 'Dirección', crm: 'CRM',
    it: 'IT', cliente: 'Cliente'
  }[tipoInforme] || tipoInforme;

  const children = [];

  // ── LOGO ─────────────────────────────────────────────────────
  try {
    const logoBuffer = fs.readFileSync(LOGO_PATH);
    children.push(new Paragraph({
      spacing: { before: 0, after: 200 },
      children: [new ImageRun({
        data: logoBuffer,
        transformation: { width: 180, height: 54 },
        type: 'jpg',
      })]
    }));
  } catch (e) {
    console.warn('Logo no encontrado, se omite:', e.message);
    children.push(new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({
        text: 'FELCO · ALPEN Swiss Tools España',
        font: 'Arial', size: 28, bold: true, color: ROJO
      })]
    }));
  }

  // ── CABECERA ──────────────────────────────────────────────────
  children.push(new Paragraph({
    spacing: { before: 0, after: 200 },
    children: [new TextRun({
      text: `Informe ${tipoLabel} — ${cliente}${localidad ? ', ' + localidad : ''} — ${fecha}`,
      font: 'Arial', size: 20, color: GRIS_OSCURO
    })]
  }));
  children.push(lineaDivisoria());

  // ── DATOS DEL CLIENTE ─────────────────────────────────────────
  children.push(parrafoTitulo('Datos del cliente'));
  const dc = datos.cliente || {};
  children.push(parrafoTexto(`Nombre: ${dc.nombre || '—'}`));
  children.push(parrafoTexto(`Tipo: ${dc.tipo || '—'}`));
  children.push(parrafoTexto(`Localidad: ${dc.localidad || '—'}`));
  children.push(parrafoTexto(`Contacto: ${dc.contacto || '—'}`));

  // ── RESUMEN DE VISITA ─────────────────────────────────────────
  children.push(lineaDivisoria());
  children.push(parrafoTitulo('Resumen de la visita'));
  children.push(parrafoTexto(datos.resumen_visita || ''));

  // ── ALERTA ESTRATÉGICA ────────────────────────────────────────
  if (datos.alerta_estrategica) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 100 },
      shading: { fill: 'FFF3CD', type: ShadingType.CLEAR },
      children: [
        new TextRun({ text: '⚠ ALERTA: ', font: 'Arial', size: 19, bold: true, color: ROJO }),
        new TextRun({ text: datos.alerta_estrategica, font: 'Arial', size: 19, color: NEGRO }),
      ]
    }));
  }

  // ── OPORTUNIDADES ─────────────────────────────────────────────
  children.push(lineaDivisoria());
  children.push(parrafoTitulo('Oportunidades detectadas'));
  (datos.oportunidades || []).forEach(op => children.push(parrafoBullet(op)));

  // ── COMPETENCIA ───────────────────────────────────────────────
  if (datos.competencia_detectada?.length > 0) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Competencia detectada'));
    children.push(tablaCompetencia(datos.competencia_detectada));
  }

  // ── PRODUCTOS RECOMENDADOS ────────────────────────────────────
  if (datos.productos_recomendados?.length > 0) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Productos recomendados'));
    children.push(tablaProductos(datos.productos_recomendados));
  }

  // ── SECCIÓN PRODUCTO ──────────────────────────────────────────
  if (tipoInforme === 'producto' && datos.informe_producto) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Análisis de producto'));
    if (datos.informe_producto.gaps_detectados?.length > 0) {
      children.push(parrafoSubtitulo('Gaps detectados'));
      datos.informe_producto.gaps_detectados.forEach(g => children.push(parrafoBullet(g)));
    }
    if (datos.informe_producto.acciones_recomendadas?.length > 0) {
      children.push(parrafoSubtitulo('Acciones recomendadas'));
      datos.informe_producto.acciones_recomendadas.forEach(a => children.push(parrafoBullet(a)));
    }
  }

  // ── SECCIÓN MARKETING ─────────────────────────────────────────
  if (tipoInforme === 'marketing' && datos.informe_marketing) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe Marketing'));
    children.push(parrafoSubtitulo('Propuesta de valor'));
    children.push(parrafoTexto(datos.informe_marketing.propuesta_valor || ''));
    if (datos.informe_marketing.argumentario_cliente_final?.length > 0) {
      children.push(parrafoSubtitulo('Argumentario para cliente final'));
      datos.informe_marketing.argumentario_cliente_final.forEach(a => children.push(parrafoBullet(a)));
    }
    children.push(parrafoSubtitulo('Campaña junio 2026'));
    children.push(parrafoTexto(datos.informe_marketing.campana_junio_relevante || ''));
  }

  // ── SECCIÓN DIRECCIÓN ─────────────────────────────────────────
  if (tipoInforme === 'direccion' && datos.informe_direccion) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe Dirección'));
    children.push(parrafoSubtitulo('Resumen ejecutivo'));
    children.push(parrafoTexto(datos.informe_direccion.resumen_ejecutivo || ''));
    children.push(parrafoSubtitulo('Oportunidad estimada'));
    children.push(parrafoTexto(`${datos.informe_direccion.oportunidad_estimada_eur || 0} EUR`));
    if (datos.informe_direccion.proximos_pasos?.length > 0) {
      children.push(parrafoSubtitulo('Próximos pasos'));
      datos.informe_direccion.proximos_pasos.forEach(p => children.push(parrafoBullet(p)));
    }
  }

  // ── SECCIÓN IT ────────────────────────────────────────────────
  if (tipoInforme === 'it' && datos.informe_it) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe IT'));
    children.push(parrafoSubtitulo('Sistemas del cliente'));
    children.push(parrafoTexto(datos.informe_it.sistemas_cliente || '—'));
    if (datos.informe_it.integraciones_solicitadas?.length > 0) {
      children.push(parrafoSubtitulo('Integraciones solicitadas'));
      datos.informe_it.integraciones_solicitadas.forEach(i => children.push(parrafoBullet(i)));
    }
    children.push(parrafoSubtitulo('Prioridad'));
    children.push(parrafoTexto(datos.informe_it.prioridad || '—'));
    if (datos.informe_it.acciones_it?.length > 0) {
      children.push(parrafoSubtitulo('Acciones recomendadas'));
      datos.informe_it.acciones_it.forEach(a => children.push(parrafoBullet(a)));
    }
  }

  // ── SECCIÓN CLIENTE ───────────────────────────────────────────
  if (tipoInforme === 'cliente' && datos.informe_cliente) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Propuesta comercial'));
    children.push(parrafoSubtitulo('Propuesta de valor'));
    children.push(parrafoTexto(datos.informe_cliente.propuesta_valor_personalizada || ''));
    if (datos.informe_cliente.argumentario_vs_competencia?.length > 0) {
      children.push(parrafoSubtitulo('Por qué FELCO / ALPEN'));
      datos.informe_cliente.argumentario_vs_competencia.forEach(a => children.push(parrafoBullet(a)));
    }
    children.push(parrafoSubtitulo('Oferta recomendada'));
    children.push(parrafoTexto(datos.informe_cliente.oferta_recomendada || ''));
    children.push(parrafoSubtitulo('Campaña activa'));
    children.push(parrafoTexto(datos.informe_cliente.urgencia_campana || ''));
    children.push(parrafoSubtitulo('Próximo paso'));
    children.push(parrafoTexto(datos.informe_cliente.proximo_paso || ''));
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────
  children.push(lineaDivisoria());
  children.push(new Paragraph({
    spacing: { before: 100 },
    children: [new TextRun({
      text: 'Luis Baelo · 604 23 24 75 | Emilio Esteban · 669 81 69 61 | orders@felco.eu',
      font: 'Arial', size: 16, color: '999999', italics: true
    })]
  }));

  const doc = new Document({
    creator: 'FELCO App',
    title: `Informe ${tipoLabel} — ${cliente}`,
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { createDocx };