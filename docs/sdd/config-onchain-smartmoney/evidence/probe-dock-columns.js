/**
 * Dock probes for E4b. Run inside the desk page (Playwright evaluate or DevTools console).
 *
 * probeDockColumns() -> alignment findings in the Livro tab: for every data row on each side of
 * the book, the x of each cell is compared with the x of the matching column header (2 px slack).
 * Call after selecting the "Livro" dock tab.
 *
 * probeNumericClips(root?) -> numeric clipping findings anywhere under root (default: the whole
 * document): a cell or value whose scrollWidth exceeds its clientWidth without a horizontally
 * scrollable ancestor, or rendered text containing the ellipsis character in a numeric-ish cell.
 * Screen-reader-only spans (.srOnly) are skipped by contract.
 */

function probeDockColumns() {
  const body = document.querySelector("#dock-body-livro");
  if (!body) return { error: "livro tab not active" };
  const findings = [];
  const sides = Array.from(body.querySelectorAll('[role="rowgroup"]'));
  for (const side of sides) {
    const allRows = Array.from(side.querySelectorAll('[role="row"]'));
    const headCells = Array.from(allRows[0].querySelectorAll('[role="columnheader"]'));
    const headX = headCells.map((c) => c.getBoundingClientRect().x);
    const rows = allRows.slice(1).filter((r) => r.querySelectorAll('[role="cell"]').length);
    for (const [i, row] of rows.entries()) {
      const cells = Array.from(row.querySelectorAll('[role="cell"]'));
      if (cells.length !== 3) {
        findings.push({ side: side.getAttribute("aria-label"), row: i, problem: `cells=${cells.length}` });
        continue;
      }
      cells.forEach((cell, k) => {
        const dx = Math.abs(cell.getBoundingClientRect().x - headX[k]);
        if (dx > 2) findings.push({ side: side.getAttribute("aria-label"), row: i, col: k, dx: Math.round(dx * 10) / 10 });
      });
    }
  }
  return { findings, rows: sides.map((s) => ({ side: s.getAttribute("aria-label"), rows: s.querySelectorAll('[role="row"]').length - 1 })) };
}

function probeNumericClips(root = document.body) {
  const findings = [];
  const numericish = /[\d]/;
  const scrollable = (el) => {
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (/(auto|scroll)/.test(o.overflowX) && a.scrollWidth > a.clientWidth + 1) return true;
      if (o.overflowX === "auto" || o.overflowX === "scroll") {
        // declared but maybe not needed; still counts as handled if it can scroll
        if (a.scrollWidth > a.clientWidth) return true;
      }
    }
    return false;
  };
  for (const el of Array.from(root.querySelectorAll('[role="cell"], td, th, span')).filter((e) => e.children.length === 0 && e.getClientRects().length)) {
    if (String(el.className).includes("srOnly")) continue;
    const text = el.textContent.trim();
    if (!text) continue;
    if (text.includes("…")) findings.push({ kind: "ellipsis", text: text.slice(0, 40) });
    else if (numericish.test(text) && el.scrollWidth > el.clientWidth + 1 && !scrollable(el)) {
      const o = getComputedStyle(el);
      findings.push({ kind: "clip", text: text.slice(0, 40), overflowX: o.overflowX, textOverflow: o.textOverflow });
    }
  }
  return findings;
}
