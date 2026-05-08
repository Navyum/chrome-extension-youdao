document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  applyVersion();
  bindNavigation();
});

function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage?.() || document.documentElement.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
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

function applyVersion() {
  const version = chrome.runtime.getManifest().version;
  document.querySelectorAll('[data-version]').forEach(el => {
    el.textContent = `v${version}`;
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(section)?.classList.add('active');
    });
  });
}
