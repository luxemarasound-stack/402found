import { Format, ConvertResult } from "./types.js";

const FORMATS: Format[] = ["json", "csv", "xml", "yaml", "markdown", "html", "toml"];

export function getSupportedFormats(): Format[] {
  return FORMATS;
}

// ── Flatten / unflatten for nested structures ──

function flatten(obj: any, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(result, flatten(val, path));
    } else {
      result[path] = String(val ?? "");
    }
  }
  return result;
}

function unflatten(flat: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [path, val] of Object.entries(flat)) {
    const keys = path.split(".");
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = val;
  }
  return result;
}

// ── Parsers: string → JS value ──

function parseJson(data: string): any {
  return JSON.parse(data);
}

function parseCsv(data: string): any[] {
  const lines = data.trim().split("\n");
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseXml(data: string): any {
  // Minimal XML parser for data interchange — handles elements, attributes, text
  data = data.trim();
  let pos = 0;

  function skipWs() { while (pos < data.length && /\s/.test(data[pos])) pos++; }

  function parseNode(): any {
    skipWs();
    if (data[pos] !== "<") return data.slice(pos).trim();

    // Skip declarations and comments
    if (data.startsWith("<?", pos)) { pos = data.indexOf("?>", pos) + 2; skipWs(); }
    if (data.startsWith("<!--", pos)) { pos = data.indexOf("-->", pos) + 3; skipWs(); }

    if (data[pos] !== "<") return data.slice(pos).trim();

    pos++; // skip <
    let tag = "";
    while (pos < data.length && !/[\s/>]/.test(data[pos])) tag += data[pos++];
    skipWs();

    // Skip attributes
    while (pos < data.length && data[pos] !== ">" && data[pos] !== "/") pos++;

    if (data[pos] === "/") { pos += 2; return { [tag]: "" }; } // self-closing
    pos++; // skip >

    // Collect children
    const children: any[] = [];
    while (pos < data.length) {
      skipWs();
      if (data.startsWith(`</${tag}`, pos)) {
        pos = data.indexOf(">", pos) + 1;
        break;
      }
      if (data[pos] === "<" && data[pos + 1] !== "/") {
        children.push(parseNode());
      } else if (data.startsWith("</", pos)) {
        break;
      } else {
        let text = "";
        while (pos < data.length && data[pos] !== "<") text += data[pos++];
        if (text.trim()) children.push(text.trim());
      }
    }

    if (children.length === 0) return { [tag]: "" };
    if (children.length === 1 && typeof children[0] === "string") return { [tag]: children[0] };

    // Group same-tag children into arrays
    const grouped: Record<string, any> = {};
    for (const child of children) {
      if (typeof child === "object") {
        for (const [k, v] of Object.entries(child)) {
          if (k in grouped) {
            if (!Array.isArray(grouped[k])) grouped[k] = [grouped[k]];
            grouped[k].push(v);
          } else {
            grouped[k] = v;
          }
        }
      }
    }
    return { [tag]: grouped };
  }

  return parseNode();
}

function parseYaml(data: string): any {
  // Handles flat and nested key: value, lists with "- ", quoted strings, multiline
  const lines = data.split("\n");
  return parseYamlBlock(lines, 0, 0).value;
}

function parseYamlBlock(lines: string[], start: number, baseIndent: number): { value: any; end: number } {
  const result: Record<string, any> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }

    const indent = line.search(/\S/);
    if (indent < baseIndent) break;

    // List item
    if (line.trim().startsWith("- ")) {
      const arr: any[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ") && lines[i].search(/\S/) === indent) {
        arr.push(parseYamlValue(lines[i].trim().slice(2)));
        i++;
      }
      return { value: arr, end: i };
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(indent, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (rest === "" || rest === "|" || rest === ">") {
      // Nested block
      const nextIndent = i + 1 < lines.length ? lines[i + 1].search(/\S/) : indent;
      if (nextIndent > indent) {
        if (lines[i + 1]?.trim().startsWith("- ")) {
          const sub = parseYamlBlock(lines, i + 1, nextIndent);
          result[key] = sub.value;
          i = sub.end;
        } else {
          const sub = parseYamlBlock(lines, i + 1, nextIndent);
          result[key] = sub.value;
          i = sub.end;
        }
      } else {
        result[key] = "";
        i++;
      }
    } else {
      result[key] = parseYamlValue(rest);
      i++;
    }
  }

  return { value: result, end: i };
}

function parseYamlValue(s: string): any {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s.startsWith("[") && s.endsWith("]"))
    return s.slice(1, -1).split(",").map((v) => parseYamlValue(v.trim()));
  return s;
}

function parseToml(data: string): any {
  const result: Record<string, any> = {};
  let currentSection = result;
  for (const line of data.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const keys = sectionMatch[1].split(".");
      let target = result;
      for (const k of keys) {
        if (!(k in target)) target[k] = {};
        target = target[k];
      }
      currentSection = target;
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    currentSection[key] = parseTomlValue(val);
  }
  return result;
}

function parseTomlValue(s: string): any {
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s.startsWith("[") && s.endsWith("]"))
    return s.slice(1, -1).split(",").map((v) => parseTomlValue(v.trim()));
  return s;
}

function parseMarkdown(data: string): any[] {
  // Parse markdown table
  const lines = data.trim().split("\n").filter((l) => l.includes("|"));
  if (lines.length < 2) return [{ text: data }];
  const headers = lines[0].split("|").map((h) => h.trim()).filter(Boolean);
  // Skip separator line (line[1])
  return lines.slice(2).map((line) => {
    const vals = line.split("|").map((v) => v.trim()).filter(Boolean);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row;
  });
}

function parseHtml(data: string): any[] {
  // Parse HTML table
  const rows: any[] = [];
  const headerMatch = data.match(/<thead>[\s\S]*?<\/thead>/);
  const headers: string[] = [];
  if (headerMatch) {
    const ths = headerMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) ?? [];
    for (const th of ths) headers.push(th.replace(/<[^>]+>/g, "").trim());
  }

  const bodyMatch = data.match(/<tbody>[\s\S]*?<\/tbody>/) ?? [data];
  const trs = bodyMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const tr of trs) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
    const vals = tds.map((td) => td.replace(/<[^>]+>/g, "").trim());
    if (headers.length > 0) {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
      rows.push(row);
    } else {
      rows.push(vals);
    }
  }
  return rows.length > 0 ? rows : [{ content: data.replace(/<[^>]+>/g, " ").trim() }];
}

// ── Serializers: JS value → string ──

function toJson(data: any): string {
  return JSON.stringify(data, null, 2);
}

function toCsv(data: any): string {
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return "";
  const flat = arr.map((item) => (typeof item === "object" && item !== null ? flatten(item) : { value: String(item) }));
  const headers = [...new Set(flat.flatMap(Object.keys))];
  const csvEscape = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(",")];
  for (const row of flat) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function toXml(data: any, rootTag = "root"): string {
  function serialize(val: any, tag: string, indent: string): string {
    if (val === null || val === undefined) return `${indent}<${tag}/>`;
    if (Array.isArray(val)) return val.map((item) => serialize(item, tag, indent)).join("\n");
    if (typeof val === "object") {
      const inner = Object.entries(val)
        .map(([k, v]) => serialize(v, k, indent + "  "))
        .join("\n");
      return `${indent}<${tag}>\n${inner}\n${indent}</${tag}>`;
    }
    const escaped = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${indent}<${tag}>${escaped}</${tag}>`;
  }

  if (Array.isArray(data)) {
    const items = data.map((item) => serialize(item, "item", "  ")).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${items}\n</${rootTag}>`;
  }
  const body = typeof data === "object" && data !== null
    ? Object.entries(data).map(([k, v]) => serialize(v, k, "  ")).join("\n")
    : `  <value>${data}</value>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${body}\n</${rootTag}>`;
}

function toYaml(data: any, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (data === null || data === undefined) return `${pad}null`;
  if (typeof data === "boolean") return `${pad}${data}`;
  if (typeof data === "number") return `${pad}${data}`;
  if (typeof data === "string") {
    if (data.includes("\n") || data.includes(":") || data.includes("#"))
      return `${pad}"${data.replace(/"/g, '\\"')}"`;
    return `${pad}${data}`;
  }
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === "object" && item !== null) {
        const inner = toYaml(item, indent + 1).trimStart();
        return `${pad}- ${inner}`;
      }
      return `${pad}- ${item}`;
    }).join("\n");
  }
  if (typeof data === "object") {
    return Object.entries(data).map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${toYaml(v, 0).trim()}`;
    }).join("\n");
  }
  return `${pad}${String(data)}`;
}

function toMarkdown(data: any): string {
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return "";
  const flat = arr.map((item) => (typeof item === "object" && item !== null ? flatten(item) : { value: String(item) }));
  const headers = [...new Set(flat.flatMap(Object.keys))];
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...flat.map((row) => `| ${headers.map((h) => row[h] ?? "").join(" | ")} |`),
  ];
  return lines.join("\n");
}

function toHtml(data: any): string {
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return "<table></table>";
  const flat = arr.map((item) => (typeof item === "object" && item !== null ? flatten(item) : { value: String(item) }));
  const headers = [...new Set(flat.flatMap(Object.keys))];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const thead = `  <thead>\n    <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>\n  </thead>`;
  const tbody = flat
    .map((row) => `    <tr>${headers.map((h) => `<td>${esc(row[h] ?? "")}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table>\n${thead}\n  <tbody>\n${tbody}\n  </tbody>\n</table>`;
}

function toToml(data: any, section = ""): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return `value = ${toTomlValue(data)}`;
  }

  const lines: string[] = [];
  const nested: [string, any][] = [];

  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      nested.push([key, val]);
    } else {
      lines.push(`${key} = ${toTomlValue(val)}`);
    }
  }

  for (const [key, val] of nested) {
    const sectionPath = section ? `${section}.${key}` : key;
    lines.push("");
    lines.push(`[${sectionPath}]`);
    lines.push(toToml(val, sectionPath).replace(/^\[.*\]\n?/, ""));
  }

  return lines.join("\n");
}

function toTomlValue(val: any): string {
  if (val === null || val === undefined) return '""';
  if (typeof val === "boolean") return String(val);
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (Array.isArray(val)) return `[${val.map(toTomlValue).join(", ")}]`;
  return `"${String(val)}"`;
}

// ── Main conversion ──

const parsers: Record<Format, (data: string) => any> = {
  json: parseJson,
  csv: parseCsv,
  xml: parseXml,
  yaml: parseYaml,
  markdown: parseMarkdown,
  html: parseHtml,
  toml: parseToml,
};

const serializers: Record<Format, (data: any) => string> = {
  json: toJson,
  csv: toCsv,
  xml: toXml,
  yaml: toYaml,
  markdown: toMarkdown,
  html: toHtml,
  toml: toToml,
};

export function convert(data: string, from: Format, to: Format): ConvertResult {
  if (!FORMATS.includes(from)) throw new Error(`Unsupported source format: ${from}`);
  if (!FORMATS.includes(to)) throw new Error(`Unsupported target format: ${to}`);

  const parsed = parsers[from](data);
  const converted = serializers[to](parsed);

  return { converted, from, to };
}
