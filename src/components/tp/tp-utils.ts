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
  const blocks: string[] = [];

  const labelStyle = "display:block;font-size:0.45em;opacity:0.5;letter-spacing:3px;margin-bottom:0.35em;font-weight:400";
  const contentStyle = "display:block;line-height:1.5";
  const blockStyle = "display:block;margin-bottom:1.4em";

  if (rows.length > 0) {
    rows.forEach((row) => {
      if (row.querySelector("th")) return;
      if (row.getAttribute("data-action-row") === "true") return;
      if (row.querySelector("[contenteditable='false']") && !row.getAttribute("data-pergunta")) return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 2) return;

      // Try to detect: [tempo, elemento, descricao] or [elemento, descricao]
      let elemento = "";
      let descricaoCell: Element | null = null;
      let descricaoText = "";

      if (cells.length >= 3) {
        elemento = (cells[1]?.textContent || "").trim();
        descricaoCell = cells[2];
        descricaoText = (cells[2]?.textContent || "").trim();
      } else {
        elemento = (cells[0]?.textContent || "").trim();
        descricaoCell = cells[1];
        descricaoText = (cells[1]?.textContent || "").trim();
      }

      if (!elemento && !descricaoText) return;
      if (descricaoText === "[Insira a pergunta aqui]" || descricaoText === "[Insira o texto aqui]") return;

      const descricaoHtml = descricaoCell ? sanitizeInlineHtml(descricaoCell).trim() : "";

      const parts: string[] = [];
      if (elemento) parts.push(`<span style="${labelStyle}">${elemento.toUpperCase()}</span>`);
      if (descricaoHtml) parts.push(`<span style="${contentStyle}">${descricaoHtml}</span>`);

      if (parts.length > 0) {
        blocks.push(`<div style="${blockStyle}">${parts.join("")}</div>`);
      }
    });
  }

  if (blocks.length > 0) {
    blocks.push('<div style="display:block;margin-top:2em;text-align:center"><span style="opacity:0.35;font-size:0.5em;letter-spacing:4px">*** FIM DO TEXTO ***</span></div>');
    return blocks.join("");
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
  .tp-screen-grid { display: grid; grid-template-columns: 90px 1fr; height: 100vh; }
  .tp-controls-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-controls-bar .tp-divider { width: 1px; height: 24px; }
  .tp-speed-slider { width: 120px; }
  .tp-ctrl-preview { width: min(900px, 90vw); height: min(500px, 55vh); }
  .tp-ctrl-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-ctrl-bar .tp-divider { width: 1px; height: 24px; }
  .tp-msg-screen { width: min(500px, 90%); }

  @media (max-width: 768px) {
    .tp-menu-btn { width: 140px !important; height: 140px !important; }
    .tp-menu-buttons { gap: 12px !important; }
    .tp-screen-grid { grid-template-columns: 1fr !important; grid-template-rows: auto 1fr !important; }
    .tp-sidebar { flex-direction: row !important; padding: 8px 12px !important; border-right: none !important; border-bottom: 1px solid hsl(var(--tp-border)) !important; justify-content: space-between !important; overflow-x: auto; }
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

// Shared styles as CSS classes for tp-control buttons
export const tpControlBtnClasses = "bg-tp-foreground/[0.08] border border-tp-border-subtle rounded-lg p-1.5 cursor-pointer flex items-center justify-center text-tp-foreground transition-all";

export const tpControlBtnActiveClasses = "bg-tp-accent/20 border-tp-border";
