// ==UserScript==
// @name         Bank Transaction Row Checker for BN
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds checkboxes to bank transactions, ignoring summary or empty rows
// @match        https://bncr.bnonline.fi.cr/BNCR.InternetBanking.Web/CuentasSOA/MovimientosCuenta.aspx
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==
//import 'tampermonkey'

(function () {
  'use strict';

  function enhanceRows(tbody: HTMLTableSectionElement) {
    const rows = tbody.querySelectorAll<HTMLTableRowElement>('.gridEditItemStyle, .gridAlternatingItems');

    rows.forEach((row) => {
      const allTds = row.querySelectorAll('td');
      const firstTd = allTds[0];
      if (!firstTd) return;

      // Skip if first <td> is empty or only contains whitespace
      const hasText = firstTd.textContent.trim().length > 0;
      if (!hasText) return;

      // Prevent duplicate checkboxes
      if (row.dataset.checkboxEnhanced) return;
      row.dataset.checkboxEnhanced = 'true';

      const dateRowText = allTds[0]?.textContent.trim()
      const descRowText = allTds[4]?.textContent.trim()

      const rowId = `bn:row:${location.pathname}:${dateRowText}:${descRowText}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '8px';

      const saved = GM_getValue(rowId);
      if (saved) {
        checkbox.checked = true;
        row.style.textDecoration = 'line-through';
        row.style.opacity = '0.5';
      }

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          row.style.textDecoration = 'line-through';
          row.style.opacity = '0.5';
          GM_setValue(rowId, true);
        } else {
          row.style.textDecoration = '';
          row.style.opacity = '';
          GM_deleteValue(rowId);
        }
      });

      // Style and inject checkbox
      firstTd.style.display = 'flex';
      firstTd.style.alignItems = 'center';
      firstTd.insertBefore(checkbox, firstTd.firstChild);
    });
  }

  const tbodyIdsToEnhance = ['BNCRMP_cphContenidoPagina_dtgMovimientos']
  tbodyIdsToEnhance.forEach((tbodyId) => {
    const tbody = document.getElementById(tbodyId) as HTMLTableSectionElement
    if (tbody) {
      enhanceRows(tbody);
    }
  })
})();
