export function convertToMarkdown(content, editorType) {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<note') || trimmed.startsWith('<')) {
      return convertXmlToMarkdown(trimmed);
    }
    // Already markdown or plain text
    return { markdown: trimmed, imageUrls: extractImageUrls(trimmed) };
  }

  if (Array.isArray(content)) {
    return convertJsonToMarkdown(content);
  }

  if (content && typeof content === 'object') {
    // New numeric-key format (keys "5", "6", "7")
    if (content['5'] !== undefined) {
      return convertNumericJsonToMarkdown(content);
    }
    if (content.body) {
      return convertToMarkdown(content.body, editorType);
    }
  }

  return { markdown: String(content || ''), imageUrls: [] };
}

function convertXmlToMarkdown(xml) {
  const imageUrls = [];
  const body = getXmlTagContent(xml, 'body') || getXmlTagContent(xml, 'note') || xml;
  const blocks = splitXmlTopLevel(body);
  const lines = (blocks.length ? blocks : [body])
    .map(block => convertXmlFragment(block, imageUrls))
    .filter(Boolean);

  return { markdown: lines.join('\n\n'), imageUrls };
}

function convertXmlFragment(fragment, imageUrls) {
  const parsed = parseXmlElement(fragment);
  if (!parsed) return decodeXml(stripXmlTags(fragment)).trim();

  const { tag, attrs, inner } = parsed;
  const name = tag.replace(/^.*:/, '').toLowerCase();

  if (name === 'para' || name === 'body' || name === 'note') {
    return convertXmlInline(inner, imageUrls).trim();
  }

  if (name === 'text') return decodeXml(stripXmlTags(inner));

  if (name === 'heading') {
    const level = Math.min(parseInt(attrs.level || '1', 10) || 1, 6);
    const text = convertXmlInline(inner, imageUrls).trim();
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  if (name === 'image') {
    const src = attrs.source || getXmlTagContent(fragment, 'source') || '';
    if (src) imageUrls.push(src);
    return src ? `![image](${src})` : '';
  }

  if (name === 'attach') {
    const filename = getXmlTagContent(fragment, 'filename') || 'attachment';
    const resource = getXmlTagContent(fragment, 'resource') || '';
    return resource ? `[${filename}](${resource})` : filename;
  }

  if (name === 'codelang' || name === 'code') {
    const lang = attrs.type || attrs.language || getXmlTagContent(fragment, 'language') || '';
    const code = decodeXml(stripXmlTags(inner)).trim();
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  if (name === 'todo') return `- [ ] ${convertXmlInline(inner, imageUrls).trim()}`;
  if (name === 'quote' || name === 'blockquote') return `> ${convertXmlInline(inner, imageUrls).trim()}`;
  if (name === 'horizontal-line') return '---';
  if (name === 'list-item') return `- ${convertXmlInline(inner, imageUrls).trim()}`;
  if (name === 'table') return convertXmlTableString(fragment);

  return convertXmlInline(inner, imageUrls).trim();
}

function convertXmlInline(xml, imageUrls) {
  let output = xml;
  output = output.replace(/<image\b([^>]*)>([\s\S]*?)<\/image>/gi, match => convertXmlFragment(match, imageUrls));
  output = output.replace(/<attach\b([^>]*)>([\s\S]*?)<\/attach>/gi, match => convertXmlFragment(match, imageUrls));
  output = output.replace(/<(bold|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, text) => `**${convertXmlInline(text, imageUrls)}**`);
  output = output.replace(/<(italic|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, text) => `*${convertXmlInline(text, imageUrls)}*`);
  output = output.replace(/<strikethrough\b[^>]*>([\s\S]*?)<\/strikethrough>/gi, (_, text) => `~~${convertXmlInline(text, imageUrls)}~~`);
  output = output.replace(/<link\b([^>]*)>([\s\S]*?)<\/link>/gi, (_, attrText, text) => {
    const href = parseXmlAttributes(attrText).href || '';
    const label = convertXmlInline(text, imageUrls) || href;
    return href ? `[${label}](${href})` : label;
  });
  return decodeXml(stripXmlTags(output));
}

function parseXmlElement(fragment) {
  const match = fragment.trim().match(/^<([A-Za-z0-9:_-]+)([^>]*)>([\s\S]*)<\/\1>$/);
  if (!match) return null;
  return {
    tag: match[1],
    attrs: parseXmlAttributes(match[2] || ''),
    inner: match[3] || '',
  };
}

function parseXmlAttributes(attrText) {
  const attrs = {};
  const regex = /([A-Za-z0-9:_-]+)\s*=\s*(['"])(.*?)\2/g;
  let match;
  while ((match = regex.exec(attrText)) !== null) {
    attrs[match[1].replace(/^.*:/, '')] = decodeXml(match[3]);
  }
  return attrs;
}

function getXmlTagContent(xml, tag) {
  const regex = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? decodeXml(match[1].trim()) : '';
}

function splitXmlTopLevel(xml) {
  const blocks = [];
  const regex = /<([A-Za-z0-9:_-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

function stripXmlTags(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(para|p|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function convertXmlTableString(fragment) {
  const content = getXmlTagContent(fragment, 'content');
  if (content) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data?.cells) && Array.isArray(data?.widths)) {
        const width = data.widths.length;
        const values = data.cells.map(cell => cell?.value || '');
        const rows = [];
        for (let i = 0; i < values.length; i += width) {
          rows.push(values.slice(i, i + width));
        }
        return rows.length ? formatSimpleMarkdownTable(rows) : '';
      }
    } catch {
      // Fall back to tag-based table parsing.
    }
  }

  const rows = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(fragment)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(decodeXml(stripXmlTags(cellMatch[1])).trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? formatSimpleMarkdownTable(rows) : decodeXml(stripXmlTags(fragment)).trim();
}

function formatSimpleMarkdownTable(rows) {
  const width = Math.max(...rows.map(row => row.length));
  const normalized = rows.map(row => Array.from({ length: width }, (_, i) => row[i] || ''));
  const lines = [
    '| ' + normalized[0].join(' | ') + ' |',
    '| ' + normalized[0].map(() => '---').join(' | ') + ' |',
  ];
  for (let i = 1; i < normalized.length; i++) {
    lines.push('| ' + normalized[i].join(' | ') + ' |');
  }
  return lines.join('\n');
}

function convertJsonToMarkdown(nodes) {
  const imageUrls = [];
  const lines = [];

  for (const node of nodes) {
    lines.push(convertJsonNode(node, imageUrls));
  }

  return { markdown: lines.join('\n'), imageUrls };
}

function convertJsonNode(node, imageUrls) {
  if (!node) return '';

  const type = node.type;

  if (type === 'heading') {
    const level = node.level || 1;
    const prefix = '#'.repeat(Math.min(level, 6));
    const text = extractJsonText(node.children);
    return `\n${prefix} ${text}\n`;
  }

  if (type === 'paragraph') {
    return extractJsonText(node.children, imageUrls) + '\n';
  }

  if (type === 'code-block' || type === 'code') {
    const lang = node.language || '';
    const text = extractJsonText(node.children);
    return `\`\`\`${lang}\n${text}\n\`\`\`\n`;
  }

  if (type === 'blockquote') {
    const text = node.children?.map(c => convertJsonNode(c, imageUrls)).join('') || '';
    return text.split('\n').map(l => `> ${l}`).join('\n') + '\n';
  }

  if (type === 'bulleted-list' || type === 'numbered-list') {
    const items = node.children || [];
    return items.map((item, i) => {
      const prefix = type === 'numbered-list' ? `${i + 1}.` : '-';
      const text = item.children?.map(c => convertJsonNode(c, imageUrls)).join('').trim() || '';
      return `${prefix} ${text}`;
    }).join('\n') + '\n';
  }

  if (type === 'todo-list') {
    const items = node.children || [];
    return items.map(item => {
      const checked = item.checked ? 'x' : ' ';
      const text = item.children?.map(c => convertJsonNode(c, imageUrls)).join('').trim() || '';
      return `- [${checked}] ${text}`;
    }).join('\n') + '\n';
  }

  if (type === 'image') {
    const url = node.url || node.src || '';
    if (url) imageUrls.push(url);
    return `![image](${url})\n`;
  }

  if (type === 'table') {
    return convertJsonTable(node);
  }

  if (type === 'horizontal-rule' || type === 'divider') {
    return '---\n';
  }

  // Inline or text node
  if (node.text !== undefined) {
    return formatInlineText(node);
  }

  // Unknown block, recurse
  if (node.children) {
    return node.children.map(c => convertJsonNode(c, imageUrls)).join('');
  }

  return '';
}

function extractJsonText(children, imageUrls) {
  if (!children) return '';
  return children.map(child => {
    if (child.type === 'image') {
      const url = child.url || child.src || '';
      if (url && imageUrls) imageUrls.push(url);
      return `![image](${url})`;
    }
    if (child.text !== undefined) {
      return formatInlineText(child);
    }
    if (child.type === 'link') {
      const href = child.url || '';
      const text = extractJsonText(child.children) || href;
      return `[${text}](${href})`;
    }
    if (child.children) {
      return extractJsonText(child.children, imageUrls);
    }
    return '';
  }).join('');
}

function formatInlineText(node) {
  let text = node.text || '';
  if (!text) return '';
  if (node.bold) text = `**${text}**`;
  if (node.italic) text = `*${text}*`;
  if (node.strikethrough) text = `~~${text}~~`;
  if (node.code) text = `\`${text}\``;
  return text;
}

function convertJsonTable(node) {
  const rows = node.children || [];
  if (!rows.length) return '';

  const lines = [];
  rows.forEach((row, i) => {
    const cells = (row.children || []).map(cell => {
      return (cell.children || []).map(c => convertJsonNode(c, [])).join('').trim();
    });
    lines.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) {
      lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    }
  });
  return lines.join('\n') + '\n';
}

function extractImageUrls(markdown) {
  const regex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// --- Numeric-key JSON format (new Youdao format with keys "5", "6", "7") ---

function convertNumericJsonToMarkdown(doc) {
  const imageUrls = [];
  const lines = [];
  const contents = doc['5'] || [];

  for (const content of contents) {
    const line = convertNumericBlock(content, imageUrls);
    if (line !== null) lines.push(line);
  }

  return { markdown: lines.join('\n'), imageUrls };
}

function convertNumericBlock(content, imageUrls) {
  const type = content['6'];
  if (type) {
    switch (type) {
      case 'h': return convertNumericHeading(content, imageUrls);
      case 'im': return convertNumericImage(content, imageUrls);
      case 'a': return convertNumericAttach(content);
      case 'cd': return convertNumericCode(content);
      case 'q': return convertNumericQuote(content, imageUrls);
      case 'l': return convertNumericList(content, imageUrls);
      case 't': return convertNumericTable(content, imageUrls);
      case 'hr': return '---';
      case 'li': return convertNumericLink(content);
      case 'la': return convertNumericHighlight(content, imageUrls);
      case 'drawio-ynote':
      case 'excalidraw':
      case 'mindmap':
        return convertNumericImage(content, imageUrls);
      case 'media': return convertNumericMedia(content);
      default: return getNumericText(content, imageUrls);
    }
  }
  return getNumericText(content, imageUrls);
}

function getNumericText(content, imageUrls, addAttr = true) {
  const fiveContents = content['5'];
  if (!fiveContents) return '';

  const parts = [];
  for (const item of fiveContents) {
    const subType = item['6'];
    if (subType === 'li') {
      parts.push(convertNumericLink(item));
    } else if (subType === 'tc') {
      parts.push(getNumericCellText(item, imageUrls));
    } else if (item['7']) {
      parts.push(getSevenText(item['7'], addAttr));
    } else if (item['5']) {
      parts.push(getNumericText(item, imageUrls, addAttr));
    }
  }
  return parts.join('');
}

function getSevenText(sevenContents, addAttr = true) {
  let text = '';
  for (const item of sevenContents) {
    let part = item['8'] || '';
    if (part && addAttr && item['9']) {
      part = applyNumericAttrs(part, item['9']);
    }
    text += part;
  }
  return text;
}

function applyNumericAttrs(text, attrs) {
  if (!Array.isArray(attrs) || !text) return text;
  for (const attr of attrs) {
    switch (attr['2']) {
      case 'b': text = `**${text}**`; break;
      case 'i': text = `*${text}*`; break;
      case 'u': text = `<u>${text}</u>`; break;
      case 'd': text = `~~${text}~~`; break;
      case 'c': text = `<font color="${attr['0']}">${text}</font>`; break;
    }
  }
  return text;
}

function convertNumericHeading(content, imageUrls) {
  const level = content['4']?.['l']?.replace('h', '') || '1';
  const text = getNumericText(content, imageUrls);
  return text ? `${'#'.repeat(parseInt(level))} ${text}` : '';
}

function convertNumericImage(content, imageUrls) {
  const url = content['4']?.['u'] || '';
  if (url) imageUrls.push(url);
  return `![](${url})`;
}

function convertNumericAttach(content) {
  const fn = content['4']?.['fn'] || '';
  const fl = content['4']?.['re'] || '';
  return `[${fn}](${fl})`;
}

function convertNumericCode(content) {
  const lang = content['4']?.['la'] || '';
  const codes = content['5'] || [];
  const lines = [];
  for (const code of codes) {
    const text = getNumericText(code, []);
    if (text) lines.push(text);
  }
  return `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``;
}

function convertNumericQuote(content, imageUrls) {
  const items = content['5'] || [];
  const lines = [];
  for (const item of items) {
    const text = getNumericText(item, imageUrls);
    lines.push(`> ${text.replace(/\n/g, '')}`);
  }
  return lines.join('\n');
}

function convertNumericList(content, imageUrls) {
  const text = getNumericText(content, imageUrls);
  const isOrdered = content['4']?.['lt'] === 'ordered';
  return isOrdered ? `1. ${text}` : `- ${text}`;
}

function convertNumericTable(content, imageUrls) {
  const rows = content['5'] || [];
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i]['5'] || [];
    const cells = cols.map(col => getNumericCellText(col, imageUrls));
    lines.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) {
      lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    }
  }
  return lines.join('\n');
}

function getNumericCellText(content, imageUrls) {
  const fiveContents = content['5'] || [];
  const parts = [];
  for (const item of fiveContents) {
    parts.push(getNumericText(item, imageUrls));
  }
  return parts.join('<br />');
}

function convertNumericLink(content) {
  const text = getNumericText(content, [], false);
  const hf = content['4']?.['hf'] || '';
  return hf ? `[${text}](${hf})` : text;
}

function convertNumericHighlight(content, imageUrls) {
  const items = content['5'] || [];
  const parts = [];
  for (const item of items) {
    const text = getNumericText(item, imageUrls);
    parts.push(`<mark>${text.replace(/\n/g, '')}</mark>`);
  }
  return parts.join('');
}

function convertNumericMedia(content) {
  const sr = content['4']?.['sr'] || 'outside link:';
  const hf = content['4']?.['hf'] || '';
  return `[${sr}](${hf})`;
}
