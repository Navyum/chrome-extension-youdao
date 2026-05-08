import { API_BASE, COOKIE_NAMES, YOUDAO_BASE, i18n } from './constants.js';
import { throttledFetch } from './throttle.js';

const clientIds = {};

async function getYnoteCstk() {
  const cookie = await chrome.cookies.get({
    url: `${YOUDAO_BASE}/`,
    name: COOKIE_NAMES.CSTK,
  });
  if (cookie?.value) return cookie.value;

  const queries = [
    { domain: 'youdao.com' },
    { domain: 'note.youdao.com' },
    { url: `${YOUDAO_BASE}/` },
    { url: 'https://youdao.com/' },
    { url: 'https://www.youdao.com/' },
  ];
  for (const query of queries) {
    try {
      const cookies = await chrome.cookies.getAll(query);
      const cstk = cookies.find(item => (
        item.name === COOKIE_NAMES.CSTK &&
        (item.domain === 'note.youdao.com' || item.domain.endsWith('.youdao.com'))
      ))?.value;
      if (cstk) return cstk;
    } catch {
      // Try the next cookie query variant.
    }
  }
}

async function withCstk(url, body = null) {
  const cstk = await getYnoteCstk();
  if (!cstk) {
    throw new Error(i18n('cstkMissing'));
  }

  const requestUrl = new URL(url);
  requestUrl.searchParams.set('cstk', cstk);

  if (!body) {
    return { url: requestUrl.toString(), body: null };
  }

  const params = body instanceof URLSearchParams
    ? new URLSearchParams(body)
    : new URLSearchParams(body);
  params.set('cstk', cstk);

  return { url: requestUrl.toString(), body: params };
}

async function apiRequest(url, body = null) {
  const request = await withCstk(url, body);
  const options = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  };

  if (request.body) {
    options.method = 'POST';
    options.body = request.body.toString();
  }

  const response = await throttledFetch(request.url, options);
  return response.json();
}

export async function getRootDir() {
  const data = await apiRequest(
    `${API_BASE}/file?method=getByPath&keyfrom=web`,
    { path: '/', entire: 'true', purge: 'false' }
  );
  return data.fileEntry;
}

export async function listDir(dirId) {
  const data = await apiRequest(
    `${API_BASE}/file/${dirId}?all=true&f=true&len=1000&sort=1&isReverse=false&method=listPageByParentId&keyfrom=web`
  );
  if (data && data.entries) {
    return data.entries.map(item => item.fileEntry);
  }
  return Array.isArray(data) ? data.map(item => item.fileEntry || item) : [];
}

export async function downloadNote(noteId) {
  const response = await downloadNoteResponse(noteId);

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { content: text };
  }
}

export async function downloadNoteBinary(noteId) {
  const response = await downloadNoteResponse(noteId);
  return response.arrayBuffer();
}

async function downloadNoteResponse(noteId) {
  const request = await withCstk(
    buildDownloadUrl(),
    {
      fileId: noteId,
      version: '-1',
      convert: 'true',
      editorVersion: String(Date.now()),
      editorType: '1',
    }
  );

  return throttledFetch(request.url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: request.body.toString(),
  });
}

export async function downloadResource(resourceUrl) {
  const url = resourceUrl.startsWith('http') ? resourceUrl : `${YOUDAO_BASE}${resourceUrl}`;
  const response = await throttledFetch(url, { credentials: 'include' });
  return response.arrayBuffer();
}

function buildDownloadUrl() {
  const params = new URLSearchParams({
    method: 'download',
    _system: 'macos',
    _systemVersion: '',
    _screenWidth: String(globalThis.screen?.width || 1920),
    _screenHeight: String(globalThis.screen?.height || 1080),
    _appName: 'ynote',
    _appuser: getStableClientId('youdao_appuser'),
    _vendor: 'official-website',
    _launch: '13994',
    _firstTime: '',
    _deviceId: getStableClientId('youdao_device'),
    _platform: 'web',
    _cityCode: '',
    _cityName: '',
    _product: 'YNote-Web',
    _version: '',
    sev: 'j1',
    sec: 'v1',
    keyfrom: 'web',
  });
  return `${API_BASE}/sync?${params.toString()}`;
}

function getStableClientId(key) {
  if (!clientIds[key]) clientIds[key] = randomHex(32);
  return clientIds[key];
}

function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

export async function buildNotebookTree() {
  const root = await getRootDir();
  if (!root) throw new Error('Failed to get root directory — cookies may be expired');
  return buildTreeRecursive(root, 0);
}

async function buildTreeRecursive(entry, depth) {
  const node = {
    id: entry.id,
    name: entry.name === '/' ? 'Root' : entry.name,
    isDir: entry.dir !== undefined ? entry.dir : !!entry.parentId,
    children: [],
    noteCount: 0,
  };

  if (node.isDir) {
    const children = await listDir(entry.id);
    for (const child of children) {
      const childNode = await buildTreeRecursive(child, depth + 1);
      node.children.push(childNode);
      node.noteCount += childNode.isDir ? childNode.noteCount : 1;
    }
  }

  return node;
}
