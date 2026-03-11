import React from "react";

export interface Roteiro {
  id: string;
  programa_nome: string;
  titulo: string;
  data_programa: string;
  horario: string;
  conteudo_html: string;
  numero_roteiro: number | null;
}

export function sanitizeInlineHtml(el: Element): string {
  let result = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      const inner = sanitizeInlineHtml(node as Element);
      if (tag === "b" || tag === "strong") {
        result += `<b>${inner}</b>`;
      } else if (tag === "i" || tag === "em") {
        result += `<i>${inner}</i>`;
      } else if (tag === "u") {
        result += `<u>${inner}</u>`;
      } else if (tag === "mark") {
        result += `<mark style="background:#b4ff20;color:#000;text-shadow:none;border-radius:3px;padding:0 2px">${inner}</mark>`;
      } else if (tag === "span") {
        const style = (node as HTMLElement).getAttribute("style") || "";
        if (style.includes("background")) {
          result += `<mark style="background:#b4ff20;color:#000;text-shadow:none;border-radius:3px;padding:0 2px">${inner}</mark>`;
        } else if (style.includes("font-weight")) {
          result += `<b>${inner}</b>`;
        } else if (style.includes("font-style")) {
          result += `<i>${inner}</i>`;
        } else {
          result += inner;
        }
      } else {
        result += inner;
      }
    }
  });
  return result;
}

export function extractRoteiroHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const rows = div.querySelectorAll("tr[data-pergunta], table tr");
  const lines: string[] = [];

  if (rows.length > 0) {
    rows.forEach((row) => {
      if (row.querySelector("th")) return;
      if (row.getAttribute("data-action-row") === "true") return;
      if (row.querySelector("[contenteditable='false']") && !row.getAttribute("data-pergunta")) return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 3) return;

      const elemento = (cells[1]?.textContent || "").trim();
      const descricaoHtml = sanitizeInlineHtml(cells[2]).trim();
      const descricaoText = (cells[2]?.textContent || "").trim();

      if (!elemento && !descricaoText) return;
      if (descricaoText === "[Insira a pergunta aqui]" || descricaoText === "[Insira o texto aqui]") return;

      if (elemento) lines.push(`<span style="font-size:0.6em;opacity:0.55;letter-spacing:2px">${elemento.toUpperCase()}</span>`);
      if (descricaoHtml) lines.push(descricaoHtml);
      lines.push("");
    });
  }

  if (lines.filter((l) => l.trim()).length > 0) {
    lines.push('<br/><br/><span style="opacity:0.4;font-size:0.5em;letter-spacing:3px">*** FIM DO TEXTO ***</span>');
    return lines.join("<br/>").trim();
  }

  return sanitizeInlineHtml(div) || div.textContent || "";
}

export function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export const TP_RESPONSIVE_STYLES = `
  .tp-menu-buttons { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .tp-menu-btn { width: 180px; height: 180px; }
  .tp-screen-grid { display: grid; grid-template-columns: 90px 1fr; height: 100vh; }
  .tp-controls-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-controls-bar .tp-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.1); }
  .tp-speed-slider { width: 120px; }
  .tp-ctrl-preview { width: min(900px, 90vw); height: min(500px, 55vh); }
  .tp-ctrl-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-ctrl-bar .tp-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.1); }
  .tp-msg-screen { width: min(500px, 90%); }

  @media (max-width: 768px) {
    .tp-menu-btn { width: 140px !important; height: 140px !important; }
    .tp-menu-buttons { gap: 12px !important; }
    .tp-screen-grid { grid-template-columns: 1fr !important; grid-template-rows: auto 1fr !important; }
    .tp-sidebar { flex-direction: row !important; padding: 8px 12px !important; border-right: none !important; border-bottom: 1px solid rgba(74,144,226,0.15) !important; justify-content: space-between !important; overflow-x: auto; }
    .tp-sidebar-top { flex-direction: row !important; gap: 12px !important; align-items: center !important; }
    .tp-sidebar-mid { flex-direction: row !important; gap: 8px !important; }
    .tp-sidebar-mid button { width: 36px !important; height: 36px !important; }
    .tp-sidebar-bottom { flex-direction: row !important; gap: 8px !important; align-items: center !important; }
    .tp-sidebar-bottom > div:first-child { display: none; }
    .tp-controls-bar { gap: 8px !important; padding: 8px 12px !important; border-radius: 14px !important; bottom: 8px !important; }
    .tp-controls-bar .tp-divider { display: none; }
    .tp-speed-slider { width: 80px !important; }
    .tp-ctrl-preview { width: 95vw !important; height: 35vh !important; }
    .tp-ctrl-bar { gap: 8px !important; padding: 8px 14px !important; }
    .tp-ctrl-bar .tp-divider { display: none; }
    .tp-setup-modal { width: 95% !important; padding: 16px !important; }
  }

  @media (max-width: 480px) {
    .tp-menu-btn { width: 110px !important; height: 110px !important; }
    .tp-menu-btn svg { width: 28px !important; height: 28px !important; }
    .tp-menu-btn span { font-size: 11px !important; }
    .tp-controls-bar { gap: 6px !important; padding: 6px 8px !important; }
    .tp-play-btn { width: 38px !important; height: 38px !important; }
    .tp-ctrl-preview { height: 30vh !important; }
  }
`;

export const controlBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px", padding: "6px 8px", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
  transition: "all 0.2s",
};

export const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(74,144,226,0.2)" : "transparent",
  border: active ? "1px solid rgba(74,144,226,0.4)" : "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px", padding: "8px 16px", cursor: "pointer",
  color: active ? "#4a90e2" : "rgba(255,255,255,0.5)",
  fontSize: "12px", fontWeight: 600, transition: "all 0.2s",
});

