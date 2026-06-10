// backend/src/services/email.js
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarInforme({ datos, tipoInforme, comercialId, archivosAdjuntos }) {
  const fecha = new Date().toLocaleDateString('es-ES');
  const cliente = datos.cliente?.nombre || 'Cliente sin identificar';
  const localidad = datos.cliente?.localidad || '';

  const tipoLabel = {
    producto: 'Producto',
    marketing: 'Marketing',
    direccion: 'Dirección',
    crm: 'CRM',
  }[tipoInforme] || tipoInforme;

  const subject = `Informe ${tipoLabel} — ${cliente}${localidad ? ', ' + localidad : ''} — ${fecha}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background-color: #E30613; padding: 16px 24px; margin-bottom: 24px;">
        <span style="color: white; font-size: 18px; font-weight: bold;">FELCO · ALPEN Swiss Tools</span>
        <span style="color: white; font-size: 14px; float: right;">Informe ${tipoLabel}</span>
      </div>

      <h2 style="color: #333;">${cliente}${localidad ? ' — ' + localidad : ''}</h2>
      <p style="color: #666;">Fecha: ${fecha} | Comercial: ${comercialId}</p>

      <h3 style="color: #E30613;">Resumen de la visita</h3>
      <p>${datos.resumen_visita || ''}</p>

      ${datos.alerta_estrategica ? `
      <div style="background: #fff3cd; border-left: 4px solid #E30613; padding: 12px; margin: 16px 0;">
        <strong>⚠️ Alerta estratégica:</strong> ${datos.alerta_estrategica}
      </div>` : ''}

      <h3 style="color: #E30613;">Oportunidades</h3>
      <ul>${(datos.oportunidades || []).map(o => `<li>${o}</li>`).join('')}</ul>

      <h3 style="color: #E30613;">Productos recomendados</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px; text-align:left;">Referencia</th>
          <th style="padding:8px; text-align:left;">Producto</th>
          <th style="padding:8px; text-align:right;">Neto</th>
          <th style="padding:8px; text-align:right;">PVP</th>
          <th style="padding:8px; text-align:left;">Argumento</th>
        </tr>
        ${(datos.productos_recomendados || []).map(p => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding:8px;">${p.ref}</td>
          <td style="padding:8px;">${p.nombre}</td>
          <td style="padding:8px; text-align:right;">${p.precio_neto} EUR</td>
          <td style="padding:8px; text-align:right;">${p.pvp} EUR</td>
          <td style="padding:8px;">${p.argumento}</td>
        </tr>`).join('')}
      </table>

      ${tipoInforme === 'producto' && datos.informe_producto ? `
      <h3 style="color: #E30613;">Análisis de Producto</h3>
      <h4>Gaps detectados</h4>
      <ul>${(datos.informe_producto.gaps_detectados || []).map(g => `<li>${g}</li>`).join('')}</ul>
      <h4>Acciones recomendadas</h4>
      <ul>${(datos.informe_producto.acciones_recomendadas || []).map(a => `<li>${a}</li>`).join('')}</ul>
      ` : ''}

      ${tipoInforme === 'marketing' && datos.informe_marketing ? `
      <h3 style="color: #E30613;">Informe Marketing</h3>
      <p><strong>Propuesta de valor:</strong> ${datos.informe_marketing.propuesta_valor}</p>
      <h4>Argumentario cliente final</h4>
      <ul>${(datos.informe_marketing.argumentario_cliente_final || []).map(a => `<li>${a}</li>`).join('')}</ul>
      <p><strong>Campaña junio:</strong> ${datos.informe_marketing.campana_junio_relevante}</p>
      ` : ''}

      ${tipoInforme === 'direccion' && datos.informe_direccion ? `
      <h3 style="color: #E30613;">Informe Dirección</h3>
      <p><strong>Resumen ejecutivo:</strong> ${datos.informe_direccion.resumen_ejecutivo}</p>
      <p><strong>Oportunidad estimada:</strong> ${datos.informe_direccion.oportunidad_estimada_eur} EUR</p>
      <h4>Próximos pasos</h4>
      <ul>${(datos.informe_direccion.proximos_pasos || []).map(p => `<li>${p}</li>`).join('')}</ul>
      ` : ''}

      <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px;">
        Luis Baelo · 604 23 24 75 | Emilio Esteban · 669 81 69 61 | orders@felco.eu
      </p>
    </div>
  `;

  const attachments = [];
  if (archivosAdjuntos?.word) {
    attachments.push({
      filename: `informe_${cliente.replace(/\s/g, '_')}_${fecha.replace(/\//g, '-')}.docx`,
      content: archivosAdjuntos.word,
    });
  }
  if (archivosAdjuntos?.pdf) {
    attachments.push({
      filename: `informe_${cliente.replace(/\s/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`,
      content: archivosAdjuntos.pdf,
    });
  }

  await resend.emails.send({
    from: 'FELCO App <onboarding@resend.dev>',
    to: 'lbaelo@felco.com',
    subject,
    html,
    attachments,
  });
}

module.exports = { enviarInforme };
