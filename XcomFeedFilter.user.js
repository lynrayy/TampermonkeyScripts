// ==UserScript==
// @name         X.com Feed Filter
// @namespace    https://github.com/local/x-feed-filter
// @version      1.2.1
// @updateURL    https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/master/XcomFeedFilter.user.js
// @downloadURL  https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/master/XcomFeedFilter.user.js
// @description  Filters X (Twitter) feed posts by recency and hides posts from verified users
// @author       Lynrayy
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '1.2.1';
    const STORAGE_KEY = 'x-feed-filter-settings-v1';

    const RECENCY_UNITS = {
        seconds: 1,
        minutes: 60,
        hours: 3600,
        days: 86400,
        weeks: 604800,
        months: 2592000,
        years: 31536000,
    };

    const RECENCY_UNIT_LABELS = [
        ['seconds', 'секунд'],
        ['minutes', 'минут'],
        ['hours', 'часов'],
        ['days', 'дней'],
        ['weeks', 'недель'],
        ['months', 'месяцев'],
        ['years', 'лет'],
    ];

    const DEFAULT_SETTINGS = {
        recencyEnabled: false,
        hideVerified: false,
        hideVerifiedReplies: false,
        hideVerifiedUseDB: false,
        hideVerifiedNotInterested: false,
        hidePremium: false,
        hideWhatsHappening: false,
        hideWhoToFollow: false,
        nameFilterEnabled: false,
        nameFilterNotInterested: false,
        nameFilterIncludeReplies: false,
        nameFilterKeywords: '',
        tab: 'recency',
        recencyMinValue: 0,
        recencyMinUnit: 'months',
        recencyMaxValue: 0,
        recencyMaxUnit: 'months',
        panelOpen: false,
        dbUsers: [],
    };

  let settings = loadSettings();
  let scanTimer = 0;
  let scanDebounceTimer = 0;
  const SCAN_DEBOUNCE_MS = 200;
  let observer = null;
  let ui = null;
  let isDestroyed = false;

  boot();

  function destroy() {
    isDestroyed = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.clearTimeout(scanTimer);
    window.clearTimeout(scanDebounceTimer);
    window.removeEventListener('yt-navigate-finish', scheduleScan, true);
    window.removeEventListener('load', scheduleScan, true);
    if (ui && ui.host) {
      ui.host.remove();
      ui = null;
    }
  }

  window.addEventListener('beforeunload', destroy, { once: true });
  window.addEventListener('unload', destroy, { once: true });

  function boot() {
    try {
      addDocumentStyles();
    } catch (error) {
      console.warn('[X Feed Filter] Could not install hiding styles.', error);
    }

    try {
      createUi();
    } catch (error) {
      console.error('[X Feed Filter] Could not create UI.', error);
    }

    registerMenuCommand();
    startObserver();
    scheduleScan();

    window.addEventListener('load', scheduleScan, true);
  }

  function loadSettings() {
    const saved = safeGetValue(STORAGE_KEY, null);
    console.log('[X Filter] loadSettings saved:', saved);
    if (!saved || typeof saved !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
    console.log('[X Filter] loadSettings normalized:', normalized);
    return normalized;
  }

  function normalizeSettings(value) {
    return {
      recencyEnabled: Boolean(value.recencyEnabled),
      hideVerified: Boolean(value.hideVerified),
      hideVerifiedReplies: Boolean(value.hideVerifiedReplies),
      hideVerifiedUseDB: Boolean(value.hideVerifiedUseDB),
      hideVerifiedNotInterested: Boolean(value.hideVerifiedNotInterested),
      hidePremium: Boolean(value.hidePremium),
      hideWhatsHappening: Boolean(value.hideWhatsHappening),
      hideWhoToFollow: Boolean(value.hideWhoToFollow),
      nameFilterEnabled: Boolean(value.nameFilterEnabled),
      nameFilterNotInterested: Boolean(value.nameFilterNotInterested),
      nameFilterIncludeReplies: Boolean(value.nameFilterIncludeReplies),
      nameFilterKeywords: typeof value.nameFilterKeywords === 'string' ? value.nameFilterKeywords : '',
      tab: ['recency', 'other', 'irritants', 'db'].includes(value.tab) ? value.tab : 'recency',
      recencyMinValue: Math.max(0, toNumber(value.recencyMinValue, 0)),
      recencyMinUnit: RECENCY_UNITS[value.recencyMinUnit] ? value.recencyMinUnit : 'months',
      recencyMaxValue: Math.max(0, toNumber(value.recencyMaxValue, 0)),
      recencyMaxUnit: RECENCY_UNITS[value.recencyMaxUnit] ? value.recencyMaxUnit : 'months',
      panelOpen: Boolean(value.panelOpen),
      dbUsers: Array.isArray(value.dbUsers) ? value.dbUsers : [],
    };
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function saveSettings() {
    settings = normalizeSettings(settings);
    safeSetValue(STORAGE_KEY, settings);
  }

  function safeGetValue(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        const result = GM_getValue(key, fallback);
        return result;
      }
    } catch (error) {
      console.warn('[X Feed Filter] Could not read Tampermonkey storage.', error);
    }

    try {
      const raw = window.localStorage.getItem(key);
      const result = raw ? JSON.parse(raw) : fallback;
      return result;
    } catch (error) {
      console.warn('[X Feed Filter] Could not read localStorage.', error);
      return fallback;
    }
  }

  function safeSetValue(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn('[X Feed Filter] Could not write Tampermonkey storage.', error);
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[X Feed Filter] Could not write localStorage.', error);
    }
  }

  function addDocumentStyles() {
    const css = `
      [data-xff-hidden="true"] {
        display: none !important;
      }
    `;

    try {
      if (typeof GM_addStyle === 'function') {
        GM_addStyle(css);
        return;
      }
    } catch (error) {
      console.warn('[X Feed Filter] GM_addStyle failed, using a regular style tag.', error);
    }

    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function isHomePage() {
    const path = window.location.pathname;
    return path === '/home' || path === '';
  }

  function scheduleScan() {
    if (isDestroyed) return;
    if (!isHomePage()) {
      return;
    }
    window.clearTimeout(scanTimer);
    window.clearTimeout(scanDebounceTimer);
    scanDebounceTimer = window.setTimeout(() => {
      if (!isDestroyed) {
        scanTimer = window.setTimeout(scanPage, 100);
      }
    }, SCAN_DEBOUNCE_MS);
  }

  function createUi() {
    if (document.getElementById('xff-root')) {
      return;
    }

    if (!document.body) {
      window.setTimeout(createUi, 100);
      return;
    }

    const host = makeElement('div');
    host.id = 'xff-root';

    const button = makeButton('xff-fab', 'XF', 'Фильтр X');
    button.setAttribute('aria-expanded', 'false');

    const panel = makeElement('section', 'xff-panel');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Фильтр X');

    const topRow = makeElement('div', 'xff-top-row');
    const title = makeElement('div', 'xff-title', 'Фильтр X');
    const version = makeElement('span', 'xff-version', `v${SCRIPT_VERSION}`);
    title.appendChild(version);
    const close = makeButton('xff-close', '×', 'Закрыть');
    close.setAttribute('aria-label', 'Закрыть');
    topRow.append(title, close);

    const tabBar = makeElement('div', 'xff-tabs');
    const tabRecency = makeButton('xff-tab xff-tab-recency', 'Новизна');
    const tabOther = makeButton('xff-tab xff-tab-other', 'Посты');
    const tabIrritants = makeButton('xff-tab xff-tab-irritants', 'Раздражители');
    const tabDb = makeButton('xff-tab xff-tab-db', 'БД');
    tabBar.append(tabRecency, tabOther, tabIrritants, tabDb);

    const recencyTab = makeElement('div', 'xff-tab-panel xff-recency-tab');
    const otherTab = makeElement('div', 'xff-tab-panel xff-other-tab');
    const irritantsTab = makeElement('div', 'xff-tab-panel xff-irritants-tab');
    const dbTab = makeElement('div', 'xff-tab-panel xff-db-tab');
    otherTab.hidden = true;
    irritantsTab.hidden = true;
    dbTab.hidden = true;

    const recencySwitch = makeElement('label', 'xff-switch');
    const recencyEnabled = makeElement('input', 'xff-recency-enabled');
    recencyEnabled.type = 'checkbox';
    recencySwitch.append(recencyEnabled, makeElement('span', '', 'Фильтр новизны'));

    const recencyMinField = makeRecencyField('От', 'xff-recency-min-input', 'xff-recency-min-unit');
    const recencyMaxField = makeRecencyField('До', 'xff-recency-max-input', 'xff-recency-max-unit');

    recencyTab.append(recencySwitch, recencyMinField.label, recencyMaxField.label);

    const presetRow = makeElement('div', 'xff-preset-row');
    const presetSelect = makeElement('select', 'xff-preset-select');
    const presetPlaceholder = makeElement('option');
    presetPlaceholder.value = '';
    presetPlaceholder.textContent = 'Пресет…';
    presetSelect.append(presetPlaceholder);
    addPresetOption(presetSelect, 'Сегодня', 0, 1, 'seconds', 'days');
    addPresetOption(presetSelect, 'Эта неделя', 0, 7, 'seconds', 'days');
    addPresetOption(presetSelect, 'Этот месяц', 0, 1, 'seconds', 'months');
    recencyTab.append(presetRow);
    presetRow.append(presetSelect);

    const hideVerifiedSwitch = makeElement('label', 'xff-switch xff-switch-parent');
    const hideVerified = makeElement('input', 'xff-hide-verified');
    hideVerified.type = 'checkbox';
    hideVerifiedSwitch.append(hideVerified, makeElement('span', '', 'Скрывать посты от галочников'));

    const hideVerifiedRepliesSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const hideVerifiedReplies = makeElement('input', 'xff-hide-verified-replies');
    hideVerifiedReplies.type = 'checkbox';
    hideVerifiedRepliesSwitch.append(hideVerifiedReplies, makeElement('span', '', 'Также скрывать ответы на их посты'));

    const hideVerifiedNotInterestedSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const hideVerifiedNotInterested = makeElement('input', 'xff-hide-verified-not-interested');
    hideVerifiedNotInterested.type = 'checkbox';
    hideVerifiedNotInterestedSwitch.append(hideVerifiedNotInterested, makeElement('span', '', 'Прожимать "Не интересно"'));

    const hideVerifiedUseDBSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const hideVerifiedUseDB = makeElement('input', 'xff-hide-verified-use-db');
    hideVerifiedUseDB.type = 'checkbox';
    hideVerifiedUseDBSwitch.append(hideVerifiedUseDB, makeElement('span', '', 'Использовать БД'));

    const hidePremiumSwitch = makeElement('label', 'xff-switch');
    const hidePremium = makeElement('input', 'xff-hide-premium');
    hidePremium.type = 'checkbox';
    hidePremiumSwitch.append(hidePremium, makeElement('span', '', 'Скрыть рекламу Premium'));

    const hideWhatsHappeningSwitch = makeElement('label', 'xff-switch');
    const hideWhatsHappening = makeElement('input', 'xff-hide-whats-happening');
    hideWhatsHappening.type = 'checkbox';
    hideWhatsHappeningSwitch.append(hideWhatsHappening, makeElement('span', '', 'Скрыть Что происходит'));

    const hideWhoToFollowSwitch = makeElement('label', 'xff-switch');
    const hideWhoToFollow = makeElement('input', 'xff-hide-who-to-follow');
    hideWhoToFollow.type = 'checkbox';
    hideWhoToFollowSwitch.append(hideWhoToFollow, makeElement('span', '', 'Скрыть Кого читать'));

    const nameFilterSwitch = makeElement('label', 'xff-switch');
    const nameFilterEnabled = makeElement('input', 'xff-name-filter-enabled');
    nameFilterEnabled.type = 'checkbox';
    nameFilterSwitch.append(nameFilterEnabled, makeElement('span', '', 'Фильтр имён'));

    const nameFilterKeywordsField = makeElement('label', 'xff-name-filter-field');
    const nameFilterKeywordsCaption = makeElement('span', '', 'Запрещённые слова (через запятую)');
    const nameFilterKeywordsInput = makeElement('input', 'xff-name-filter-keywords');
    nameFilterKeywordsInput.type = 'text';
    nameFilterKeywordsInput.placeholder = 'слово, фраза, эмодзи';
    nameFilterKeywordsInput.autocomplete = 'off';
    nameFilterKeywordsInput.spellcheck = false;
    nameFilterKeywordsField.append(nameFilterKeywordsCaption, nameFilterKeywordsInput);

    const nameFilterNotInterestedSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const nameFilterNotInterested = makeElement('input', 'xff-name-filter-not-interested');
    nameFilterNotInterested.type = 'checkbox';
    nameFilterNotInterestedSwitch.append(nameFilterNotInterested, makeElement('span', '', 'Прожимать "Не интересно"'));

    const nameFilterIncludeRepliesSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const nameFilterIncludeReplies = makeElement('input', 'xff-name-filter-include-replies');
    nameFilterIncludeReplies.type = 'checkbox';
    nameFilterIncludeRepliesSwitch.append(nameFilterIncludeReplies, makeElement('span', '', 'Также учитывать ответы'));

    otherTab.append(hideVerifiedSwitch, hideVerifiedRepliesSwitch, hideVerifiedNotInterestedSwitch, hideVerifiedUseDBSwitch, nameFilterSwitch, nameFilterKeywordsField, nameFilterNotInterestedSwitch, nameFilterIncludeRepliesSwitch);
    irritantsTab.append(hidePremiumSwitch, hideWhatsHappeningSwitch, hideWhoToFollowSwitch);

    const status = makeElement('div', 'xff-status');

    const dbClearBtn = makeButton('xff-db-clear', 'Очистить базу');
    const dbTable = makeElement('table', 'xff-db-table');
    const dbThead = makeElement('thead');
    const dbTrHead = makeElement('tr');
    const dbThNick = makeElement('th', 'xff-db-th-nick', 'Ник');
    const dbThAction = makeElement('th', 'xff-db-th-action', 'Действие');
    const dbTbody = makeElement('tbody', 'xff-db-tbody');
    dbTrHead.append(dbThNick, dbThAction);
    dbThead.append(dbTrHead);
    dbTable.append(dbThead, dbTbody);

    dbTab.append(dbClearBtn, dbTable);

    panel.append(topRow, tabBar, recencyTab, otherTab, irritantsTab, dbTab, status);
    host.append(button, panel);
    applyBaseUiStyles(host, button, panel);
    document.body.appendChild(host);

    try {
      addUiStyles();
    } catch (error) {
      console.warn('[X Feed Filter] Could not install UI styles.', error);
    }

    ui = {
      host,
      button,
      panel,
      close,
      tabRecency,
      tabOther,
      tabIrritants,
      tabDb,
      recencyTab,
      otherTab,
      irritantsTab,
      dbTab,
      recencyEnabled,
      hideVerified,
      hideVerifiedReplies,
      hideVerifiedNotInterested,
      hideVerifiedUseDB,
      hidePremium,
      hideWhatsHappening,
      hideWhoToFollow,
      nameFilterEnabled,
      nameFilterKeywordsInput,
      nameFilterNotInterested,
      nameFilterIncludeReplies,
      recencyMinInput: recencyMinField.input,
      recencyMinUnit: recencyMinField.select,
      recencyMaxInput: recencyMaxField.input,
      recencyMaxUnit: recencyMaxField.select,
      status,
      presetSelect,
      dbClearBtn,
      dbTbody,
    };

    ui.button.addEventListener('click', () => setPanelOpen(!settings.panelOpen));
    ui.close.addEventListener('click', () => setPanelOpen(false));
    ui.tabRecency.addEventListener('click', () => setTab('recency'));
    ui.tabOther.addEventListener('click', () => setTab('other'));
    ui.tabIrritants.addEventListener('click', () => setTab('irritants'));
    ui.tabDb.addEventListener('click', () => setTab('db'));

    ui.dbClearBtn.addEventListener('click', () => {
      settings.dbUsers = [];
      saveSettings();
      renderDbTable();
    });

    ui.recencyEnabled.addEventListener('change', () => {
      settings.recencyEnabled = ui.recencyEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideVerified.addEventListener('change', () => {
      settings.hideVerified = ui.hideVerified.checked;
      ui.hideVerifiedReplies.disabled = !ui.hideVerified.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideVerifiedReplies.addEventListener('change', () => {
      settings.hideVerifiedReplies = ui.hideVerifiedReplies.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideVerifiedNotInterested.addEventListener('change', () => {
      settings.hideVerifiedNotInterested = ui.hideVerifiedNotInterested.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideVerifiedUseDB.addEventListener('change', () => {
      settings.hideVerifiedUseDB = ui.hideVerifiedUseDB.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hidePremium.addEventListener('change', () => {
      settings.hidePremium = ui.hidePremium.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideWhatsHappening.addEventListener('change', () => {
      settings.hideWhatsHappening = ui.hideWhatsHappening.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideWhoToFollow.addEventListener('change', () => {
      settings.hideWhoToFollow = ui.hideWhoToFollow.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.nameFilterEnabled.addEventListener('change', () => {
      settings.nameFilterEnabled = ui.nameFilterEnabled.checked;
      ui.nameFilterNotInterested.disabled = !ui.nameFilterEnabled.checked;
      ui.nameFilterIncludeReplies.disabled = !ui.nameFilterEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.nameFilterNotInterested.addEventListener('change', () => {
      settings.nameFilterNotInterested = ui.nameFilterNotInterested.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.nameFilterIncludeReplies.addEventListener('change', () => {
      settings.nameFilterIncludeReplies = ui.nameFilterIncludeReplies.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.nameFilterKeywordsInput.addEventListener('input', () => {
      settings.nameFilterKeywords = ui.nameFilterKeywordsInput.value;
      saveSettings();
      scheduleScan();
    });

    ui.recencyMinInput.addEventListener('input', () => updateRecency('min'));
    ui.recencyMinUnit.addEventListener('change', () => updateRecency('min'));
    ui.recencyMaxInput.addEventListener('input', () => updateRecency('max'));
    ui.recencyMaxUnit.addEventListener('change', () => updateRecency('max'));
    ui.recencyMinInput.addEventListener('keydown', blurOnEnter);
    ui.recencyMaxInput.addEventListener('keydown', blurOnEnter);

    ui.presetSelect.addEventListener('change', () => {
      const value = ui.presetSelect.value;
      if (!value) {
        return;
      }
      const parts = value.split('-');
      const minSeconds = Number.parseInt(parts[0], 10);
      const maxSeconds = Number.parseInt(parts[1], 10);
      const minUnit = parts[2] || 'seconds';
      const maxUnit = parts[3] || 'seconds';
      if (Number.isFinite(minSeconds) && Number.isFinite(maxSeconds)) {
        setRecencyRange(minSeconds, maxSeconds, minUnit, maxUnit);
      }
      ui.presetSelect.value = '';
    });

    renderUi();
    setupFullscreenHandling();
  }

  function applyBaseUiStyles(host, button, panel) {
    host.style.position = 'fixed';
    host.style.right = '82px';
    host.style.bottom = '18px';
    host.style.zIndex = '2147483647';
    host.style.display = 'block';
    host.style.pointerEvents = 'none';

    button.style.width = '54px';
    button.style.height = '42px';
    button.style.border = '1px solid #df7b73';
    button.style.borderRadius = '8px';
    button.style.background = '#000000';
    button.style.color = '#ffffff';
    button.style.fontWeight = '800';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';

    panel.style.pointerEvents = 'auto';
  }

  function addUiStyles() {
    if (document.getElementById('xff-ui-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'xff-ui-style';
    style.textContent = `
      #xff-root {
        --xff-bg: #ffffff;
        --xff-text: #1f2328;
        --xff-muted: #5f6368;
        --xff-border: #d7dce2;
        --xff-accent: #000000;
        --xff-accent-border: #333333;
        --xff-accent-soft: #f0f0f0;
        --xff-hover-border: #555555;
        --xff-input-bg: #f8fafc;
        --xff-track: #dfe3e8;
        --xff-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
        position: fixed !important;
        right: 82px !important;
        bottom: 18px !important;
        z-index: 2147483647 !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        color: var(--xff-text) !important;
        color-scheme: light dark;
        font-family: Inter, Roboto, Arial, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        letter-spacing: 0 !important;
        pointer-events: none !important;
      }

      @media (prefers-color-scheme: dark) {
        #xff-root {
          --xff-bg: #000000;
          --xff-text: #ffffff;
          --xff-muted: #8899a6;
          --xff-border: #2f3336;
          --xff-accent-border: #4d4d4d;
          --xff-accent-soft: #1a1a1a;
          --xff-hover-border: #7a7a7a;
          --xff-input-bg: #16181c;
          --xff-track: #384149;
        }
      }

      #xff-root,
      #xff-root * {
        box-sizing: border-box !important;
      }

      #xff-root button,
      #xff-root input,
      #xff-root select {
        font: inherit !important;
      }

      #xff-root .xff-fab,
      #xff-root .xff-panel {
        pointer-events: auto !important;
      }

      #xff-root .xff-fab {
        width: 54px !important;
        height: 42px !important;
        border: 1px solid var(--xff-accent-border) !important;
        border-radius: 8px !important;
        background: var(--xff-accent) !important;
        color: #ffffff !important;
        padding: 0 !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
        text-align: center !important;
        line-height: 42px !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #xff-root .xff-fab:hover {
        filter: brightness(1.05);
      }

      #xff-root .xff-panel {
        position: absolute !important;
        right: 0 !important;
        bottom: 52px !important;
        width: min(340px, calc(100vw - 28px)) !important;
        max-height: 80vh !important;
        overflow-y: auto !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 8px !important;
        background: var(--xff-bg) !important;
        color: var(--xff-text) !important;
        box-shadow: var(--xff-shadow) !important;
        padding: 14px !important;
      }

      #xff-root .xff-panel[hidden] {
        display: none !important;
      }

      #xff-root .xff-top-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
      }

      #xff-root .xff-title {
        color: var(--xff-text) !important;
        font-size: 15px !important;
        font-weight: 800 !important;
        line-height: 1.2 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      #xff-root .xff-version {
        color: var(--xff-muted) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        opacity: 0.7 !important;
      }

      #xff-root .xff-close {
        width: 30px !important;
        height: 30px !important;
        border: 1px solid transparent !important;
        border-radius: 6px !important;
        background: transparent !important;
        color: var(--xff-muted) !important;
        padding: 0 !important;
        cursor: pointer !important;
        font-size: 20px !important;
        line-height: 1 !important;
      }

      #xff-root .xff-close:hover {
        border-color: var(--xff-border) !important;
        color: var(--xff-text) !important;
      }

      #xff-root .xff-tabs {
        display: flex !important;
        gap: 6px !important;
        margin-top: 12px !important;
      }

      #xff-root .xff-tab {
        flex: 1 !important;
        min-height: 34px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 7px !important;
        background: transparent !important;
        color: var(--xff-text) !important;
        padding: 6px 9px !important;
        font-size: 13px !important;
        font-weight: 750 !important;
        text-align: center !important;
        justify-content: center !important;
        display: flex !important;
        align-items: center !important;
        cursor: pointer !important;
        text-transform: none !important;
      }

      #xff-root .xff-tab:hover {
        border-color: var(--xff-hover-border) !important;
      }

      #xff-root .xff-tab[aria-selected="true"] {
        border-color: var(--xff-accent-border) !important;
        background: var(--xff-accent-soft) !important;
        color: var(--xff-accent) !important;
      }

      #xff-root .xff-tab-panel[hidden] {
        display: none !important;
      }

      #xff-root .xff-switch {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
        margin-top: 12px !important;
        color: var(--xff-text) !important;
        font-size: 13px !important;
        font-weight: 650 !important;
        cursor: pointer !important;
      }

      #xff-root .xff-switch input {
        width: 18px !important;
        height: 18px !important;
        margin: 0 !important;
        accent-color: var(--xff-accent);
        cursor: pointer !important;
      }

      #xff-root .xff-switch-child {
        margin-left: 24px !important;
      }

      #xff-root .xff-switch-child input:disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }

      #xff-root .xff-switch-child input:disabled + span {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }

      #xff-root .xff-recency-field {
        display: grid !important;
        gap: 5px !important;
        margin-top: 12px !important;
        color: var(--xff-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #xff-root .xff-recency-controls {
        display: flex !important;
        gap: 8px !important;
      }

      #xff-root .xff-recency-controls input {
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: var(--xff-text) !important;
        padding: 8px 9px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        outline: none !important;
      }

      #xff-root .xff-recency-controls input:focus {
        border-color: var(--xff-accent) !important;
        box-shadow: 0 0 0 3px var(--xff-accent-soft) !important;
      }

      #xff-root .xff-recency-controls select {
        flex: 0 0 auto !important;
        min-height: 36px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: var(--xff-text) !important;
        padding: 8px 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        outline: none !important;
      }

      #xff-root .xff-recency-controls select:focus {
        border-color: var(--xff-accent) !important;
        box-shadow: 0 0 0 3px var(--xff-accent-soft) !important;
      }

      #xff-root .xff-status {
        margin-top: 12px !important;
        color: var(--xff-muted) !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
      }

      #xff-root .xff-name-filter-field {
        display: grid !important;
        gap: 5px !important;
        margin-top: 12px !important;
        color: var(--xff-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #xff-root .xff-name-filter-field input {
        width: 100% !important;
        min-width: 0 !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: var(--xff-text) !important;
        padding: 8px 9px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        outline: none !important;
      }

      #xff-root .xff-name-filter-field input:focus {
        border-color: var(--xff-accent) !important;
        box-shadow: 0 0 0 3px var(--xff-accent-soft) !important;
      }

      #xff-root .xff-preset-row {
        display: flex !important;
        align-items: stretch !important;
        gap: 10px !important;
        margin-top: 12px !important;
      }

      #xff-root .xff-preset-select {
        flex: 1 !important;
        min-width: 0 !important;
        min-height: 32px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: var(--xff-text) !important;
        padding: 6px 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        outline: none !important;
      }

      #xff-root .xff-preset-select:focus {
        border-color: var(--xff-accent) !important;
        box-shadow: 0 0 0 3px var(--xff-accent-soft) !important;
      }

      #xff-root .xff-db-table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-top: 12px !important;
      }

      #xff-root .xff-db-table th,
      #xff-root .xff-db-table td {
        border: 1px solid var(--xff-border) !important;
        padding: 6px 8px !important;
        text-align: left !important;
        font-size: 12px !important;
        color: var(--xff-text) !important;
        background: var(--xff-bg) !important;
      }

      #xff-root .xff-db-table th {
        font-weight: 700 !important;
        background: var(--xff-accent-soft) !important;
      }

      #xff-root .xff-db-clear {
        width: 100% !important;
        min-height: 32px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: var(--xff-text) !important;
        padding: 6px 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        margin-top: 12px !important;
        margin-bottom: 8px !important;
        outline: none !important;
      }

      #xff-root .xff-db-clear:hover {
        border-color: var(--xff-hover-border) !important;
      }

      #xff-root .xff-db-delete {
        width: 24px !important;
        height: 24px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 4px !important;
        background: transparent !important;
        color: var(--xff-muted) !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        outline: none !important;
        padding: 0 !important;
      }

      #xff-root .xff-db-delete:hover {
        color: #ff4444 !important;
        border-color: #ff4444 !important;
      }

      @media (max-width: 520px) {
        #xff-root {
          right: 74px !important;
          bottom: 10px !important;
        }

        #xff-root .xff-panel {
          width: calc(100vw - 20px) !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function makeElement(tagName, className = '', text = '') {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text) {
      element.textContent = text;
    }
    return element;
  }

  function makeButton(className, text, title = '') {
    const button = makeElement('button', className, text);
    button.type = 'button';
    if (title) {
      button.title = title;
    }
    return button;
  }

  function makeRecencyField(labelText, valueClassName, unitClassName) {
    const label = makeElement('label', 'xff-recency-field');
    const caption = makeElement('span', '', labelText);
    const controls = makeElement('div', 'xff-recency-controls');
    const input = makeElement('input', valueClassName);
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const select = makeElement('select', unitClassName);
    for (const [key, text] of RECENCY_UNIT_LABELS) {
      const option = makeElement('option');
      option.value = key;
      option.textContent = text;
      select.append(option);
    }
    controls.append(input, select);
    label.append(caption, controls);
    return { label, input, select };
  }

  function addPresetOption(select, text, minSeconds, maxSeconds, minUnit, maxUnit) {
    const option = makeElement('option');
    option.value = `${minSeconds}-${maxSeconds}-${minUnit}-${maxUnit}`;
    option.textContent = text;
    select.append(option);
  }

  function setRecencyRange(minSeconds, maxSeconds, minUnit, maxUnit) {
    settings.recencyMinValue = minSeconds;
    settings.recencyMinUnit = minUnit;
    settings.recencyMaxValue = maxSeconds;
    settings.recencyMaxUnit = maxUnit;
    saveSettings();
    renderUi();
    scheduleScan();
  }

  function registerMenuCommand() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }

    GM_registerMenuCommand('Открыть фильтр X', () => {
      setPanelOpen(true);
    });

    GM_registerMenuCommand('Вкл/выкл фильтр новизны', () => {
      settings.recencyEnabled = !settings.recencyEnabled;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание постов от галочников', () => {
      settings.hideVerified = !settings.hideVerified;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание ответов на посты галочников', () => {
      settings.hideVerifiedReplies = !settings.hideVerifiedReplies;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл прожимать "Не интересно" для постов от галочников', () => {
      settings.hideVerifiedNotInterested = !settings.hideVerifiedNotInterested;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл использовать БД для галочников', () => {
      settings.hideVerifiedUseDB = !settings.hideVerifiedUseDB;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание рекламы Premium', () => {
      settings.hidePremium = !settings.hidePremium;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание "Что происходит"', () => {
      settings.hideWhatsHappening = !settings.hideWhatsHappening;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание "Кого читать"', () => {
      settings.hideWhoToFollow = !settings.hideWhoToFollow;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл фильтр имён', () => {
      settings.nameFilterEnabled = !settings.nameFilterEnabled;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл прожимать "Не интересно"', () => {
      settings.nameFilterNotInterested = !settings.nameFilterNotInterested;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл учитывать ответы в фильтре имён', () => {
      settings.nameFilterIncludeReplies = !settings.nameFilterIncludeReplies;
      saveSettings();
      renderUi();
      scheduleScan();
    });
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) {
      window.setTimeout(startObserver, 250);
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      if (isDestroyed) return;
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches('article')) {
                shouldScan = true;
                break;
              }
              if (node.querySelector && node.querySelector('article')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }
      if (shouldScan) {
        scheduleScan();
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: false,
    });
  }

  function getPostWrapper(post) {
    let current = post;
    while (current && current.parentElement && current.parentElement.parentElement) {
      const parent = current.parentElement;
      const grandParent = parent.parentElement;
      let articleWrapperCount = 0;
      for (const child of grandParent.children) {
        if (child.querySelector('article')) {
          articleWrapperCount++;
        }
      }
      if (articleWrapperCount > 1) {
        return parent;
      }
      current = parent;
    }
    return post;
  }

  function scanPage() {
    if (!isHomePage()) {
      return;
    }
    if (isDestroyed) return;

    const posts = document.querySelectorAll('article');
    console.log('[X Filter] scanPage found', posts.length, 'posts');

    let hiddenCount = 0;
    let totalCount = 0;
    let notInterestedCount = 0;

    for (const post of posts) {
      totalCount++;
      let hide = false;

      if (settings.hideVerified && isVerifiedPost(post)) {
        if (!settings.hideVerifiedUseDB) {
          // Without DB: hide all verified posts
          if (settings.hideVerifiedNotInterested) {
            clickNotInterested(post);
            notInterestedCount++;
          } else {
            hide = true;
          }
        } else {
          // With DB: hide only authors with action "Фильтровать"
          const authorNicks = getVerifiedAuthorNick(post);
          let shouldHide = false;
          let dbChanged = false;

          for (const nick of authorNicks) {
            const dbEntry = settings.dbUsers.find((u) => u.nick === nick);
            if (!dbEntry) {
              settings.dbUsers.push({ nick, action: 'Не выбрано' });
              dbChanged = true;
              // Don't hide when new entry with default action
            } else if (dbEntry.action === 'Фильтровать') {
              shouldHide = true;
            }
          }

          if (dbChanged) {
            saveSettings();
          }

          if (shouldHide) {
            if (settings.hideVerifiedNotInterested) {
              clickNotInterested(post);
              notInterestedCount++;
            } else {
              hide = true;
            }
          }
        }
      }

      if (!hide && settings.nameFilterEnabled && isNameFiltered(post, settings.nameFilterIncludeReplies)) {
        if (settings.nameFilterNotInterested) {
          clickNotInterested(post);
          notInterestedCount++;
        } else {
          hide = true;
        }
      }

      if (!hide && settings.recencyEnabled) {
        const age = readPostAgeSeconds(post);
        if (age !== null) {
          const minAge = recencyToSeconds('min');
          const maxAge = recencyToSeconds('max');
          if (age < minAge || age > maxAge) {
            hide = true;
          }
        }
      }

      if (hide) {
        const wrapper = getPostWrapper(post);
        wrapper.setAttribute('data-xff-hidden', 'true');
        hiddenCount++;
      } else if (!settings.nameFilterNotInterested || !isNameFiltered(post, settings.nameFilterIncludeReplies)) {
        const wrapper = getPostWrapper(post);
        wrapper.removeAttribute('data-xff-hidden');
      }
    }

    updateStatus(hiddenCount, totalCount, notInterestedCount);

    hideIrritantElements();
  }

  function clickNotInterested(post) {
    if (post.getAttribute('data-xff-not-interested')) {
      return;
    }
    const moreBtn = post.querySelector('button[aria-label*="Ещё"], button[aria-label*="More"]');
    if (!moreBtn) {
      return;
    }
    moreBtn.click();
    post.setAttribute('data-xff-not-interested', 'true');
    window.setTimeout(() => {
      const menuItems = document.querySelectorAll('[role="menuitem"]');
      for (const mi of menuItems) {
        const text = (mi.textContent || '').toLowerCase();
        if (text.includes('не интересна') || text.includes('not interested')) {
          mi.click();
          break;
        }
      }
    }, 800);
  }

  function isVerifiedPost(post) {
    // Check for verified badge inside author name link (the post author is verified)
    const authorLinks = post.querySelectorAll('a[href^="/"]:not([href*="/status/"])');
    let verifiedInAuthor = false;
    for (const link of authorLinks) {
      if (link.querySelector(
        'img[alt*="Подлинная"], img[alt*="Verified"], img[alt*="verified"], img[alt*="вериф"], svg[aria-label*="Подлинная"], svg[aria-label*="Verified"], svg[aria-label*="verified"], svg[aria-label*="вериф"], [data-testid="icon-verified"]'
      )) {
        verifiedInAuthor = true;
        break;
      }
    }

    // Check for verified badge anywhere in the article (e.g. in reply context or quoted content)
    const verifiedAnywhere = post.querySelector(
      'img[alt*="Подлинная учетная запись"], img[alt*="Подлинная"], img[alt*="Verified"], img[alt*="verified"], img[alt*="вериф"], svg[aria-label*="Подлинная"], svg[aria-label*="Verified"], svg[aria-label*="verified"], svg[aria-label*="вериф"], [data-testid="icon-verified"]'
    );

    if (settings.hideVerifiedReplies) {
      return verifiedAnywhere !== null;
    }

    // Also check if we can find verified author nicks (handles badges not inside <a> tags, e.g. VRChat)
    const authorNicks = getVerifiedAuthorNick(post);
    if (authorNicks.length > 0) {
      return true;
    }

    return verifiedInAuthor;
  }

  function getVerifiedAuthorNick(post) {
    const verifiedElements = post.querySelectorAll(
      'img[alt*="Подлинная"], img[alt*="Verified"], img[alt*="verified"], img[alt*="вериф"], svg[aria-label*="Подлинная"], svg[aria-label*="Verified"], svg[aria-label*="verified"], svg[aria-label*="вериф"], [data-testid="icon-verified"]'
    );

    if (verifiedElements.length === 0) {
      return [];
    }

    const nicks = [];
    const seen = new Set();

    // 1. Extract from <a href="/username"> links
    const links = post.querySelectorAll('a[href^="/"]:not([href*="/status/"])');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const parts = href.split('/').filter((p) => p.length > 0);
        if (parts.length > 0) {
          const nick = parts[0];
          // Skip non-profile paths
          const skipPaths = ['i', 'hashtag', 'search', 'compose', 'settings', 'messages', 'notifications', 'home', 'explore', 'login', 'signup'];
          if (!skipPaths.includes(nick) && !seen.has(nick)) {
            seen.add(nick);
            nicks.push(nick);
          }
        }
      }
    }

    // 2. Extract @username from text content (e.g. "yue@yueko__·23 окт.")
    // This catches cases where <a> tag structure is different
    const textContent = post.textContent || '';
    const textRegex = /@([\w-]+)(?=[\s·•\-]|$)/g;
    let textMatch;
    while ((textMatch = textRegex.exec(textContent)) !== null) {
      const nick = textMatch[1];
      if (!seen.has(nick)) {
        seen.add(nick);
        nicks.push(nick);
      }
    }

    return nicks;
  }

  function isNameFiltered(post, includeReplies) {
    const keywords = (settings.nameFilterKeywords || '')
      .split(',')
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    if (!keywords.length) {
      return false;
    }

    const authorLinks = post.querySelectorAll('a[href^="/"]:not([href*="/status/"])');
    const linksToCheck = includeReplies 
      ? Array.from(authorLinks)
      : Array.from(authorLinks).filter((l) => l.textContent.trim().length > 0);
    for (const link of linksToCheck) {
      const name = (link.textContent || '').trim();
      const imgs = link.querySelectorAll('img');
      const altTexts = Array.from(imgs).map((img) => img.getAttribute('alt') || '').join(' ');
      const fullText = (name + ' ' + altTexts).trim();
      for (const keyword of keywords) {
        if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    if (includeReplies) {
      const postText = (post.textContent || '').trim();
      for (const keyword of keywords) {
        if (postText.toLowerCase().includes(keyword.toLowerCase())) {
          return true;
        }
      }

      const allImgs = post.querySelectorAll('img');
      for (const img of allImgs) {
        const alt = (img.getAttribute('alt') || '').trim();
        for (const keyword of keywords) {
          if (alt.toLowerCase().includes(keyword.toLowerCase())) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function readPostAgeSeconds(post) {
    const timeEl = post.querySelector('time');
    if (!timeEl) {
      return null;
    }
    const text = timeEl.textContent || timeEl.getAttribute('datetime') || '';
    return parseAgeText(text);
  }

  const RU_UNIT_ALIASES = {
    секунд: 'seconds', секунды: 'seconds', секунда: 'seconds', сек: 'seconds', с: 'seconds',
    минут: 'minutes', минуты: 'minutes', минута: 'minutes', мин: 'minutes', м: 'minutes',
    часов: 'hours', часа: 'hours', час: 'hours', ч: 'hours',
    дней: 'days', дня: 'days', день: 'days', дн: 'days', д: 'days',
    недель: 'weeks', недели: 'weeks', неделя: 'weeks', нед: 'weeks',
    месяцев: 'months', месяца: 'months', месяц: 'months', мес: 'months',
    лет: 'years', года: 'years', год: 'years', г: 'years',
  };

  const RU_MONTHS = {
    янв: 1, фев: 2, мар: 3, апр: 4, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
    января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8,
    сентября: 9, октября: 10, ноября: 11, декабря: 12,
  };

  function parseAgeText(text) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const lower = normalized.toLowerCase();

    // Relative: "только что", "just now", "сейчас"
    if (/только что|just now|сейчас/i.test(lower)) {
      return 0;
    }

    // "вчера" = 1 day ago
    if (/вчера|yesterday/i.test(lower)) {
      return 86400;
    }

    // Relative with number and unit: "1 ч", "2 часа назад", "30 мин", "5 сек назад"
    const unitKeys = Object.keys(RU_UNIT_ALIASES).sort((a, b) => b.length - a.length).join('|');
    const relRegex = new RegExp('(\\d+)\\s*(' + unitKeys + ')\\s*(назад|ago)?', 'ig');
    let lastMatch = null;
    let m;
    while ((m = relRegex.exec(normalized)) !== null) {
      lastMatch = m;
    }
    if (lastMatch) {
      const amount = Number.parseInt(lastMatch[1], 10);
      const unitKey = RU_UNIT_ALIASES[String(lastMatch[2]).toLowerCase()];
      if (Number.isFinite(amount) && unitKey && RECENCY_UNITS[unitKey]) {
        return amount * RECENCY_UNITS[unitKey];
      }
    }

    // Absolute date: "29 окт." or "29 окт. 2024 г."
    const ruDateMatch = normalized.match(/\b(\d{1,2})\s+([а-яА-ЯёЁ]+)\.?\s*(?:(\d{4})\s*г\.?)?/i);
    if (ruDateMatch) {
      const day = Number(ruDateMatch[1]);
      const monthKey = String(ruDateMatch[2]).toLowerCase().replace(/\.$/, '');
      const month = RU_MONTHS[monthKey];
      const yearMatch = ruDateMatch[3];
      const year = yearMatch ? Number(yearMatch) : new Date().getFullYear();
      if (month && day >= 1 && day <= 31) {
        const ts = Date.UTC(year, month - 1, day);
        if (!Number.isNaN(ts)) {
          const age = (Date.now() - ts) / 1000;
          if (age >= 0) {
            return age;
          }
        }
      }
    }

    // ISO datetime attribute fallback
    const isoMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const ts = Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      if (!Number.isNaN(ts)) {
        const age = (Date.now() - ts) / 1000;
        if (age >= 0) {
          return age;
        }
      }
    }

    return null;
  }

  function recencyToSeconds(kind) {
    if (kind === 'min') {
      const value = settings.recencyMinValue;
      if (!value || value < 0) {
        return 0;
      }
      return value * RECENCY_UNITS[settings.recencyMinUnit];
    }

    const value = settings.recencyMaxValue;
    if (!value || value <= 0) {
      return Infinity;
    }
    return value * RECENCY_UNITS[settings.recencyMaxUnit];
  }

  function updateRecency(kind) {
    const input = kind === 'min' ? ui.recencyMinInput : ui.recencyMaxInput;
    const unit = kind === 'min' ? ui.recencyMinUnit : ui.recencyMaxUnit;
    const value = input.value.trim() === '' ? 0 : Math.max(0, toNumber(input.value, 0));

    if (kind === 'min') {
      settings.recencyMinValue = value;
      settings.recencyMinUnit = unit.value;
    } else {
      settings.recencyMaxValue = value;
      settings.recencyMaxUnit = unit.value;
    }

    saveSettings();
    renderUi();
    scheduleScan();
  }

  function setTab(tab) {
    settings.tab = ['recency', 'other', 'irritants', 'db'].includes(tab) ? tab : 'recency';
    saveSettings();
    renderUi();
  }

  function setPanelOpen(open) {
    settings.panelOpen = open;
    saveSettings();
    renderUi();
  }

  function setupFullscreenHandling() {
    if (!ui || !ui.host) {
      return;
    }

    let lastState = null;

    const apply = () => {
      const fullscreen = isFullscreen();
      if (fullscreen === lastState) {
        return;
      }
      lastState = fullscreen;
      ui.host.style.setProperty('display', fullscreen ? 'none' : 'block', 'important');
    };

    document.addEventListener('fullscreenchange', apply);
    document.addEventListener('webkitfullscreenchange', apply);
    document.addEventListener('mozfullscreenchange', apply);
    document.addEventListener('MSFullscreenChange', apply);

    apply();
    window.setInterval(apply, 250);

    window.addEventListener('load', () => {
      apply();
    }, true);
  }

  function isFullscreen() {
    if (document.fullscreenElement) {
      return true;
    }
    if (document.webkitFullscreenElement) {
      return true;
    }
    if (document.querySelector('.ytp-fullscreen')) {
      return true;
    }
    return false;
  }

  function renderUi() {
    if (!ui) {
      return;
    }

    settings = normalizeSettings(settings);

    ui.panel.hidden = !settings.panelOpen;
    ui.button.setAttribute('aria-expanded', String(settings.panelOpen));

    ui.tabRecency.setAttribute('aria-selected', String(settings.tab === 'recency'));
    ui.tabOther.setAttribute('aria-selected', String(settings.tab === 'other'));
    ui.tabIrritants.setAttribute('aria-selected', String(settings.tab === 'irritants'));
    ui.tabDb.setAttribute('aria-selected', String(settings.tab === 'db'));
    ui.recencyTab.hidden = settings.tab !== 'recency';
    ui.otherTab.hidden = settings.tab !== 'other';
    ui.irritantsTab.hidden = settings.tab !== 'irritants';
    ui.dbTab.hidden = settings.tab !== 'db';

    ui.recencyEnabled.checked = settings.recencyEnabled;
    ui.hideVerified.checked = settings.hideVerified;
    ui.hideVerifiedReplies.checked = settings.hideVerifiedReplies;
    ui.hideVerifiedReplies.disabled = !settings.hideVerified;
    ui.hideVerifiedNotInterested.checked = settings.hideVerifiedNotInterested;
    ui.hideVerifiedNotInterested.disabled = !settings.hideVerified;
    ui.hideVerifiedUseDB.checked = settings.hideVerifiedUseDB;
    ui.hideVerifiedUseDB.disabled = !settings.hideVerified;
    ui.hidePremium.checked = settings.hidePremium;
    ui.hideWhatsHappening.checked = settings.hideWhatsHappening;
    ui.hideWhoToFollow.checked = settings.hideWhoToFollow;
    ui.nameFilterEnabled.checked = settings.nameFilterEnabled;
    ui.nameFilterNotInterested.checked = settings.nameFilterNotInterested;
    ui.nameFilterNotInterested.disabled = !settings.nameFilterEnabled;
    ui.nameFilterIncludeReplies.checked = settings.nameFilterIncludeReplies;
    ui.nameFilterIncludeReplies.disabled = !settings.nameFilterEnabled;
    if (document.activeElement !== ui.nameFilterKeywordsInput) {
      ui.nameFilterKeywordsInput.value = settings.nameFilterKeywords || '';
    }

    if (document.activeElement !== ui.recencyMinInput) {
      ui.recencyMinInput.value = settings.recencyMinValue ? String(settings.recencyMinValue) : '';
    }
    if (document.activeElement !== ui.recencyMaxInput) {
      ui.recencyMaxInput.value = settings.recencyMaxValue ? String(settings.recencyMaxValue) : '';
    }
    ui.recencyMinUnit.value = settings.recencyMinUnit;
    ui.recencyMaxUnit.value = settings.recencyMaxUnit;

    renderDbTable();
  }

  function updateStatus(hiddenCount, totalCount, notInterestedCount) {
    if (!ui || !ui.status) {
      return;
    }

    const recencyState = settings.recencyEnabled ? 'вкл' : 'выкл';
    const verifiedState = settings.hideVerified ? 'вкл' : 'выкл';
    const verifiedRepliesState = settings.hideVerifiedReplies ? 'вкл' : 'выкл';
    const verifiedNotInterestedState = settings.hideVerifiedNotInterested ? 'вкл' : 'выкл';
    const verifiedUseDBState = settings.hideVerifiedUseDB ? 'вкл' : 'выкл';
    const premiumState = settings.hidePremium ? 'вкл' : 'выкл';
    const whatsHappeningState = settings.hideWhatsHappening ? 'вкл' : 'выкл';
    const whoToFollowState = settings.hideWhoToFollow ? 'вкл' : 'выкл';
    const nameFilterState = settings.nameFilterEnabled ? 'вкл' : 'выкл';
    const notInterestedState = settings.nameFilterNotInterested ? 'вкл' : 'выкл';
    const includeRepliesState = settings.nameFilterIncludeReplies ? 'вкл' : 'выкл';
    ui.status.textContent =
      `Новизна: ${recencyState}. Галочники: ${verifiedState}. Ответы галочникам: ${verifiedRepliesState}. Прожимать неинтересно: ${verifiedNotInterestedState}. БД: ${verifiedUseDBState}. Премиум: ${premiumState}. Что происходит: ${whatsHappeningState}. Кого читать: ${whoToFollowState}. Фильтр имён: ${nameFilterState}. Неинтересное: ${notInterestedState}. Ответы: ${includeRepliesState}. ` +
      `Скрыто: ${hiddenCount}. Прожито "неинтересно": ${notInterestedCount}. Всего постов: ${totalCount}.`;
  }

  function renderDbTable() {
    if (!ui || !ui.dbTbody) {
      return;
    }

    ui.dbTbody.innerHTML = '';

    const dbUsers = settings.dbUsers || [];

    for (let i = 0; i < dbUsers.length; i++) {
      const user = dbUsers[i];
      const row = makeElement('tr');

      const cellNick = makeElement('td');
      const nickLink = makeElement('a');
      nickLink.href = `https://x.com/${user.nick}`;
      nickLink.textContent = user.nick || '';
      nickLink.target = '_blank';
      nickLink.rel = 'noopener noreferrer';
      nickLink.style.color = 'var(--xff-accent)';
      nickLink.style.textDecoration = 'underline';
      cellNick.append(nickLink);
      row.append(cellNick);

      const cellAction = makeElement('td');
      const selectAction = makeElement('select', 'xff-db-action-select');
      selectAction.dataset.index = String(i);

      const actionValues = ['Не выбрано', 'Фильтровать', 'Исключение'];
      for (const actionVal of actionValues) {
        const option = makeElement('option');
        option.value = actionVal;
        option.textContent = actionVal;
        if (actionVal === user.action) {
          option.selected = true;
        }
        selectAction.append(option);
      }

      selectAction.addEventListener('change', () => {
        const idx = Number.parseInt(selectAction.dataset.index, 10);
        if (settings.dbUsers[idx]) {
          settings.dbUsers[idx].action = selectAction.value;
          saveSettings();
          scheduleScan();
        }
      });

      cellAction.append(selectAction);
      row.append(cellAction);

      const cellDelete = makeElement('td');
      const btnDelete = makeElement('button', 'xff-db-delete', '×');
      btnDelete.type = 'button';
      btnDelete.dataset.index = String(i);
      btnDelete.title = 'Удалить';
      btnDelete.addEventListener('click', () => {
        const idx = Number.parseInt(btnDelete.dataset.index, 10);
        settings.dbUsers.splice(idx, 1);
        saveSettings();
        renderDbTable();
        scheduleScan();
      });
      cellDelete.append(btnDelete);
      row.append(cellDelete);

      ui.dbTbody.append(row);
    }
  }

  function hideIrritantElements() {
    if (settings.hidePremium) {
      document.querySelectorAll('aside[aria-label*="Подпишитесь на Premium"], aside[aria-label*="Premium"]').forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.setAttribute('data-xff-hidden', 'true');
        }
      });
    } else {
      document.querySelectorAll('aside[aria-label*="Подпишитесь на Premium"], aside[aria-label*="Premium"]').forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.removeAttribute('data-xff-hidden');
        }
      });
    }

    if (settings.hideWhatsHappening) {
      findElementsByHeading('Что происходит', 8).forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.setAttribute('data-xff-hidden', 'true');
        }
      });
    } else {
      findElementsByHeading('Что происходит', 8).forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.removeAttribute('data-xff-hidden');
        }
      });
    }

    if (settings.hideWhoToFollow) {
      document.querySelectorAll('aside[aria-label*="Кого читать"]').forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.setAttribute('data-xff-hidden', 'true');
        }
      });
      findElementsByHeading('Who to follow', 5).forEach(el => el.setAttribute('data-xff-hidden', 'true'));
    } else {
      document.querySelectorAll('aside[aria-label*="Кого читать"]').forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.removeAttribute('data-xff-hidden');
        }
      });
      findElementsByHeading('Who to follow', 5).forEach(el => el.removeAttribute('data-xff-hidden'));
    }
  }

  function findElementsByHeading(headingText, maxDepth) {
    const elements = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of headings) {
      const text = (heading.textContent || '').trim();
      if (text === headingText || text.startsWith(headingText)) {
        let parent = heading.parentElement;
        let depth = 0;
        let found = false;
        while (parent && depth < maxDepth && !found) {
          if (parent.tagName === 'SECTION' || parent.getAttribute('role') === 'region' || parent.getAttribute('role') === 'complementary') {
            elements.push(parent);
            found = true;
          } else {
            parent = parent.parentElement;
            depth++;
          }
        }
        if (!found) {
          elements.push(heading);
        }
      }
    }
    return elements;
  }

  function blurOnEnter(event) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }
})();
