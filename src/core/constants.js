export const YOUDAO_BASE = 'https://note.youdao.com';
export const API_BASE = `${YOUDAO_BASE}/yws/api/personal`;

export const COOKIE_DOMAIN = 'note.youdao.com';
export const COOKIE_NAMES = {
  CSTK: 'YNOTE_CSTK',
  LOGIN: 'YNOTE_LOGIN',
  SESS: 'YNOTE_SESS',
};

export const THROTTLE = {
  requestInterval: 100,
  maxConcurrent: 3,
  retryMax: 3,
  retryBaseDelay: 1000,
};

export const EDITOR_TYPE = {
  XML: 0,
  JSON: 1,
};

export const EXPORT_PHASE = {
  IDLE: 'idle',
  LOADING: 'loading',
  EXPORTING: 'exporting',
  ZIPPING: 'zipping',
  COMPLETE: 'complete',
  PAUSED: 'paused',
  ERROR: 'error',
};

export const ACTIONS = {
  CHECK_LOGIN: 'checkLogin',
  LOAD_NOTEBOOKS: 'loadNotebooks',
  LOGOUT: 'logout',
  START_EXPORT: 'startExport',
  PAUSE_EXPORT: 'pauseExport',
  RESUME_EXPORT: 'resumeExport',
  GET_STATUS: 'getExportStatus',
  DOWNLOAD_ZIP: 'downloadZip',
};

export const EVENTS = {
  EXPORT_PROGRESS: 'exportProgress',
  EXPORT_COMPLETE: 'exportComplete',
  EXPORT_ERROR: 'exportError',
};

export function i18n(key, ...subs) {
  try {
    return chrome.i18n.getMessage(key, subs) || key;
  } catch {
    return key;
  }
}
