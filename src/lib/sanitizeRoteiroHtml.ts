/**
 * Sanitizes roteiro HTML for export/PDF/save:
 * - Removes the "Ações" column and action rows
 * - Merges extra cells into the Descrição column
 * - Normalizes all rows to exactly 3 columns (Tempo, Elemento, Descrição)
 * - Optimizes table layout for clean, readable formatting
 */
export function sanitizeRoteiroHtml(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  const table = container.querySelector("table");
  if (!table) return html;

  // Remove action rows
  table.querySelectorAll("tr[data-action-row]").forEach(r => r.remove());

  // Remove all cells containing action buttons first
  table.querySelectorAll("[data-action]").forEach(el => {
    const cell = el.closest("td, th");
    if (cell) cell.remove();
  });
  // Also remove contenteditable="false" cells (action cells)
  table.querySelectorAll('td[contenteditable="false"]').forEach(cell => cell.remove());

  // Normalize header to 3 columns
  const headerRow = table.querySelector("thead tr");
  if (headerRow) {
    const ths = Array.from(headerRow.querySelectorAll("th"));
    // Remove "Ações" header and any extra headers beyond 3
    const keep = ths.filter(th => th.textContent?.trim() !== "Ações").slice(0, 3);
    headerRow.innerHTML = "";
    keep.forEach(th => headerRow.appendChild(th));
    // Ensure we have exactly 3 headers
    while (headerRow.querySelectorAll("th").length < 3) {
      const th = document.createElement("th");
      th.textContent = "";
      headerRow.appendChild(th);
    }
  }

  // Normalize body rows to exactly 3 cells
  const bodyRows = table.querySelectorAll("tbody tr");
  bodyRows.forEach(row => {
    const cells = Array.from(row.querySelectorAll("td"));
    
    // Check if row has a colspan (section headers like ENTREVISTA)
    const hasColspan = cells.some(c => parseInt(c.getAttribute("colspan") || "1", 10) > 1);
    if (hasColspan) {
      // Normalize colspan to span all 3 columns
      const firstColspanCell = cells.find(c => parseInt(c.getAttribute("colspan") || "1", 10) > 1);
      if (firstColspanCell) {
        // Calculate total columns this row should span
        let totalCols = 0;
        cells.forEach(c => { totalCols += parseInt(c.getAttribute("colspan") || "1", 10); });
        // If there are cells without colspan before the colspan cell, keep them
        // Otherwise set colspan to 3
        const nonColspanBefore = cells.filter(c => c !== firstColspanCell && cells.indexOf(c) < cells.indexOf(firstColspanCell));
        const remainingCols = 3 - nonColspanBefore.length;
        firstColspanCell.setAttribute("colspan", String(remainingCols));
        // Remove any cells after the colspan cell
        const colspanIdx = cells.indexOf(firstColspanCell);
        cells.slice(colspanIdx + 1).forEach(c => c.remove());
      }
      return;
    }

    if (cells.length <= 3) return; // Already fine

    // Merge cells beyond the 3rd into the 3rd cell (Descrição)
    const descCell = cells[2];
    for (let i = 3; i < cells.length; i++) {
      const extraContent = cells[i].textContent?.trim();
      if (extraContent) {
        if (descCell.textContent?.trim()) {
          descCell.innerHTML += " — " + cells[i].innerHTML;
        } else {
          descCell.innerHTML = cells[i].innerHTML;
        }
      }
      cells[i].remove();
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

  // Style all cells
  table.querySelectorAll("td, th").forEach(cell => {
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
  table.querySelectorAll("thead th").forEach(th => {
    const el = th as HTMLElement;
    el.style.textAlign = "left";
    el.style.fontSize = "11px";
    el.style.textTransform = "uppercase";
    el.style.letterSpacing = "0.5px";
    el.style.fontWeight = "700";
    el.style.background = "rgba(38,143,250,0.08)";
    el.style.color = "#0d0446";
  });

  // Style section headers and element column
  table.querySelectorAll("tbody tr").forEach(row => {
    const cells = row.querySelectorAll("td");
    cells.forEach(td => {
      if (td.getAttribute("colspan") && td.textContent?.trim() === "ENTREVISTA") {
        (td as HTMLElement).style.fontWeight = "700";
        (td as HTMLElement).style.color = "#268ffa";
        (td as HTMLElement).style.background = "rgba(38,143,250,0.04)";
      }
    });
    if (cells.length >= 2 && !cells[0].getAttribute("colspan")) {
      (cells[1] as HTMLElement).style.fontWeight = "600";
    }
  });

  return container.innerHTML;
}
