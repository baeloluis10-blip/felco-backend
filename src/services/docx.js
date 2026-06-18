
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
const AZUL_DIAG   = 'E3EBF2';
 
const LOGO_PATH = path.join(__dirname, '../../assets/logo-felco.jpg');
 
function fmtEUR(valor) {
  const num = Number(valor) || 0;
  return num.toFixed(2).replace('.', ',') + ' EUR';
}
 
// Recalcula subtotales y totales de la oferta a partir de las líneas
// (cantidad, precio_neto_unitario, pvp_unitario) en vez de confiar en que
// la IA haga la aritmética correctamente. "descuento_pct" sí viene de la
// IA porque depende de las reglas de campaña, no es aritmética pura.
function recalcularOferta(oferta) {
  if (!oferta?.lineas?.length) return oferta;
 
  const lineas = oferta.lineas.map(l => {
    const cantidad = Number(l.cantidad) || 0;
    const precioNeto = Number(l.precio_neto_unitario) || 0;
    const pvpUnitario = Number(l.pvp_unitario ?? l.precio_neto_unitario) || 0;
    return {
      ...l,
      cantidad,
      precio_neto_unitario: precioNeto,
      pvp_unitario: pvpUnitario,
      subtotal_neto: +(cantidad * precioNeto).toFixed(2),
      subtotal_pvp: +(cantidad * pvpUnitario).toFixed(2),
    };
  });
 
  const subtotalNeto = +lineas.reduce((s, l) => s + l.subtotal_neto, 0).toFixed(2);
  const subtotalPvp   = +lineas.reduce((s, l) => s + l.subtotal_pvp, 0).toFixed(2);
  const descuentoPct  = Number(oferta.descuento_pct) || 0;
  const totalConDescuento = +(subtotalNeto * (1 - descuentoPct / 100)).toFixed(2);
  const margenMedioPct = subtotalPvp > 0
    ? +(((subtotalPvp - subtotalNeto) / subtotalPvp) * 100).toFixed(1)
    : 0;
 
  // Aproximación del ahorro por evitar la subida +6% del 1/7/2026
  // (la tarifa excluye FELCO 2e y FELCO 834 de la subida)
  const subtotalSujetoSubida = lineas
    .filter(l => !/2e|834/i.test(l.producto || ''))
    .reduce((s, l) => s + l.subtotal_neto, 0);
  const ahorroVsSubida = +(subtotalSujetoSubida * 0.06).toFixed(2);
 
  return {
    ...oferta,
    lineas,
    subtotal_neto: subtotalNeto,
    total_con_descuento: totalConDescuento,
    pvp_sugerido_total: subtotalPvp,
    margen_medio_pct: margenMedioPct,
    ahorro_vs_subida_eur: ahorroVsSubida,
  };
}
 
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
 
// Convierte cualquier elemento de un array (string, número, objeto anidado)
// en texto legible y descarta los que queden vacíos. Esto evita títulos de
// sección sin contenido cuando la IA devuelve un objeto en vez de un string
// (p. ej. {"riesgo":"...","probabilidad":"...","impacto":"..."} en vez de
// "Riesgo: ... — Probabilidad: ... — Impacto: ...").
function normalizarLista(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number') return String(item);
      if (typeof item === 'object') {
        return Object.values(item)
          .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
          .join(' — ');
      }
      return String(item);
    })
    .filter(texto => texto.trim().length > 0);
}
 
function lineaDivisoria() {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { color: ROJO, size: 6, style: BorderStyle.SINGLE } },
    children: []
  });
}
 
// ── BLOQUE DE DIAGNÓSTICO (resaltado, antes de cada sección de recomendaciones) ──
function bloqueDiagnostico(texto) {
  if (!texto) return [];
  return [new Paragraph({
    spacing: { before: 100, after: 150 },
    shading: { fill: AZUL_DIAG, type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: 'DIAGNÓSTICO: ', font: 'Arial', size: 19, bold: true, color: GRIS_OSCURO }),
      new TextRun({ text: texto, font: 'Arial', size: 19, color: NEGRO }),
    ]
  })];
}
 
// ── BLOQUE RESUMEN + PUNTOS (Campaña activa / Próximo paso) ──
function bloqueResumenPuntos(titulo, bloque) {
  const out = [];
  if (!bloque) return out;
  out.push(parrafoSubtitulo(titulo));
  if (bloque.resumen) out.push(parrafoTexto(bloque.resumen));
  (bloque.puntos || []).forEach(p => out.push(parrafoBullet(p)));
  return out;
}
 
// ── RESUMEN DE TOTALES DE LA OFERTA ──
function bloqueResumenOferta(oferta) {
  const out = [];
  const filas = [];
  if (oferta.subtotal_neto)        filas.push(['Subtotal neto', fmtEUR(oferta.subtotal_neto)]);
  if (oferta.descuento_pct)        filas.push(['Descuento campaña', `${oferta.descuento_pct}%`]);
  if (oferta.total_con_descuento)  filas.push(['Total con descuento', fmtEUR(oferta.total_con_descuento)]);
  if (oferta.pvp_sugerido_total)   filas.push(['PVP sugerido total', fmtEUR(oferta.pvp_sugerido_total)]);
  if (oferta.margen_medio_pct)     filas.push(['Margen medio', `${oferta.margen_medio_pct}%`]);
  if (oferta.incluye_vitrina)      filas.push(['Vitrina incluida', oferta.incluye_vitrina]);
  if (oferta.ahorro_vs_subida_eur) filas.push(['Ahorro vs subida 1/7', fmtEUR(oferta.ahorro_vs_subida_eur)]);
 
  filas.forEach(([label, valor]) => {
    out.push(new Paragraph({
      spacing: { before: 30, after: 30 },
      children: [
        new TextRun({ text: `${label}: `, font: 'Arial', size: 19, bold: true, color: GRIS_OSCURO }),
        new TextRun({ text: valor, font: 'Arial', size: 19, color: NEGRO }),
      ]
    }));
  });
  return out;
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
 
function celdaCuerpo(texto, ancho, i, alineacion = AlignmentType.LEFT, bold = false) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new TableCell({
    borders,
    width: { size: ancho, type: WidthType.DXA },
    shading: i % 2 === 0 ? { fill: GRIS_CLARO, type: ShadingType.CLEAR } : {},
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: alineacion,
      children: [new TextRun({ text: String(texto ?? ''), font: 'Arial', size: 18, bold })]
    })]
  });
}
 
function tablaProductos(productos) {
  const colWidths = [1200, 2000, 900, 900, 800, 2560];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
 
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
      celdaCuerpo(p.ref, colWidths[0], i, AlignmentType.LEFT, true),
      celdaCuerpo(p.nombre, colWidths[1], i),
      celdaCuerpo(`${p.precio_neto}`, colWidths[2], i, AlignmentType.RIGHT),
      celdaCuerpo(`${p.pvp}`, colWidths[3], i, AlignmentType.RIGHT),
      celdaCuerpo(`${p.margen_pct}%`, colWidths[4], i, AlignmentType.RIGHT),
      celdaCuerpo(p.argumento, colWidths[5], i),
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
      celdaCuerpo(c.marca, colWidths[0], i, AlignmentType.LEFT, true),
      celdaCuerpo(c.producto, colWidths[1], i),
      celdaCuerpo(`${c.precio_pvp}`, colWidths[2], i, AlignmentType.RIGHT),
      celdaCuerpo(`${c.precio_compra_est}`, colWidths[3], i, AlignmentType.RIGHT),
      celdaCuerpo(c.obs, colWidths[4], i),
    ]
  }));
 
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [filaHeader, ...filas]
  });
}
 
// ── TABLA DE OFERTA (informe Cliente) ──
function tablaOferta(oferta) {
  if (!oferta?.lineas?.length) return null;
  const colWidths = [3200, 700, 1450, 1450, 1450];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
 
  const filaHeader = new TableRow({
    children: [
      celdaHeader('Producto', colWidths[0]),
      celdaHeader('Uds', colWidths[1]),
      celdaHeader('Precio neto', colWidths[2]),
      celdaHeader('PVP', colWidths[3]),
      celdaHeader('Subtotal neto', colWidths[4]),
    ]
  });
 
  const filas = oferta.lineas.map((l, i) => new TableRow({
    children: [
      celdaCuerpo(l.producto, colWidths[0], i, AlignmentType.LEFT, true),
      celdaCuerpo(`${l.cantidad ?? ''}`, colWidths[1], i, AlignmentType.RIGHT),
      celdaCuerpo(fmtEUR(l.precio_neto_unitario), colWidths[2], i, AlignmentType.RIGHT),
      celdaCuerpo(fmtEUR(l.pvp_unitario), colWidths[3], i, AlignmentType.RIGHT),
      celdaCuerpo(fmtEUR(l.subtotal_neto), colWidths[4], i, AlignmentType.RIGHT, true),
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
 
  // ── PRIORIDAD Y DECISIÓN REQUERIDA (no aplica a "Solo CRM") ────
  if (tipoInforme !== 'crm') {
    const coloresPrioridad = { alta: 'C0392B', media: 'B7791F', baja: '2D7A3A' };
    const nivelPrioridad = String(datos.prioridad_informe || '').toLowerCase();
    if (datos.prioridad_informe) {
      children.push(new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({ text: 'Prioridad: ', font: 'Arial', size: 19, bold: true, color: NEGRO }),
          new TextRun({
            text: String(datos.prioridad_informe).toUpperCase(),
            font: 'Arial', size: 19, bold: true,
            color: coloresPrioridad[nivelPrioridad] || NEGRO
          }),
        ]
      }));
    }
    if (datos.decision_requerida) {
      children.push(new Paragraph({
        spacing: { before: 60, after: 200 },
        shading: { fill: 'E8F0FE', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: '➤ Decisión requerida: ', font: 'Arial', size: 19, bold: true, color: ROJO }),
          new TextRun({ text: datos.decision_requerida, font: 'Arial', size: 19, color: NEGRO }),
        ]
      }));
    }
  }
 
  // ── OPORTUNIDADES (solo si hay datos) ─────────────────────────
  const oportunidadesLista = normalizarLista(datos.oportunidades);
  if (oportunidadesLista.length > 0) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Oportunidades detectadas'));
    oportunidadesLista.forEach(op => children.push(parrafoBullet(op)));
  }
 
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
    bloqueDiagnostico(datos.informe_producto.diagnostico_competitivo).forEach(p => children.push(p));
    if (datos.informe_producto.especificacion_exacta_solicitada) {
      children.push(parrafoSubtitulo('Especificación exacta solicitada'));
      children.push(parrafoTexto(datos.informe_producto.especificacion_exacta_solicitada));
    }
    const gapsLista = normalizarLista(datos.informe_producto.gaps_detectados);
    if (gapsLista.length > 0) {
      children.push(parrafoSubtitulo('Gaps detectados'));
      gapsLista.forEach(g => children.push(parrafoBullet(g)));
    }
    const accionesProductoLista = normalizarLista(datos.informe_producto.acciones_recomendadas);
    if (accionesProductoLista.length > 0) {
      children.push(parrafoSubtitulo('Acciones recomendadas'));
      accionesProductoLista.forEach(a => children.push(parrafoBullet(a)));
    }
  }
 
  // ── SECCIÓN MARKETING ─────────────────────────────────────────
  if (tipoInforme === 'marketing' && datos.informe_marketing) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe Marketing'));
    bloqueDiagnostico(datos.informe_marketing.diagnostico_posicionamiento).forEach(p => children.push(p));
    if (datos.informe_marketing.competencia_visibilidad) {
      children.push(parrafoSubtitulo('Visibilidad de la competencia en el punto de venta'));
      children.push(parrafoTexto(datos.informe_marketing.competencia_visibilidad));
    }
    const materialesLista = normalizarLista(datos.informe_marketing.materiales_que_faltan);
    if (materialesLista.length > 0) {
      children.push(parrafoSubtitulo('Materiales que faltan'));
      materialesLista.forEach(m => children.push(parrafoBullet(m)));
    }
    const accionesLocalesLista = normalizarLista(datos.informe_marketing.acciones_locales);
    if (accionesLocalesLista.length > 0) {
      children.push(parrafoSubtitulo('Acciones locales'));
      accionesLocalesLista.forEach(a => children.push(parrafoBullet(a)));
    }
    const argumentarioLista = normalizarLista(datos.informe_marketing.argumentario_cliente_final);
    if (argumentarioLista.length > 0) {
      children.push(parrafoSubtitulo('Argumentario para cliente final'));
      argumentarioLista.forEach(a => children.push(parrafoBullet(a)));
    }
    if (datos.informe_marketing.campana_junio_relevante) {
      children.push(parrafoSubtitulo('Campaña junio 2026'));
      children.push(parrafoTexto(datos.informe_marketing.campana_junio_relevante));
    }
  }
 
  // ── SECCIÓN DIRECCIÓN ─────────────────────────────────────────
  if (tipoInforme === 'direccion' && datos.informe_direccion) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe Dirección'));
    bloqueDiagnostico(datos.informe_direccion.diagnostico_estrategico).forEach(p => children.push(p));
    children.push(parrafoSubtitulo('Resumen ejecutivo'));
    children.push(parrafoTexto(datos.informe_direccion.resumen_ejecutivo || ''));
    children.push(parrafoSubtitulo('Oportunidad estimada'));
    children.push(parrafoTexto(fmtEUR(datos.informe_direccion.oportunidad_estimada_eur || 0)));
    const riesgosLista = normalizarLista(datos.informe_direccion.riesgos);
    if (riesgosLista.length > 0) {
      children.push(parrafoSubtitulo('Riesgos'));
      riesgosLista.forEach(r => children.push(parrafoBullet(r)));
    }
    const proximosPasosLista = normalizarLista(datos.informe_direccion.proximos_pasos);
    if (proximosPasosLista.length > 0) {
      children.push(parrafoSubtitulo('Próximos pasos'));
      proximosPasosLista.forEach(p => children.push(parrafoBullet(p)));
    }
  }
 
  // ── SECCIÓN IT ────────────────────────────────────────────────
  if (tipoInforme === 'it' && datos.informe_it) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Informe IT'));
    bloqueDiagnostico(datos.informe_it.diagnostico_tecnologico).forEach(p => children.push(p));
    children.push(parrafoSubtitulo('Sistemas del cliente'));
    children.push(parrafoTexto(datos.informe_it.sistemas_cliente || '—'));
    const integracionesLista = normalizarLista(datos.informe_it.integraciones_solicitadas);
    if (integracionesLista.length > 0) {
      children.push(parrafoSubtitulo('Integraciones solicitadas'));
      integracionesLista.forEach(i => children.push(parrafoBullet(i)));
    }
    children.push(parrafoSubtitulo('Prioridad'));
    children.push(parrafoTexto(datos.informe_it.prioridad || '—'));
    if (datos.informe_it.complejidad_estimada) {
      children.push(parrafoSubtitulo('Complejidad estimada'));
      children.push(parrafoTexto(datos.informe_it.complejidad_estimada));
    }
    const accionesItLista = normalizarLista(datos.informe_it.acciones_it);
    if (accionesItLista.length > 0) {
      children.push(parrafoSubtitulo('Acciones recomendadas'));
      accionesItLista.forEach(a => children.push(parrafoBullet(a)));
    }
  }
 
  // ── SECCIÓN CLIENTE ───────────────────────────────────────────
  if (tipoInforme === 'cliente' && datos.informe_cliente) {
    children.push(lineaDivisoria());
    children.push(parrafoTitulo('Propuesta comercial'));
 
    if (datos.informe_cliente.ahorro_destacado) {
      children.push(new Paragraph({
        spacing: { before: 60, after: 200 },
        shading: { fill: 'E8F5E9', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: '💰 ', font: 'Arial', size: 22 }),
          new TextRun({ text: datos.informe_cliente.ahorro_destacado, font: 'Arial', size: 22, bold: true, color: '2D7A3A' }),
        ]
      }));
    }
 
    bloqueDiagnostico(datos.informe_cliente.diagnostico_cliente).forEach(p => children.push(p));
 
    children.push(parrafoSubtitulo('Propuesta de valor'));
    children.push(parrafoTexto(datos.informe_cliente.propuesta_valor_personalizada || ''));
 
    const argVsCompetenciaLista = normalizarLista(datos.informe_cliente.argumentario_vs_competencia);
    if (argVsCompetenciaLista.length > 0) {
      children.push(parrafoSubtitulo('Por qué FELCO / ALPEN'));
      argVsCompetenciaLista.forEach(a => children.push(parrafoBullet(a)));
    }
 
    const oferta = recalcularOferta(datos.informe_cliente.oferta_recomendada);
    const tabla = tablaOferta(oferta);
    if (tabla) {
      children.push(parrafoSubtitulo('Oferta recomendada'));
      children.push(tabla);
      bloqueResumenOferta(oferta).forEach(p => children.push(p));
    }
 
    bloqueResumenPuntos('Campaña activa', datos.informe_cliente.urgencia_campana).forEach(p => children.push(p));
    bloqueResumenPuntos('Próximo paso', datos.informe_cliente.proximo_paso).forEach(p => children.push(p));
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