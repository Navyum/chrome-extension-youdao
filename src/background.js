import { ACTIONS, COOKIE_NAMES, EXPORT_PHASE, YOUDAO_BASE, i18n } from './core/constants.js';
import { buildNotebookTree } from './core/youdao-api.js';
import { startExport, pauseExport, resumeExport, getZipBlob, clearExportArtifacts } from './core/exporter.js';
import { getState, resetState, restoreState, updateState } from './core/state.js';

let notebookTree = null;
let exportTask = null;

// Restore state on SW restart
restoreState();

async function collectYoudaoCookies() {
  const queries = [
    {},
    { domain: 'youdao.com' },
    { domain: 'note.youdao.com' },
    { url: 'https://youdao.com/' },
    { url: 'https://www.youdao.com/' },
    { url: 'https://note.youdao.com/' },
    { url: 'http://youdao.com/' },
    { url: 'http://www.youdao.com/' },
    { url: 'http://note.youdao.com/' },
  ];
  const cookieMap = new Map();

  for (const query of queries) {
    try {
      const cookies = await chrome.cookies.getAll(query);
      for (const cookie of cookies) {
        if (!isYoudaoCookie(cookie)) continue;
        const key = `${cookie.domain}|${cookie.path}|${cookie.name}|${cookie.storeId || ''}`;
        cookieMap.set(key, cookie);
      }
    } catch (error) {
      console.warn('[sync] Failed to read cookies with query:', query, error);
    }
  }

  const cookies = Array.from(cookieMap.values());
  console.log('[sync] Cookie read detail', {
    count: cookies.length,
    names: Array.from(new Set(cookies.map(cookie => cookie.name))).sort(),
  });
  return cookies;
}

function isYoudaoCookie(cookie) {
  return (
    cookie.domain === 'note.youdao.com' ||
    cookie.domain.endsWith('.note.youdao.com') ||
    cookie.domain === 'youdao.com' ||
    cookie.domain.endsWith('.youdao.com')
  );
}

// Sync Youdao cookies across compatible Youdao domains.
async function syncYoudaoCookies() {
  const all = await collectYoudaoCookies();
  const foundNames = new Set(all.map(cookie => cookie.name));
  const requiredNames = [COOKIE_NAMES.CSTK, COOKIE_NAMES.LOGIN, COOKIE_NAMES.SESS];
  const missingNames = requiredNames.filter(name => !foundNames.has(name));
  console.log(
    `[sync] Found ${all.length} youdao cookies; required missing: ${missingNames.join(', ') || 'none'}`
  );
  for (const cookie of all) {
    try {
      const newCookie = {
        url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite || 'unspecified',
      };
      if (!cookie.hostOnly) newCookie.domain = cookie.domain;
      if (cookie.expirationDate && !cookie.session) newCookie.expirationDate = cookie.expirationDate;
      await chrome.cookies.set(newCookie);
    } catch (e) {
      // ignore
    }
  }
}

async function getYoudaoUserInfo() {
  const youdaoCookies = await collectYoudaoCookies();
  const byName = new Map();
  for (const cookie of youdaoCookies) {
    if (!byName.has(cookie.name)) {
      byName.set(cookie.name, getCookieValue(youdaoCookies, cookie.name));
    }
  }
  const isLoggedIn = Boolean(
    byName.get(COOKIE_NAMES.SESS) ||
    byName.get('NTES_YD_SESS') ||
    byName.get('YNOTE_PERS') ||
    byName.get('P_INFO') ||
    byName.get(COOKIE_NAMES.LOGIN)
  );

  if (!isLoggedIn) {
    return { isLoggedIn: false };
  }

  const account = extractAccountFromCookies(byName);
  const userId = extractUserIdFromCookies(byName);
  const displayName = account ? maskAccount(account) : i18n('youdaoUser');
  const avatarUrl = await fetchYoudaoAvatar(userId).catch(error => {
    console.warn('[auth] Failed to fetch Youdao avatar:', error);
    return '';
  });
  const fallbackAvatarUrl = buildInitialAvatar(displayName);
  console.log('[auth] Youdao user info', {
    isLoggedIn: true,
    hasUserId: Boolean(userId),
    avatarLoaded: Boolean(avatarUrl),
  });
  return {
    isLoggedIn: true,
    login: displayName,
    userName: displayName,
    userId,
    avatarUrl: avatarUrl || (userId ? buildAvatarApiUrl(userId) : fallbackAvatarUrl),
    fallbackAvatarUrl,
  };
}

function getCookieValue(cookies, name) {
  const matches = cookies.filter(cookie => cookie.name === name && cookie.value);
  if (!matches.length) return '';
  matches.sort((a, b) => cookieScore(b) - cookieScore(a));
  return matches[0].value;
}

function cookieScore(cookie) {
  let score = 0;
  if (cookie.domain === 'note.youdao.com') score += 100;
  if (cookie.domain.endsWith('.note.youdao.com')) score += 80;
  if (cookie.domain === 'youdao.com') score += 60;
  if (cookie.domain.endsWith('.youdao.com')) score += 40;
  if (cookie.path === '/') score += 10;
  if (cookie.secure) score += 1;
  return score;
}

function extractAccountFromCookies(cookiesByName) {
  const pInfo = cookiesByName.get('P_INFO') || '';
  const pInfoAccount = decodeCookieValue(pInfo).split('|').find(part => /^\d{5,}$/.test(part));
  if (pInfoAccount) return pInfoAccount;

  const sInfo = cookiesByName.get('S_INFO') || '';
  const sInfoAccount = decodeCookieValue(sInfo).split('|').find(part => /^\d{5,}$/.test(part));
  if (sInfoAccount) return sInfoAccount;

  const ynotePers = decodeCookieValue(cookiesByName.get('YNOTE_PERS') || '');
  const ynoteParts = ynotePers.split('||').flatMap(part => part.split('|'));
  return ynoteParts.find(part => /^\d{5,}$/.test(part)) || '';
}

function extractUserIdFromCookies(cookiesByName) {
  const ynotePers = decodeCookieValue(cookiesByName.get('YNOTE_PERS') || '');
  const match = ynotePers.match(/\byd\.[a-zA-Z0-9_-]+\b/);
  return match?.[0] || '';
}

async function fetchYoudaoAvatar(userId) {
  if (!userId) return '';
  const url = buildAvatarApiUrl(userId);
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    console.warn(`[auth] Youdao avatar request failed: HTTP ${response.status}`);
    return '';
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    console.warn(`[auth] Youdao avatar response is not an image: ${contentType}`);
    return '';
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) return '';
  return arrayBufferToDataUrl(buffer, contentType);
}

function buildAvatarApiUrl(userId) {
  return `${YOUDAO_BASE}/yws/api/image/normal/${Date.now()}?userId=${encodeURIComponent(userId)}`;
}

function arrayBufferToDataUrl(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function maskAccount(account) {
  if (/^1\d{10}$/.test(account)) {
    return `${account.slice(0, 3)}****${account.slice(-4)}`;
  }
  if (account.includes('@')) {
    const [name, domain] = account.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return account.length > 8 ? `${account.slice(0, 3)}***${account.slice(-3)}` : account;
}

function buildInitialAvatar(name) {
  const initial = (name || i18n('avatarFallbackInitial')).trim().charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#8b5cf6"/>
          <stop offset="1" stop-color="#10b981"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="32" fill="url(#g)"/>
      <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
        fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
        font-size="28" font-weight="700">${escapeSvg(initial)}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // async response
});

async function handleMessage(message) {
  const { action, data } = message;

  switch (action) {
    case ACTIONS.CHECK_LOGIN:
      await syncYoudaoCookies();
      return { userInfo: await getYoudaoUserInfo() };

    case ACTIONS.LOAD_NOTEBOOKS:
      await syncYoudaoCookies();
      notebookTree = await buildNotebookTree();
      return { tree: notebookTree, userInfo: await getYoudaoUserInfo() };

    case ACTIONS.LOGOUT: {
      pauseExport();
      exportTask = null;
      notebookTree = null;
      resetState();
      clearExportArtifacts();
      return { success: true };
    }

    case ACTIONS.START_EXPORT: {
      if (!notebookTree) {
        throw new Error('Notebooks not loaded');
      }
      if (exportTask && getState().phase === EXPORT_PHASE.EXPORTING) {
        return { success: true, alreadyRunning: true };
      }

      exportTask = runExportInBackground(data.selectedIds);
      return { success: true, background: true };
    }

    case ACTIONS.PAUSE_EXPORT:
      pauseExport();
      return { success: true };

    case ACTIONS.RESUME_EXPORT:
      resumeExport();
      return { success: true };

    case ACTIONS.GET_STATUS:
      return { status: getState() };

    case ACTIONS.DOWNLOAD_ZIP: {
      await downloadCurrentZip(true);
      return { success: true };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function sendProgress(state) {
  chrome.runtime.sendMessage({
    action: 'exportProgress',
    data: state,
  }).catch(() => {
    // Popup might be closed. Background export continues.
  });
}

async function runExportInBackground(selectedIds) {
  try {
    await startExport(notebookTree, selectedIds, sendProgress);
    if (getState().phase === EXPORT_PHASE.COMPLETE) {
      await downloadCurrentZip(false);
    }
  } catch (err) {
    updateState({
      phase: EXPORT_PHASE.ERROR,
      errors: [...getState().errors, { name: i18n('exportTaskName'), error: err.message }],
      failedCount: getState().failedCount + 1,
    });
    sendProgress(getState());
  } finally {
    exportTask = null;
  }
}

async function downloadCurrentZip(saveAs) {
  const blob = getZipBlob();
  if (!blob) throw new Error('No ZIP available');

  const reader = new FileReader();
  const dataUrl = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  await chrome.downloads.download({
    url: dataUrl,
    filename: buildZipFilename(),
    saveAs,
  });
}

function buildZipFilename() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `YoudaoNote-Export-${dateStr}.zip`;
}
