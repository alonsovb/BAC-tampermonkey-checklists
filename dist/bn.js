"use strict";
// ==UserScript==
// @name         Bank Transaction Row Checker for BN
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds checkboxes to bank transactions, ignoring summary or empty rows
// @match        https://bncr.bnonline.fi.cr/BNCR.InternetBanking.Web/CuentasSOA/MovimientosCuenta.aspx
// @grant        GM_xmlhttpRequest
// @connect      192.168.1.100:8000
// ==/UserScript==
//import 'tampermonkey'
(function () {
    'use strict';
    // Filled in at build time from .env's API_BASE_URL (see scripts/inject-env.js).
    const API_BASE_URL = 'http://192.168.1.100:8000';
    // Row IDs currently checked, mirrored from the backend. Source of truth is
    // the backend; this is a local read cache so enhanceRows() can render
    // checked state synchronously as rows are created.
    const checkedIds = new Set();
    // Every checkbox/row enhanceRows() has created, keyed by row ID, so their
    // visual state can be corrected once the initial backend load resolves
    // (rows may render before that GET completes).
    const trackedRows = new Map();
    function applyCheckedVisual(checkbox, row, checked) {
        checkbox.checked = checked;
        row.style.textDecoration = checked ? 'line-through' : '';
        row.style.opacity = checked ? '0.5' : '';
    }
    function refreshTrackedRows() {
        trackedRows.forEach(({ checkbox, row }, rowId) => {
            applyCheckedVisual(checkbox, row, checkedIds.has(rowId));
        });
    }
    function loadItemsFromBackend() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_BASE_URL}/api/items`,
            onload: (res) => {
                if (res.status < 200 || res.status >= 300) {
                    console.error(`[BN checklist] GET /api/items returned ${res.status}`);
                    return;
                }
                try {
                    const items = JSON.parse(res.responseText);
                    items.forEach((item) => checkedIds.add(item.id));
                    refreshTrackedRows();
                }
                catch (err) {
                    console.error('[BN checklist] failed to parse /api/items response', err);
                }
            },
            onerror: (err) => console.error('[BN checklist] GET /api/items failed', err),
        });
    }
    // Fire-and-forget: the caller already applied the optimistic UI update, so
    // this just needs to get the change to the backend in the background. On
    // failure we log and leave it — no retry queue for a single-user tool.
    function syncItem(rowId, checked) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_BASE_URL}/api/items${checked ? '' : '/delete'}`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ id: rowId }),
            onload: (res) => {
                if (res.status < 200 || res.status >= 300) {
                    console.error(`[BN checklist] sync of ${rowId} returned ${res.status}`);
                }
            },
            onerror: (err) => console.error(`[BN checklist] sync of ${rowId} failed`, err),
        });
    }
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
            applyCheckedVisual(checkbox, row, checkedIds.has(rowId));
            trackedRows.set(rowId, { checkbox, row });
            checkbox.addEventListener('change', () => {
                const checked = checkbox.checked;
                applyCheckedVisual(checkbox, row, checked);
                if (checked) {
                    checkedIds.add(rowId);
                }
                else {
                    checkedIds.delete(rowId);
                }
                syncItem(rowId, checked);
            });
            // Style and inject checkbox
            firstTd.style.display = 'flex';
            firstTd.style.alignItems = 'center';
            firstTd.insertBefore(checkbox, firstTd.firstChild);
        });
    }
    const tbodyIdsToEnhance = ['BNCRMP_cphContenidoPagina_dtgMovimientos'];
    loadItemsFromBackend();
    tbodyIdsToEnhance.forEach((tbodyId) => {
        const tbody = document.getElementById(tbodyId);
        if (tbody) {
            enhanceRows(tbody);
        }
    });
})();
