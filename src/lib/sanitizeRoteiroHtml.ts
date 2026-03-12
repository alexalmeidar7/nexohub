/**
 * Sanitizes roteiro HTML for export/PDF/save:
 * - Removes the "Ações" column (header + cells)
 * - Removes action rows (add-pergunta)
 * - Removes data-action buttons from cells
 * - Optimizes table layout with proportional column widths for 3 columns
 * - Ensures proper word-wrap and clean formatting
 */
export function sanitizeRoteiroHtml(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  const table = container.querySelector("table");
  if (!table) return html;

  // Remove action rows
  table.querySelectorAll("tr[data-action-row]").forEach(r => r.remove());

  // Remove "Ações" header and corresponding cells
  const headerRow = table.querySelector("thead tr");
  let actionColIndex = -1;
  if (headerRow) {
    const ths = Array.from(headerRow.querySelectorAll("th"));
    actionColIndex = ths.findIndex(th => th.textContent?.trim() === "Ações");
    if (actionColIndex >= 0) ths[actionColIndex].remove();
  }

  // Remove action cells from body rows (last cell with data-action spans, or by index)
  const bodyRows = table.querySelectorAll("tbody tr");
  bodyRows.forEach(row => {
    const cells = Array.from(row.querySelectorAll("td"));
    // Remove cells containing action buttons
    const actionCell = cells.find(td =>
      td.querySelector("[data-action]") ||
      (td.getAttribute("contenteditable") === "false" && td.querySelectorAll("span").length >= 2)
    );
    if (actionCell) {
      actionCell.remove();
    } else if (actionColIndex >= 0) {
      // Fallback: remove by column index (accounting for colspan)
      let colIdx = 0;
      for (const cell of cells) {
        const span = parseInt(cell.getAttribute("colspan") || "1", 10);
        if (colIdx === actionColIndex) { cell.remove(); break; }
        colIdx += span;
      }
    }
  });

  // Update colgroup for 3 columns
  let colgroup = table.querySelector("colgroup");
  if (colgroup) colgroup.remove();
  colgroup = document.createElement("colgroup");
  colgroup.innerHTML = `<col style="width:70px"><col style="width:140px"><col>`;
  table.insertBefore(colgroup, table.firstChild);

  // Optimize table styling
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.tableLayout = "fixed";
  table.style.fontSize = "13px";
  table.style.color = "#0d0446";

  // Style all cells for consistent clean look
  const allCells = table.querySelectorAll("td, th");
  allCells.forEach(cell => {
    const el = cell as HTMLElement;
    el.style.border = "1px solid rgba(13,4,70,0.12)";
    el.style.padding = "10px 12px";
    el.style.wordWrap = "break-word";
    el.style.overflowWrap = "break-word";
    el.style.whiteSpace = "normal";
    el.style.verticalAlign = "top";
    el.style.lineHeight = "1.6";
  });

  // Style header cells
  const headerCells = table.querySelectorAll("thead th");
  headerCells.forEach(th => {
    const el = th as HTMLElement;
    el.style.textAlign = "left";
    el.style.fontSize = "11px";
    el.style.textTransform = "uppercase";
    el.style.letterSpacing = "0.5px";
    el.style.fontWeight = "700";
    el.style.background = "rgba(38,143,250,0.08)";
    el.style.color = "#0d0446";
  });

  // Style "ENTREVISTA" section header rows
  bodyRows.forEach(row => {
    const cells = row.querySelectorAll("td");
    cells.forEach(td => {
      if (td.getAttribute("colspan") && td.textContent?.trim() === "ENTREVISTA") {
        (td as HTMLElement).style.fontWeight = "700";
        (td as HTMLElement).style.color = "#268ffa";
        (td as HTMLElement).style.background = "rgba(38,143,250,0.04)";
      }
    });
    // Style "Elemento" column (2nd cell) as bold
    if (cells.length >= 2 && !cells[0].getAttribute("colspan")) {
      (cells[1] as HTMLElement).style.fontWeight = "600";
    }
  });

  return container.innerHTML;
}
