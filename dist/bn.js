"use strict";
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
    function enhanceRows(tbody) {
        const rows = tbody.querySelectorAll('.gridEditItemStyle, .gridAlternatingItems');
        rows.forEach((row) => {
            var _a, _b;
            const allTds = row.querySelectorAll('td');
            const firstTd = allTds[0];
            if (!firstTd)
                return;
            // Skip if first <td> is empty or only contains whitespace
            const hasText = firstTd.textContent.trim().length > 0;
            if (!hasText)
                return;
            // Prevent duplicate checkboxes
            if (row.dataset.checkboxEnhanced)
                return;
            row.dataset.checkboxEnhanced = 'true';
            const dateRowText = (_a = allTds[0]) === null || _a === void 0 ? void 0 : _a.textContent.trim();
            const descRowText = (_b = allTds[4]) === null || _b === void 0 ? void 0 : _b.textContent.trim();
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
                }
                else {
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
    const tbodyIdsToEnhance = ['BNCRMP_cphContenidoPagina_dtgMovimientos'];
    tbodyIdsToEnhance.forEach((tbodyId) => {
        const tbody = document.getElementById(tbodyId);
        if (tbody) {
            enhanceRows(tbody);
        }
    });
})();
