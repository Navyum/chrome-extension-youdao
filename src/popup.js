import { ACTIONS, EXPORT_PHASE } from './core/constants.js';

// DOM refs
const views = {
  login: document.getElementById('view-login'),
  loading: document.getElementById('view-loading'),
  tree: document.getElementById('view-tree'),
  progress: document.getElementById('view-progress'),
  complete: document.getElementById('view-complete'),
};

const els = {
  loginBtn: document.getElementById('login-btn'),
  loginIcon: document.getElementById('loginIcon'),
  loginAvatar: document.getElementById('loginAvatar'),
  userInfoPopup: document.getElementById('userInfoPopup'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  userLogin: document.getElementById('userLogin'),
  sponsorBtn: document.getElementById('sponsor-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  sponsorModal: document.getElementById('sponsorModal'),
  sponsorModalClose: document.getElementById('sponsorModalClose'),
  btnOpenYoudao: document.getElementById('btn-open-youdao'),
  cbSelectAll: document.getElementById('cb-select-all'),
  notebookTree: document.getElementById('notebook-tree'),
  btnStartExport: document.getElementById('btn-start-export'),
  btnPause: document.getElementById('btn-pause'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  progressPhase: document.getElementById('progress-phase'),
  progressInfo: document.getElementById('progress-info'),
  progressCurrent: document.getElementById('progress-current'),
  btnPauseProgress: document.getElementById('btn-pause-progress'),
  statSuccess: document.getElementById('stat-success'),
  statFailed: document.getElementById('stat-failed'),
  statSkipped: document.getElementById('stat-skipped'),
  btnDownloadZip: document.getElementById('btn-download-zip'),
  btnViewErrors: document.getElementById('btn-view-errors'),
  btnExportAgain: document.getElementById('btn-export-again'),
  errorList: document.getElementById('error-list'),
  errorSection: document.getElementById('error-section'),
  btnBackComplete: document.getElementById('btn-back-complete'),
  fileInfo: document.getElementById('fileInfo'),
  totalNotes: document.getElementById('totalNotes'),
  folderCount: document.getElementById('folderCount'),
  selectedCount: document.getElementById('selectedCount'),
  status: document.getElementById('status'),
};

let treeData = null;
let paused = false;
let currentUserInfo = null;
let userPopupTimer = null;
const MAX_SPONSOR_HOVER_SHOWS_PER_DAY = 3;
let sponsorHoverTimer = null;
let currentView = null;
let completeCelebrated = false;

// --- Init ---

init();

async function init() {
  applyI18n();
  bindEvents();

  try {
    // Check if already exporting (restore state from background)
    const statusResp = await sendMessage(ACTIONS.GET_STATUS);
    const status = statusResp?.status;
    if (status && status.phase === EXPORT_PHASE.EXPORTING) {
      showView('progress');
      updateProgress(status);
      await refreshLoginState();
      return;
    }
    if (status && (status.phase === EXPORT_PHASE.COMPLETE || status.phase === EXPORT_PHASE.ERROR)) {
      showView('complete');
      updateComplete(status);
      await refreshLoginState();
      return;
    }

    await refreshLoginState();
    // Try to load notebooks directly — this validates login via API call
    await loadNotebooks();
  } catch (err) {
    updateLoginUser(null);
    showView('login');
  }
}

// --- I18n ---

function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage?.() || document.documentElement.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-title'));
    if (msg) el.title = msg;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-aria-label'));
    if (msg) el.setAttribute('aria-label', msg);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-alt'));
    if (msg) el.alt = msg;
  });
}

function msg(key, ...subs) {
  return chrome.i18n.getMessage(key, subs) || key;
}

// --- Views ---

function showView(name) {
  Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
  views[name]?.classList.remove('hidden');
  currentView = name;
}

// --- Events ---

function bindEvents() {
  els.loginBtn?.addEventListener('click', handleLoginClick);
  els.sponsorBtn?.addEventListener('click', () => toggleSponsorModal(true));
  els.sponsorBtn?.addEventListener('mouseenter', handleSponsorHoverEnter);
  els.sponsorBtn?.addEventListener('mouseleave', handleSponsorHoverLeave);
  els.sponsorModalClose?.addEventListener('click', () => toggleSponsorModal(false));
  els.sponsorModal?.addEventListener('click', (event) => {
    if (event.target === els.sponsorModal) toggleSponsorModal(false);
  });
  els.sponsorModal?.addEventListener('mouseenter', clearSponsorHoverTimer);
  els.sponsorModal?.addEventListener('mouseleave', handleSponsorHoverLeave);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.sponsorModal?.classList.contains('is-visible')) {
      toggleSponsorModal(false);
    }
    if (event.key === 'Escape' && els.userInfoPopup?.style.display !== 'none') {
      hideUserInfoPopup();
    }
  });

  els.settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.logoutBtn?.addEventListener('click', handleLogout);

  els.btnOpenYoudao?.addEventListener('click', openYoudaoLogin);

  document.getElementById('btn-retry-load')?.addEventListener('click', () => {
    loadNotebooks();
  });

  els.cbSelectAll?.addEventListener('change', () => {
    const checked = els.cbSelectAll.checked;
    els.notebookTree.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
    });
    updateSelectionCount();
  });

  els.btnStartExport?.addEventListener('click', handleStartExport);
  els.btnPause?.addEventListener('click', handlePauseResume);
  els.btnPauseProgress?.addEventListener('click', handlePauseResume);

  els.btnDownloadZip?.addEventListener('click', async () => {
    els.btnDownloadZip.disabled = true;
    await sendMessage(ACTIONS.DOWNLOAD_ZIP);
    els.btnDownloadZip.disabled = false;
  });

  els.btnViewErrors?.addEventListener('click', () => {
    els.errorSection?.classList.remove('hidden');
  });
  els.btnBackComplete?.addEventListener('click', () => {
    els.errorSection?.classList.add('hidden');
  });
  els.btnExportAgain?.addEventListener('click', () => loadNotebooks());

  // Listen for progress updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'exportProgress') {
      const state = message.data;
      if (state.phase === EXPORT_PHASE.COMPLETE || state.phase === EXPORT_PHASE.ERROR) {
        const shouldCelebrate = state.phase === EXPORT_PHASE.COMPLETE && currentView !== 'complete' && !completeCelebrated;
        showView('complete');
        updateComplete(state);
        if (shouldCelebrate) {
          completeCelebrated = true;
          showConfetti();
        }
      } else {
        updateProgress(state);
      }
    }
  });
}

function openYoudaoLogin() {
  chrome.tabs.create({ url: 'https://note.youdao.com/' });
}

function handleLoginClick() {
  if (currentUserInfo?.isLoggedIn || treeData) {
    if (!currentUserInfo?.isLoggedIn) {
      updateLoginUser({ isLoggedIn: true, login: msg('loggedIn'), userName: msg('youdaoUser') });
    }
    toggleUserInfoPopup();
  } else {
    openYoudaoLogin();
  }
}

async function refreshLoginState() {
  try {
    const resp = await sendMessage(ACTIONS.CHECK_LOGIN);
    updateLoginUser(resp?.userInfo || null);
  } catch {
    updateLoginUser(null);
  }
}

function updateLoginUser(userInfo) {
  currentUserInfo = userInfo?.isLoggedIn ? userInfo : null;
  if (currentUserInfo?.isLoggedIn) {
    currentUserInfo.fallbackAvatarUrl = currentUserInfo.fallbackAvatarUrl || buildLocalAvatar(currentUserInfo.userName || currentUserInfo.login || msg('avatarFallbackInitial'));
    currentUserInfo.avatarUrl = currentUserInfo.avatarUrl || currentUserInfo.fallbackAvatarUrl;
    if (els.loginIcon) els.loginIcon.style.display = 'none';
    if (els.loginAvatar) {
      els.loginAvatar.onerror = () => {
        if (currentUserInfo?.fallbackAvatarUrl && els.loginAvatar.src !== currentUserInfo.fallbackAvatarUrl) {
          els.loginAvatar.src = currentUserInfo.fallbackAvatarUrl;
        }
      };
      els.loginAvatar.src = currentUserInfo.avatarUrl;
      els.loginAvatar.style.display = 'block';
    }
    els.loginBtn?.classList.add('is-logged-in');
    if (els.loginBtn) {
      els.loginBtn.title = currentUserInfo.userName || currentUserInfo.login || msg('loggedIn');
      els.loginBtn.setAttribute('aria-label', els.loginBtn.title);
    }
    updateUserInfoPopup(currentUserInfo);
  } else {
    if (els.loginIcon) els.loginIcon.style.display = 'block';
    if (els.loginAvatar) {
      els.loginAvatar.removeAttribute('src');
      els.loginAvatar.style.display = 'none';
    }
    els.loginBtn?.classList.remove('is-logged-in');
    if (els.loginBtn) {
      els.loginBtn.title = msg('loginYoudao');
      els.loginBtn.setAttribute('aria-label', msg('loginYoudao'));
    }
    hideUserInfoPopup();
  }
}

function updateUserInfoPopup(userInfo) {
  if (els.userAvatar && userInfo.avatarUrl) {
    els.userAvatar.onerror = () => {
      if (userInfo.fallbackAvatarUrl && els.userAvatar.src !== userInfo.fallbackAvatarUrl) {
        els.userAvatar.src = userInfo.fallbackAvatarUrl;
      }
    };
    els.userAvatar.src = userInfo.avatarUrl;
  }
  if (els.userName) els.userName.textContent = userInfo.userName || userInfo.login || msg('youdaoUser');
  if (els.userLogin) els.userLogin.textContent = userInfo.login ? `@${userInfo.login}` : msg('loggedIn');
}

function buildLocalAvatar(name) {
  const initial = (name || msg('avatarFallbackInitial')).trim().charAt(0).toUpperCase();
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

function toggleUserInfoPopup() {
  if (!els.userInfoPopup) return;
  const isVisible = els.userInfoPopup.style.display !== 'none';
  if (isVisible) {
    hideUserInfoPopup();
    return;
  }
  els.userInfoPopup.style.display = 'flex';
  if (userPopupTimer) clearTimeout(userPopupTimer);
  userPopupTimer = setTimeout(hideUserInfoPopup, 3000);
}

function hideUserInfoPopup() {
  if (userPopupTimer) {
    clearTimeout(userPopupTimer);
    userPopupTimer = null;
  }
  if (els.userInfoPopup) els.userInfoPopup.style.display = 'none';
}

function toggleSponsorModal(visible) {
  if (!els.sponsorModal) return;
  if (visible) {
    els.sponsorModal.removeAttribute('inert');
    els.sponsorModal.classList.add('is-visible');
    document.body.classList.add('modal-open');
    els.sponsorModalClose?.focus();
  } else {
    els.sponsorModal.classList.remove('is-visible');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
      if (!els.sponsorModal?.classList.contains('is-visible')) {
        els.sponsorModal?.setAttribute('inert', '');
      }
    }, 250);
    els.sponsorBtn?.focus();
  }
}

function handleSponsorHoverEnter() {
  clearSponsorHoverTimer();
  if (!canShowSponsorHoverToday()) return;
  sponsorHoverTimer = setTimeout(() => {
    if (!canShowSponsorHoverToday()) return;
    incrementSponsorHoverCount();
    toggleSponsorModal(true);
  }, 120);
}

function handleSponsorHoverLeave() {
  clearSponsorHoverTimer();
  sponsorHoverTimer = setTimeout(() => {
    toggleSponsorModal(false);
  }, 180);
}

function clearSponsorHoverTimer() {
  if (sponsorHoverTimer) {
    clearTimeout(sponsorHoverTimer);
    sponsorHoverTimer = null;
  }
}

function getSponsorHoverKey() {
  const d = new Date();
  return `sponsor_hover_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function getSponsorHoverCountToday() {
  try {
    const value = localStorage.getItem(getSponsorHoverKey());
    return value ? parseInt(value, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function canShowSponsorHoverToday() {
  return getSponsorHoverCountToday() < MAX_SPONSOR_HOVER_SHOWS_PER_DAY;
}

function incrementSponsorHoverCount() {
  try {
    const key = getSponsorHoverKey();
    localStorage.setItem(key, String(getSponsorHoverCountToday() + 1));

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storedKey = localStorage.key(i);
      if (storedKey?.startsWith('sponsor_hover_') && storedKey !== key) {
        localStorage.removeItem(storedKey);
      }
    }
  } catch {
    // Ignore storage failures; click-to-open still works.
  }
}

async function handleLogout() {
  els.logoutBtn.disabled = true;
  try {
    const resp = await sendMessage(ACTIONS.LOGOUT);
    if (resp?.error) throw new Error(resp.error);
    treeData = null;
    paused = false;
    updateLoginUser(null);
    showView('login');
    showStatus(msg('taskCleared'), 'success');
  } catch (err) {
    showStatus(msg('logoutFailed', err.message || err), 'error');
  } finally {
    els.logoutBtn.disabled = false;
  }
}

// --- Notebooks ---

async function loadNotebooks() {
  showView('loading');
  try {
    const resp = await Promise.race([
      sendMessage(ACTIONS.LOAD_NOTEBOOKS),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000)),
    ]);
    if (!resp || !resp.tree) {
      throw new Error(resp?.error || 'No response');
    }
    treeData = resp.tree;
    updateLoginUser(resp.userInfo?.isLoggedIn ? resp.userInfo : {
      isLoggedIn: true,
      login: msg('loggedIn'),
      userName: msg('youdaoUser'),
    });
    renderTree(resp.tree);
    updateFileInfo(resp.tree);
    showView('tree');
  } catch (err) {
    updateLoginUser(null);
    showView('login');
    const tip = document.getElementById('permission-tip');
    if (tip) tip.style.display = 'block';
  }
}

function renderTree(node) {
  els.notebookTree.innerHTML = '';
  if (!node || !node.children?.length) {
    els.notebookTree.innerHTML = `<div class="log-placeholder"><p>${escapeHtml(msg('noNotebooks'))}</p></div>`;
    return;
  }

  for (const child of node.children) {
    els.notebookTree.appendChild(createTreeNode(child, 0));
  }
  updateSelectionCount();
}

function createTreeNode(node, depth) {
  const div = document.createElement('div');
  div.className = 'tree-node';

  const content = document.createElement('div');
  content.className = 'tree-node-content';
  content.style.paddingLeft = `${depth * 4}px`;

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle expanded';
  toggle.textContent = '\u25B6';
  if (!node.isDir) toggle.style.visibility = 'hidden';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.dataset.nodeId = node.id;

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = node.isDir ? '\uD83D\uDCC1' : '\uD83D\uDCC4';

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;

  content.appendChild(toggle);
  content.appendChild(cb);
  content.appendChild(icon);
  content.appendChild(label);

  if (node.isDir && node.noteCount > 0) {
    const count = document.createElement('span');
    count.className = 'tree-count';
    count.textContent = node.noteCount;
    content.appendChild(count);
  }

  div.appendChild(content);

  if (node.isDir && node.children?.length) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    for (const child of node.children) {
      childContainer.appendChild(createTreeNode(child, depth + 1));
    }
    div.appendChild(childContainer);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle.classList.toggle('expanded');
      childContainer.classList.toggle('collapsed');
    });

    cb.addEventListener('change', () => {
      childContainer.querySelectorAll('input[type="checkbox"]').forEach(childCb => {
        childCb.checked = cb.checked;
      });
      updateSelectionCount();
    });
  } else {
    cb.addEventListener('change', () => updateSelectionCount());
  }

  return div;
}

function updateSelectionCount() {
  const checked = els.notebookTree.querySelectorAll('input[type="checkbox"]:checked');
  if (els.selectedCount) els.selectedCount.textContent = checked.length;
}

function updateFileInfo(tree) {
  if (!tree) return;
  let notes = 0, folders = 0;
  function count(node) {
    if (node.isDir) { folders++; (node.children || []).forEach(count); }
    else notes++;
  }
  (tree.children || []).forEach(count);
  if (els.totalNotes) els.totalNotes.textContent = notes;
  if (els.folderCount) els.folderCount.textContent = folders;
  if (els.fileInfo) els.fileInfo.style.display = 'flex';
}

// --- Export ---

async function handleStartExport() {
  const checkboxes = els.notebookTree.querySelectorAll('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.nodeId).filter(Boolean);

  if (selectedIds.length === 0) return;

  showView('progress');
  paused = false;
  completeCelebrated = false;
  updateProgress({ current: 0, total: selectedIds.length, currentNote: '' });

  const resp = await sendMessage(ACTIONS.START_EXPORT, { selectedIds });
  if (resp?.error) {
    showView('login');
  }
}

function handlePauseResume() {
  if (paused) {
    sendMessage(ACTIONS.RESUME_EXPORT);
    paused = false;
  } else {
    sendMessage(ACTIONS.PAUSE_EXPORT);
    paused = true;
  }
}

function updateProgress(state) {
  const percent = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
  if (els.progressBar) els.progressBar.style.width = `${percent}%`;
  if (els.progressText) els.progressText.textContent = `${percent}%`;
  if (els.progressInfo) els.progressInfo.textContent = msg('noteCount', String(state.current), String(state.total));
  if (els.progressPhase) els.progressPhase.textContent = getProgressPhaseLabel(state.phase);
  if (els.progressCurrent) els.progressCurrent.textContent = state.currentNote ? state.currentNote : msg('waitingToStart');
}

function getProgressPhaseLabel(phase) {
  switch (phase) {
    case EXPORT_PHASE.PAUSED:
      return msg('paused');
    case EXPORT_PHASE.ZIPPING:
      return msg('zipping');
    case EXPORT_PHASE.ERROR:
      return msg('exportErrorPhase');
    default:
      return msg('exporting');
  }
}

function updateComplete(state) {
  if (els.statSuccess) els.statSuccess.textContent = msg('successCount', String(state.successCount));
  if (els.statFailed) els.statFailed.textContent = msg('failedCount', String(state.failedCount));
  if (els.statSkipped) els.statSkipped.textContent = msg('skippedCount', String(state.skippedCount || 0));

  if (state.failedCount > 0) {
    els.btnViewErrors?.classList.remove('hidden');
    renderErrors(state.errors || []);
  } else {
    els.btnViewErrors?.classList.add('hidden');
  }
}

function renderErrors(errors) {
  if (!els.errorList) return;
  els.errorList.innerHTML = '';
  for (const err of errors) {
    const item = document.createElement('div');
    item.className = 'error-item';
    item.innerHTML = `
      <div class="error-item-name">${escapeHtml(err.name)}</div>
      <div class="error-item-msg">${escapeHtml(err.error)}</div>
    `;
    els.errorList.appendChild(item);
  }
}

function showConfetti() {
  const colors = ['#8b5cf6', '#a78bfa', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = `${6 + Math.random() * 6}px`;
    piece.style.height = `${6 + Math.random() * 6}px`;
    piece.style.animationDelay = `${Math.random() * 1.5}s`;
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 5000);
}

// --- Helpers ---

async function sendMessage(action, data = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ action, data });
      if (response !== undefined) return response;
    } catch (e) {
      console.warn(`sendMessage(${action}) attempt ${attempt + 1} failed:`, e);
    }
    // Service worker may need time to wake up
    await new Promise(r => setTimeout(r, 300));
  }
  return undefined;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showStatus(text, type = '') {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.className = `status status-toast ${type}`.trim();
  els.status.style.display = 'block';
  requestAnimationFrame(() => els.status.classList.add('is-visible'));
  setTimeout(() => {
    els.status?.classList.remove('is-visible');
    setTimeout(() => {
      if (els.status) els.status.style.display = 'none';
    }, 300);
  }, 2200);
}
