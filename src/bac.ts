// ==UserScript==
// @name         Bank Transaction Row Checker (Smart Filter)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds checkboxes to bank transactions, ignoring summary or empty rows
// @match        https://*.sucursalelectronica.com/*
// @match        https://www1.sucursalelectronica.com/ebac/module/consolidatedQuery/consolidatedQuery.go
// @grant        GM_xmlhttpRequest
// @connect      __API_HOST__
// ==/UserScript==
//import 'tampermonkey'

(function () {
  'use strict';

  // Filled in at build time from .env's API_BASE_URL (see scripts/inject-env.js).
  const API_BASE_URL = '__API_BASE_URL__';

  // Row IDs currently checked, mirrored from the backend. Source of truth is
  // the backend; this is a local read cache so enhanceRows() can render
  // checked state synchronously as rows are created.
  const checkedIds = new Set<string>();

  // Every checkbox/row enhanceRows() has created, keyed by row ID, so their
  // visual state can be corrected once the initial backend load resolves
  // (rows may render before that GET completes).
  const trackedRows = new Map<string, { checkbox: HTMLInputElement; row: HTMLTableRowElement }>();

  function applyCheckedVisual(checkbox: HTMLInputElement, row: HTMLTableRowElement, checked: boolean) {
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
          console.error(`[BAC checklist] GET /api/items returned ${res.status}`);
          return;
        }
        try {
          const items = JSON.parse(res.responseText) as { id: string }[];
          items.forEach((item) => checkedIds.add(item.id));
          refreshTrackedRows();
        } catch (err) {
          console.error('[BAC checklist] failed to parse /api/items response', err);
        }
      },
      onerror: (err) => console.error('[BAC checklist] GET /api/items failed', err),
    });
  }

  // Fire-and-forget: the caller already applied the optimistic UI update, so
  // this just needs to get the change to the backend in the background. On
  // failure we log and leave it — no retry queue for a single-user tool.
  function syncItem(rowId: string, checked: boolean) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${API_BASE_URL}/api/items${checked ? '' : '/delete'}`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: rowId }),
      onload: (res) => {
        if (res.status < 200 || res.status >= 300) {
          console.error(`[BAC checklist] sync of ${rowId} returned ${res.status}`);
        }
      },
      onerror: (err) => console.error(`[BAC checklist] sync of ${rowId} failed`, err),
    });
  }

  function enhanceRows(tbody: HTMLTableSectionElement) {
    const rows = tbody.querySelectorAll<HTMLTableRowElement>('tr[statusdisplayrow="true"]');

    // Rows are grouped by card, each group preceded by two header rows (masked
    // card number, then cardholder name) that carry no date. Track the most
    // recently seen card number so it can be folded into the row ID below.
    let currentCard = '';

    // Recomputed from the full current row set on every call (not just the
    // rows newly added since last time), so that occurrence indices for
    // identical rows stay consistent across repeated MutationObserver calls.
    const occurrenceCounts = new Map<string, number>();

    rows.forEach((row) => {
      const allTds = row.querySelectorAll('td');
      const dateTd = allTds[0];
      if (!dateTd) return;

      const dateText = dateTd.textContent.trim();
      const descText = allTds[1]?.textContent.trim() ?? '';

      // Header row: no date. The card-number row is the one containing '*'
      // (the masked digits); the cardholder-name row that follows is ignored.
      if (!dateText) {
        if (descText.includes('*')) {
          currentCard = descText;
        }
        return;
      }

      const crcText = allTds[2]?.textContent.trim() ?? '';
      const usdText = allTds[3]?.textContent.trim() ?? '';
      const amountText = crcText || usdText;

      const baseId = `bac:row:${location.pathname}:${currentCard}:${dateText}:${descText}:${amountText}`;

      // Two transactions can legitimately share the same card/date/description/
      // amount (e.g. the same toll charged twice); disambiguate by occurrence
      // order within this render pass instead of collapsing them into one ID.
      const occurrence = occurrenceCounts.get(baseId) ?? 0;
      occurrenceCounts.set(baseId, occurrence + 1);

      // Prevent duplicate checkboxes
      if (row.dataset.checkboxEnhanced) return;
      row.dataset.checkboxEnhanced = 'true';

      const rowId = `${baseId}:${occurrence}`;

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
        } else {
          checkedIds.delete(rowId);
        }
        syncItem(rowId, checked);
      });

      // Style and inject checkbox
      dateTd.style.display = 'flex';
      dateTd.style.alignItems = 'center';
      dateTd.insertBefore(checkbox, dateTd.firstChild);
    });
  }

  function waitForTable() {
    const observer = new MutationObserver((_, obs) => {
      const tbodyIdsToEnhance = ['tbodycreditCardRecentMovementsTable', 'tbodycreditCardStateTRX', 'transactionTable', 'tbodytransactionTable1']
      tbodyIdsToEnhance.forEach((tbodyId) => {
        const tbody = document.getElementById(tbodyId) as HTMLTableSectionElement
        if (tbody) {
          enhanceRows(tbody);
        }
      })
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  loadItemsFromBackend();
  waitForTable();
})();
