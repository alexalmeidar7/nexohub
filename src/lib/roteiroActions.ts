/**
 * Injects action buttons (move up, move down, delete) into pergunta rows
 * that don't already have them. Also ensures the header has an "Ações" column
 * and an action-row for adding new perguntas.
 */
export function injectPerguntaActions(container: HTMLElement) {
  const tdS = "border:1px solid rgba(13,4,70,0.12);padding:8px 10px";
  const actionBtnS = "cursor:pointer;padding:2px 4px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center";
  const actionsHtml = `<td style="${tdS};white-space:nowrap;text-align:center;width:90px" contenteditable="false"><span data-action="move-up" style="${actionBtnS};color:#268ffa" title="Mover para cima">▲</span> <span data-action="move-down" style="${actionBtnS};color:#268ffa" title="Mover para baixo">▼</span> <span data-action="delete-pergunta" style="${actionBtnS};color:#dc2626" title="Remover pergunta">🗑</span></td>`;

  // Add "Ações" header if missing
  const thead = container.querySelector("thead tr");
  if (thead && !thead.innerHTML.includes("Ações")) {
    const th = document.createElement("th");
    th.setAttribute("style", `${tdS};text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:90px`);
    th.textContent = "Ações";
    thead.appendChild(th);
  }

  // Inject action buttons into pergunta rows that don't have them
  const perguntaRows = container.querySelectorAll("tr[data-pergunta]");
  perguntaRows.forEach((row) => {
    if (!row.querySelector("[data-action]")) {
      row.insertAdjacentHTML("beforeend", actionsHtml);
    }
  });

  // Ensure action-row exists
  const table = container.querySelector("table tbody") || container.querySelector("table");
  if (table && perguntaRows.length > 0 && !container.querySelector("tr[data-action-row]")) {
    const lastPergunta = perguntaRows[perguntaRows.length - 1];
    const actionRow = document.createElement("tr");
    actionRow.setAttribute("data-action-row", "true");
    actionRow.setAttribute("contenteditable", "false");
    actionRow.innerHTML = `<td style="${tdS}" colspan="4"><span data-action="add-pergunta" style="color:#268ffa;font-weight:600;font-size:12px;cursor:pointer">＋ adicionar pergunta</span></td>`;
    lastPergunta.insertAdjacentElement("afterend", actionRow);
  }

  // Add empty 4th cell to non-pergunta rows missing it (with word-break for long text)
  const allRows = container.querySelectorAll("tbody tr:not([data-pergunta]):not([data-action-row])");
  allRows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    const hasColspan = Array.from(cells).some(c => (c as HTMLElement).getAttribute("colspan"));
    if (!hasColspan && cells.length === 3) {
      const td = document.createElement("td");
      td.setAttribute("style", `${tdS};white-space:normal;word-break:break-word`);
      row.appendChild(td);
    }
    // Ensure existing 4th cells also have word-break
    if (!hasColspan && cells.length >= 4) {
      const lastCell = cells[cells.length - 1] as HTMLElement;
      if (!lastCell.hasAttribute("data-action")) {
        lastCell.style.whiteSpace = "normal";
        lastCell.style.wordBreak = "break-word";
      }
    }
  });
}
