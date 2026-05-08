export function normalizeSpecialData(data) {
  const text = getSpecialText(data).trim();
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return data;
  }
}

export function getSpecialText(data) {
  if (typeof data === 'string') return data;
  if (data?.content !== undefined) return String(data.content || '');
  return stringifySpecialData(data);
}

export function stringifySpecialData(data) {
  if (typeof data === 'string') return data;
  if (data?.content !== undefined) return String(data.content || '');
  return JSON.stringify(data, null, 2);
}

export function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function convertMindmap(data) {
  const tree = normalizeMindmapTree(data);
  if (!tree) {
    return {
      markdown: 'No mind map nodes were found.\n',
      svg: renderEmptySvg('No mind map nodes were found.'),
    };
  }

  return {
    markdown: renderMindmapMarkdown(tree),
    svg: renderMindmapSvg(tree),
  };
}

function normalizeMindmapTree(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  if (!nodes.length) return null;

  const byId = new Map();
  for (const raw of nodes) {
    const id = String(raw.id || '');
    if (!id) continue;
    byId.set(id, {
      id,
      parentId: raw.parentid || raw.parentId || raw.pid || '',
      topic: String(raw.topic || raw.text || raw.title || '').trim() || '(untitled)',
      children: [],
      raw,
    });
  }

  let root = null;
  for (const node of byId.values()) {
    if (node.raw?.isroot || !node.parentId || !byId.has(String(node.parentId))) {
      root = root || node;
      continue;
    }
    byId.get(String(node.parentId)).children.push(node);
  }
  return root || byId.values().next().value;
}

function renderMindmapMarkdown(root) {
  const lines = [];
  function walk(node, depth) {
    lines.push(`${'  '.repeat(depth)}- ${node.topic}`);
    node.children.forEach(child => walk(child, depth + 1));
  }
  walk(root, 0);
  return lines.join('\n') + '\n';
}

function renderMindmapSvg(root) {
  const nodeH = 34;
  const nodeGapY = 18;
  const levelGapX = 210;
  const padding = 48;

  function countLeaves(node) {
    return node.children.length ? node.children.reduce((sum, child) => sum + countLeaves(child), 0) : 1;
  }

  const positioned = [];
  function layout(node, depth, centerY) {
    const textWidth = estimateTextWidth(node.topic, depth === 0 ? 15 : 13);
    const w = Math.max(textWidth + 28, depth === 0 ? 120 : 88);
    const x = padding + depth * levelGapX;
    const y = centerY - nodeH / 2;
    const item = { node, x, y, w, h: nodeH, centerY, depth };
    positioned.push(item);

    if (node.children.length) {
      const leaves = node.children.map(countLeaves);
      const totalH = leaves.reduce((sum, n) => sum + n, 0) * (nodeH + nodeGapY) - nodeGapY;
      let childCenter = centerY - totalH / 2 + (leaves[0] * (nodeH + nodeGapY) - nodeGapY) / 2;
      node.children.forEach((child, index) => {
        layout(child, depth + 1, childCenter);
        if (index < node.children.length - 1) {
          childCenter += (leaves[index] + leaves[index + 1]) * (nodeH + nodeGapY) / 2;
        }
      });
    }
    return item;
  }

  const totalLeaves = countLeaves(root);
  const totalH = totalLeaves * (nodeH + nodeGapY) - nodeGapY;
  layout(root, padding + totalH / 2);

  const maxX = Math.max(...positioned.map(item => item.x + item.w)) + padding;
  const maxY = Math.max(...positioned.map(item => item.y + item.h)) + padding;
  const byId = new Map(positioned.map(item => [item.node.id, item]));
  const edges = [];

  for (const item of positioned) {
    for (const child of item.node.children) {
      const target = byId.get(child.id);
      if (!target) continue;
      const x1 = item.x + item.w;
      const y1 = item.y + item.h / 2;
      const x2 = target.x;
      const y2 = target.y + target.h / 2;
      const midX = x1 + (x2 - x1) / 2;
      edges.push(`<path d="M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}" fill="none" stroke="#9ca3af" stroke-width="2"/>`);
    }
  }

  const nodes = positioned.map(item => {
    const fill = item.depth === 0 ? '#e0f2fe' : '#ffffff';
    const stroke = item.depth === 0 ? '#0284c7' : '#cbd5e1';
    const weight = item.depth === 0 ? '600' : '400';
    const size = item.depth === 0 ? 15 : 13;
    return [
      `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      `<text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 5}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="#111827" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escapeXml(item.node.topic)}</text>`,
    ].join('');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(maxX)} ${Math.ceil(maxY)}" width="${Math.ceil(maxX)}" height="${Math.ceil(maxY)}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    ...edges,
    ...nodes,
    '</svg>',
  ].join('\n');
}

export function convertLxTable(data) {
  const sheets = normalizeLxSheets(data);
  return {
    markdown: renderSheetsMarkdown(sheets),
    csv: renderSheetsCsv(sheets),
    html: renderSheetsHtml(sheets),
  };
}

function normalizeLxSheets(data) {
  const rawSheets = data?.data?.sheets || data?.sheets;
  if (!rawSheets || typeof rawSheets !== 'object') return [];

  return Object.entries(rawSheets).map(([id, sheet], index) => {
    const cells = collectTableCells(sheet);
    const maxRow = cells.length ? Math.max(...cells.map(cell => cell.row)) : -1;
    const maxCol = cells.length ? Math.max(...cells.map(cell => cell.col)) : -1;
    const rows = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(''));
    for (const cell of cells) rows[cell.row][cell.col] = cell.value;
    return {
      id,
      name: sheet.title || sheet.name || `Sheet${index + 1}`,
      rows,
    };
  });
}

function collectTableCells(sheet) {
  const cells = [];
  const seen = new Set();

  function add(row, col, value) {
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const text = cellToText(value);
    if (!text) return;
    const key = `${row},${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ row, col, value: text });
  }

  function scanMap(map) {
    if (!map || typeof map !== 'object') return;
    for (const [rowKey, rowValue] of Object.entries(map)) {
      const pair = rowKey.match(/^(\d+)[,:](\d+)$/);
      if (pair) {
        add(Number(pair[1]), Number(pair[2]), rowValue);
        continue;
      }

      if (/^\d+$/.test(rowKey) && rowValue && typeof rowValue === 'object') {
        for (const [colKey, value] of Object.entries(rowValue)) {
          if (/^\d+$/.test(colKey)) add(Number(rowKey), Number(colKey), value);
        }
      }
    }
  }

  scanMap(sheet.cells);
  scanMap(sheet.data);
  scanMap(sheet.cellData);

  if (Array.isArray(sheet.rows)) {
    sheet.rows.forEach((row, rowIndex) => {
      const rowCells = Array.isArray(row) ? row : row?.cells || row?.data;
      if (Array.isArray(rowCells)) {
        rowCells.forEach((cell, colIndex) => add(rowIndex, colIndex, cell));
      } else if (rowCells && typeof rowCells === 'object') {
        for (const [colKey, cell] of Object.entries(rowCells)) {
          if (/^\d+$/.test(colKey)) add(rowIndex, Number(colKey), cell);
        }
      }
    });
  }

  return cells.sort((a, b) => a.row - b.row || a.col - b.col);
}

function cellToText(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  if (Array.isArray(cell)) return cell.map(cellToText).filter(Boolean).join(' ');
  if (typeof cell === 'object') {
    const candidates = [
      cell.value, cell.v, cell.text, cell.t, cell.label, cell.title,
      cell[0], cell['0'],
      cell?.data?.value, cell?.data?.text,
      cell?.content?.text, cell?.content?.value,
    ];
    for (const candidate of candidates) {
      const text = cellToText(candidate);
      if (text) return text;
    }
    if (Array.isArray(cell.richText)) return cell.richText.map(cellToText).filter(Boolean).join('');
    if (Array.isArray(cell.segments)) return cell.segments.map(cellToText).filter(Boolean).join('');
  }
  return '';
}

function renderSheetsMarkdown(sheets) {
  if (!sheets.length) return 'No table sheets were found.\n';
  return sheets.map(sheet => {
    if (!sheet.rows.length) return `## ${sheet.name}\n\n_Empty sheet_`;
    return `## ${sheet.name}\n\n${formatMarkdownTable(sheet.rows)}`;
  }).join('\n\n') + '\n';
}

function renderSheetsCsv(sheets) {
  if (!sheets.length) return '';
  return sheets.map(sheet => {
    const body = sheet.rows.map(row => row.map(escapeCsvCell).join(',')).join('\n');
    return sheets.length === 1 ? body : `--- ${sheet.name} ---\n${body}`;
  }).join('\n\n');
}

function renderSheetsHtml(sheets) {
  if (!sheets.length) return '<p>No table sheets were found.</p>';
  return sheets.map(sheet => {
    const rows = sheet.rows.length ? sheet.rows : [['Empty sheet']];
    const table = rows.map(row => (
      '<tr>' + row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('') + '</tr>'
    )).join('\n');
    return `<h2>${escapeHtml(sheet.name)}</h2>\n<table border="1" cellpadding="4" cellspacing="0">\n${table}\n</table>`;
  }).join('\n\n');
}

export function convertExcalidraw(data) {
  if (!data) {
    return {
      markdown: 'Excalidraw content was empty in the Youdao download response.\n',
      svg: renderEmptySvg('Empty Excalidraw response'),
    };
  }

  const elements = Array.isArray(data?.elements) ? data.elements.filter(el => !el.isDeleted) : [];
  if (!elements.length) {
    return {
      markdown: 'Excalidraw source was exported in its original format.\n',
      svg: renderEmptySvg('No Excalidraw elements were found.'),
    };
  }

  return {
    markdown: renderExcalidrawMarkdown(elements),
    svg: renderExcalidrawSvg(elements),
  };
}

function renderExcalidrawMarkdown(elements) {
  const counts = elements.reduce((acc, element) => {
    const type = element.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const lines = ['# Excalidraw', '', `Elements: ${elements.length}`, ''];
  for (const [type, count] of Object.entries(counts)) lines.push(`- ${type}: ${count}`);
  lines.push('');
  return lines.join('\n');
}

function renderExcalidrawSvg(elements) {
  const bbox = computeElementBBox(elements);
  const padding = 40;
  const viewX = bbox.x - padding;
  const viewY = bbox.y - padding;
  const width = Math.max(200, bbox.width + padding * 2);
  const height = Math.max(120, bbox.height + padding * 2);
  const body = elements.map(renderExcalidrawElement).join('\n');
  const defs = elements.some(el => el.type === 'arrow') ? renderArrowDefs() : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${width} ${height}" width="${width}" height="${height}">`,
    `<rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="#ffffff"/>`,
    defs,
    body,
    '</svg>',
  ].join('\n');
}

function renderArrowDefs() {
  return [
    '<defs>',
    '  <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">',
    '    <path d="M0,0 L10,5 L0,10 z" fill="#1e1e1e"/>',
    '  </marker>',
    '</defs>',
  ].join('\n');
}

function renderExcalidrawElement(el) {
  const x = Number(el.x || 0);
  const y = Number(el.y || 0);
  const w = Number(el.width || 0);
  const h = Number(el.height || 0);
  const stroke = el.strokeColor || '#1e1e1e';
  const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none';
  const sw = Number(el.strokeWidth || 1);
  const transform = el.angle ? ` transform="rotate(${toDegrees(el.angle)} ${x + w / 2} ${y + h / 2})"` : '';

  switch (el.type) {
    case 'rectangle':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${transform}/>`;
    case 'diamond':
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${transform}/>`;
    case 'ellipse':
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${transform}/>`;
    case 'line':
    case 'arrow':
      return renderExcalidrawLine(el, stroke, sw, el.type === 'arrow');
    case 'freedraw':
    case 'draw':
      return renderExcalidrawFreeDraw(el, stroke, sw);
    case 'text':
      return renderExcalidrawText(el);
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="4 4"${transform}/>`;
  }
}

function renderExcalidrawLine(el, stroke, sw, arrow) {
  const points = Array.isArray(el.points) && el.points.length ? el.points : [[0, 0], [el.width || 0, el.height || 0]];
  const x = Number(el.x || 0);
  const y = Number(el.y || 0);
  const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x + Number(point[0] || 0)},${y + Number(point[1] || 0)}`).join(' ');
  const marker = arrow ? ' marker-end="url(#arrow)"' : '';
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${marker}/>`;
}

function renderExcalidrawFreeDraw(el, stroke, sw) {
  const points = Array.isArray(el.points) ? el.points : [];
  if (!points.length) return '';
  const x = Number(el.x || 0);
  const y = Number(el.y || 0);
  const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x + Number(point[0] || 0)},${y + Number(point[1] || 0)}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function renderExcalidrawText(el) {
  const x = Number(el.x || 0);
  const y = Number(el.y || 0);
  const size = Number(el.fontSize || 16);
  const color = el.strokeColor || '#1e1e1e';
  const lines = String(el.text || '').split('\n');
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + size * (index + 1)}" font-size="${size}" fill="${color}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escapeXml(line)}</text>`
  )).join('\n');
}

function computeElementBBox(elements) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const x = Number(el.x || 0);
    const y = Number(el.y || 0);
    const w = Math.abs(Number(el.width || 0));
    const h = Math.abs(Number(el.height || 0));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 200, height: 120 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function renderEmptySvg(message) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" width="480" height="160">',
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<rect x="16" y="16" width="448" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>',
    `<text x="240" y="86" text-anchor="middle" font-size="14" fill="#475569" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escapeXml(message)}</text>`,
    '</svg>',
  ].join('\n');
}

function estimateTextWidth(text, fontSize) {
  const wide = String(text).replace(/[^\x00-\xff]/g, 'xx').length;
  return wide * fontSize * 0.55;
}

function formatMarkdownTable(rows) {
  const width = Math.max(...rows.map(row => row.length));
  const normalized = rows.map(row => Array.from({ length: width }, (_, i) => row[i] || ''));
  const lines = [];
  lines.push('| ' + normalized[0].map(escapeMarkdownCell).join(' | ') + ' |');
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < normalized.length; i++) {
    lines.push('| ' + normalized[i].map(escapeMarkdownCell).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function toDegrees(rad) {
  return Number(rad) * 180 / Math.PI;
}
