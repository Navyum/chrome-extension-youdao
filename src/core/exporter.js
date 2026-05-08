import { EXPORT_PHASE, i18n } from './constants.js';
import { downloadNote, downloadNoteBinary, downloadResource } from './youdao-api.js';
import { convertToMarkdown } from './converter.js';
import { ZipBuilder } from './zip-builder.js';
import { getState, updateState, resetState } from './state.js';
import {
  convertExcalidraw,
  convertLxTable,
  convertMindmap,
  dataUrlToBytes,
  getSpecialText,
  normalizeSpecialData,
} from './special-converter.js';

let zipBuilder = null;
let zipBlob = null;
let paused = false;
let pauseResolve = null;

export async function startExport(tree, selectedIds, sendProgress) {
  resetState();
  paused = false;
  zipBuilder = new ZipBuilder();
  zipBlob = null;

  const idSet = new Set(selectedIds);
  // Also select all ancestors and descendants of selected nodes
  expandSelection(tree, idSet);

  const notes = [];
  collectNotesFromTree(tree, idSet, '', notes);

  if (notes.length === 0) {
    updateState({
      phase: EXPORT_PHASE.ERROR,
      errors: [{ name: i18n('exportTaskName'), error: i18n('noExportableFiles') }],
    });
    sendProgress(getState());
    return getState();
  }

  updateState({
    phase: EXPORT_PHASE.EXPORTING,
    total: notes.length,
    current: 0,
  });
  sendProgress(getState());

  for (let i = 0; i < notes.length; i++) {
    // Check pause
    if (paused) {
      updateState({ phase: EXPORT_PHASE.PAUSED });
      sendProgress(getState());
      await new Promise(resolve => { pauseResolve = resolve; });
      updateState({ phase: EXPORT_PHASE.EXPORTING });
    }

    const note = notes[i];
    updateState({
      current: i + 1,
      currentNote: note.name,
    });
    sendProgress(getState());

    try {
      if (isImageFile(note.path)) {
        const imageData = await downloadNoteBinary(note.id);
        exportImageFile(note, imageData);
        updateState({ successCount: getState().successCount + 1 });
        continue;
      }

      const noteData = await downloadNote(note.id);
      if (isSpecialFormat(note.path)) {
        await exportSpecialFormat(note, noteData);
        updateState({ successCount: getState().successCount + 1 });
        continue;
      }

      // Determine content and type
      let content;
      let editorType = 0;
      if (noteData['5'] !== undefined) {
        // New numeric-key JSON format
        content = noteData;
        editorType = 1;
      } else if (noteData.content !== undefined) {
        content = noteData.content;
        editorType = noteData.orgEditorType || 0;
      } else if (noteData.body !== undefined) {
        content = noteData.body;
        editorType = noteData.orgEditorType || 0;
      } else {
        content = noteData;
      }

      // Convert to markdown
      const { markdown, imageUrls } = convertToMarkdown(content, editorType);

      // Determine file path
      let notePath = note.path;
      if (!notePath.endsWith('.md')) {
        notePath = notePath.replace(/\.[^.]+$/, '') + '.md';
      }

      // Download images and replace URLs
      let finalMarkdown = markdown;
      const assetsDir = getAssetsDir(notePath);
      const assetPrefix = getBaseName(notePath);
      const referencedImageUrls = uniqueReferencedUrls(imageUrls, finalMarkdown);

      for (let j = 0; j < referencedImageUrls.length; j++) {
        const imgUrl = referencedImageUrls[j];
        try {
          const imgData = await downloadResource(imgUrl);
          const ext = guessImageExt(imgUrl);
          const imgName = `${assetPrefix}_img_${String(j + 1).padStart(3, '0')}${ext}`;
          const imgPath = `${assetsDir}/${imgName}`;

          zipBuilder.addImage(imgPath, imgData);

          // Replace URL with relative path
          const relativePath = `assets/${imgName}`;
          finalMarkdown = finalMarkdown.split(imgUrl).join(relativePath);
        } catch (imgErr) {
          console.warn(`Failed to download image: ${imgUrl}`, imgErr);
        }
      }

      finalMarkdown = removeExternalImageReferences(finalMarkdown);
      zipBuilder.addMarkdown(notePath, finalMarkdown);
      updateState({ successCount: getState().successCount + 1 });
    } catch (err) {
      const state = getState();
      updateState({
        failedCount: state.failedCount + 1,
        errors: [...state.errors, {
          noteId: note.id,
          name: note.name,
          error: err.message,
        }],
      });
    }
  }

  // ZIP packing
  updateState({ phase: EXPORT_PHASE.ZIPPING, currentNote: '' });
  sendProgress(getState());

  zipBlob = await zipBuilder.generate();

  updateState({ phase: EXPORT_PHASE.COMPLETE });
  sendProgress(getState());

  return getState();
}

export function pauseExport() {
  paused = true;
}

export function resumeExport() {
  paused = false;
  if (pauseResolve) {
    pauseResolve();
    pauseResolve = null;
  }
}

export function getZipBlob() {
  return zipBlob;
}

export function clearExportArtifacts() {
  zipBuilder = null;
  zipBlob = null;
  paused = false;
  pauseResolve = null;
}

function collectNotesFromTree(node, selectedIds, parentPath, notes) {
  const isRoot = !parentPath && node.name === 'Root';
  const currentPath = isRoot
    ? ''
    : parentPath
      ? `${parentPath}/${sanitizeFilename(node.name)}`
      : sanitizeFilename(node.name);

  if (node.isDir) {
    for (const child of node.children) {
      collectNotesFromTree(child, selectedIds, currentPath, notes);
    }
  } else if (selectedIds.has(node.id)) {
    notes.push({
      id: node.id,
      name: node.name,
      path: currentPath,
    });
  }
}

function expandSelection(tree, idSet) {
  // If a directory is selected, select all its descendants
  function markDescendants(node) {
    idSet.add(node.id);
    if (node.children) {
      for (const child of node.children) {
        markDescendants(child);
      }
    }
  }

  function walk(node) {
    if (idSet.has(node.id) && node.isDir) {
      markDescendants(node);
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  walk(tree);
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
}

function getBaseName(path) {
  const fileName = path.substring(path.lastIndexOf('/') + 1);
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return sanitizeFilename(withoutExt) || 'note';
}

function guessImageExt(url) {
  const match = url.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?|$)/i);
  if (match) return `.${match[1].toLowerCase()}`;
  return '.png';
}

function isSpecialFormat(path) {
  return ['.mindmap', '.drawio', '.excalidraw', '.lxtable', '.table'].includes(getExtension(path));
}

function isImageFile(path) {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(getExtension(path));
}

function exportImageFile(note, imageData) {
  const assetName = sanitizeFilename(note.name);
  zipBuilder.addFile(`${getAssetsDir(note.path)}/${assetName}`, imageData);
  zipBuilder.addMarkdown(note.path, buildImageMarkdown(note.name, assetName));
}

async function exportSpecialFormat(note, noteData) {
  const ext = getExtension(note.path);
  const data = normalizeSpecialData(noteData);

  if (ext === '.mindmap') {
    const converted = convertMindmap(data);
    zipBuilder.addMarkdown(note.path, converted.markdown);
    return;
  }

  if (ext === '.drawio') {
    const content = getSpecialText(noteData);
    if (content.startsWith('data:image/svg+xml;base64,')) {
      const assetName = `${getBaseName(note.path)}.svg`;
      zipBuilder.addFile(`${getAssetsDir(note.path)}/${assetName}`, dataUrlToText(content));
      zipBuilder.addMarkdown(note.path, buildImageMarkdown(note.name, assetName));
    } else {
      zipBuilder.addMarkdown(note.path, 'Draw.io content could not be converted to an SVG asset.\n');
    }
    return;
  }

  if (ext === '.lxtable' || ext === '.table') {
    const converted = convertLxTable(data);
    zipBuilder.addMarkdown(note.path, converted.markdown);
    return;
  }

  if (ext === '.excalidraw') {
    const converted = convertExcalidraw(data);
    const assetName = `${getBaseName(note.path)}.svg`;
    zipBuilder.addFile(`${getAssetsDir(note.path)}/${assetName}`, converted.svg);
    zipBuilder.addMarkdown(note.path, buildImageMarkdown(note.name, assetName));
    return;
  }

  zipBuilder.addMarkdown(note.path, 'Unsupported special format.\n');
}

function getExtension(path) {
  const match = path.match(/(\.[^./\\]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function dataUrlToText(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  return new TextDecoder('utf-8').decode(bytes);
}

function buildImageMarkdown(title, assetName) {
  const baseName = title.replace(/\.[^.]+$/, '');
  return [
    `# ${baseName}`,
    '',
    `![${escapeMarkdownAlt(baseName)}](assets/${encodeURI(assetName)})`,
    '',
  ].join('\n');
}

function escapeMarkdownAlt(value) {
  return String(value).replace(/[[\]\\]/g, '\\$&');
}

function uniqueReferencedUrls(urls, markdown) {
  const result = [];
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url) || !markdown.includes(url) || !isDownloadableResourceUrl(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function isDownloadableResourceUrl(url) {
  return /^https?:\/\//i.test(url) || String(url).startsWith('/');
}

function removeExternalImageReferences(markdown) {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, target) => {
    if (target.startsWith('assets/')) return match;
    return alt ? `<!-- Image omitted: ${alt} -->` : '<!-- Image omitted: unsupported external resource -->';
  });
}

function getDirPath(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.substring(0, index);
}

function getAssetsDir(path) {
  const dirPath = getDirPath(path);
  return dirPath ? `${dirPath}/assets` : 'assets';
}
