export interface XPathEntry {
  xpath: string;
  value: string;
  kind: "element" | "attribute";
}

function elementStep(el: Element): string {
  const parent = el.parentElement;
  if (!parent) return el.tagName;
  const sameName = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  return sameName.length > 1 ? `${el.tagName}[${sameName.indexOf(el) + 1}]` : el.tagName;
}

function elementPath(el: Element): string {
  const steps: string[] = [];
  let current: Element | null = el;
  while (current) {
    steps.unshift(elementStep(current));
    current = current.parentElement;
  }
  return "/" + steps.join("/");
}

export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("XML inválido ou vazio.");
  }
  return doc;
}

/** Lists every leaf element and attribute with its XPath and the value that XPath returns. */
export function listXPaths(xml: string): XPathEntry[] {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const entries: XPathEntry[] = [];

  const visit = (el: Element) => {
    const path = elementPath(el);
    for (const attr of Array.from(el.attributes)) {
      entries.push({ xpath: `${path}/@${attr.name}`, value: attr.value, kind: "attribute" });
    }
    if (el.children.length === 0) {
      entries.push({ xpath: path, value: evaluateXPath(doc, path), kind: "element" });
    } else {
      Array.from(el.children).forEach(visit);
    }
  };

  visit(root);
  return entries;
}

/** Evaluates the XPath like vMix does and returns the resulting text. */
export function evaluateXPath(doc: Document, xpath: string): string {
  try {
    return doc.evaluate(`string(${xpath})`, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim();
  } catch {
    return "";
  }
}
