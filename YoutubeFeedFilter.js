// ==UserScript==
// @name         YouTube Feed Filter
// @namespace    https://github.com/local/youtube-length-filter
// @version      1.1.2
// @description  Hides YouTube videos outside a configurable duration range and/or outside a recency (publish age) range.
// @author       Lynrayy
// @match        https://*.youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'yt-length-filter-settings-v1';
  const SLIDER_MAX_SECONDS = 2 * 60 * 60;
  const STORED_MAX_SECONDS = 12 * 60 * 60;
  const STEP_SECONDS = 5;

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
    ['hours', 'часов'],
    ['minutes', 'минут'],
    ['days', 'дней'],
    ['months', 'месяцев'],
    ['years', 'лет'],
  ];

  const RECENCY_WORD_TO_UNIT = {
    секунд: 'seconds', секунды: 'seconds', сек: 'seconds', second: 'seconds', seconds: 'seconds',
    минут: 'minutes', минуты: 'minutes', мин: 'minutes', minute: 'minutes', minutes: 'minutes',
    часов: 'hours', часа: 'hours', час: 'hours', hour: 'hours', hours: 'hours',
    дней: 'days', дня: 'days', дн: 'days', день: 'days', day: 'days', days: 'days',
    недель: 'weeks', недели: 'weeks', недел: 'weeks', week: 'weeks', weeks: 'weeks',
    месяцев: 'months', месяца: 'months', месяц: 'months', month: 'months', months: 'months',
    лет: 'years', года: 'years', год: 'years', year: 'years', years: 'years',
  };

  const DEFAULT_SETTINGS = {
    durationEnabled: true,
    recencyEnabled: false,
    jamEnabled: false,
    tab: 'duration',
    minSeconds: 0,
    maxSeconds: 20 * 60,
    recencyMinValue: 0,
    recencyMinUnit: 'months',
    recencyMaxValue: 0,
    recencyMaxUnit: 'months',
    irritantsKeywords: '',
    panelOpen: false,
  };

  const DURATION_BADGE_SELECTOR = [
    'ytd-thumbnail-overlay-time-status-renderer',
    'yt-thumbnail-bottom-overlay-view-model .ytBadgeShapeText',
    'yt-thumbnail-overlay-badge-view-model .ytBadgeShapeText',
    'badge-shape.ytBadgeShapeThumbnailBadge .ytBadgeShapeText',
    'yt-thumbnail-overlay-badge-view-model .badge-shape-wiz__text',
    '#thumbnail .badge-shape-wiz__text',
    '.ytp-videowall-still-info-duration',
  ].join(',');

  const CONTAINER_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    'ytd-rich-grid-slim-media',
    'ytd-compact-movie-renderer',
    'ytd-movie-renderer',
    '.ytp-videowall-still',
  ];

  let settings = loadSettings();
  let scanTimer = 0;
  let observer = null;
  let ui = null;

  boot();

  function boot() {
    try {
      addDocumentStyles();
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not install hiding styles.', error);
    }

    try {
      createUi();
    } catch (error) {
      console.error('[YouTube Length Filter] Could not create UI.', error);
    }

    registerMenuCommand();
    startObserver();
    scheduleScan();

    window.addEventListener('yt-navigate-finish', scheduleScan, true);
    window.addEventListener('yt-page-data-updated', scheduleScan, true);
    window.addEventListener('load', scheduleScan, true);
  }

  function loadSettings() {
    const saved = safeGetValue(STORAGE_KEY, null);
    if (!saved || typeof saved !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  }

  function normalizeSettings(value) {
    const minSeconds = clampTime(toNumber(value.minSeconds, DEFAULT_SETTINGS.minSeconds));
    const maxSeconds = clampTime(toNumber(value.maxSeconds, DEFAULT_SETTINGS.maxSeconds));
    const normalizedMin = Math.min(minSeconds, maxSeconds);
    const normalizedMax = Math.max(minSeconds, maxSeconds);

    return {
      durationEnabled: value.durationEnabled !== undefined ? Boolean(value.durationEnabled) : true,
      recencyEnabled: Boolean(value.recencyEnabled),
      jamEnabled: Boolean(value.jamEnabled),
      tab: ['duration', 'recency', 'irritants'].includes(value.tab) ? value.tab : 'duration',
      minSeconds: normalizedMin,
      maxSeconds: normalizedMax,
      recencyMinValue: Math.max(0, toNumber(value.recencyMinValue, 0)),
      recencyMinUnit: RECENCY_UNITS[value.recencyMinUnit] ? value.recencyMinUnit : 'months',
      recencyMaxValue: Math.max(0, toNumber(value.recencyMaxValue, 0)),
      recencyMaxUnit: RECENCY_UNITS[value.recencyMaxUnit] ? value.recencyMaxUnit : 'months',
      irritantsKeywords: typeof value.irritantsKeywords === 'string' ? value.irritantsKeywords : '',
      panelOpen: Boolean(value.panelOpen),
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
        return GM_getValue(key, fallback);
      }
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not read Tampermonkey storage.', error);
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not read localStorage.', error);
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
      console.warn('[YouTube Length Filter] Could not write Tampermonkey storage.', error);
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not write localStorage.', error);
    }
  }

  function addDocumentStyles() {
    const css = `
      [data-ytlf-hidden="true"] {
        display: none !important;
      }
    `;

    try {
      if (typeof GM_addStyle === 'function') {
        GM_addStyle(css);
        return;
      }
    } catch (error) {
      console.warn('[YouTube Length Filter] GM_addStyle failed, using a regular style tag.', error);
    }

    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function createUi() {
    if (document.getElementById('ytlf-root')) {
      return;
    }

    if (!document.body) {
      window.setTimeout(createUi, 100);
      return;
    }

    const host = makeElement('div');
    host.id = 'ytlf-root';

    const button = makeButton('ytlf-fab', 'YT', 'Фильтр YouTube');
    button.setAttribute('aria-expanded', 'false');

    const panel = makeElement('section', 'ytlf-panel');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Фильтр YouTube');

    const topRow = makeElement('div', 'ytlf-top-row');
    const title = makeElement('div', 'ytlf-title', 'Фильтр YouTube');
    const close = makeButton('ytlf-close', '×', 'Закрыть');
    close.setAttribute('aria-label', 'Закрыть');
    topRow.append(title, close);

    const tabBar = makeElement('div', 'ytlf-tabs');
    const tabDuration = makeButton('ytlf-tab ytlf-tab-duration', 'Длительность');
    const tabRecency = makeButton('ytlf-tab ytlf-tab-recency', 'Новизна');
    const tabIrritants = makeButton('ytlf-tab ytlf-tab-irritants', 'Раздражители');
    tabBar.append(tabDuration, tabRecency, tabIrritants);

    const durationTab = makeElement('div', 'ytlf-tab-panel ytlf-duration-tab');
    const recencyTab = makeElement('div', 'ytlf-tab-panel ytlf-recency-tab');
    const irritantsTab = makeElement('div', 'ytlf-tab-panel ytlf-irritants-tab');
    recencyTab.hidden = true;
    irritantsTab.hidden = true;

    const durationSwitch = makeElement('label', 'ytlf-switch');
    const durationEnabled = makeElement('input', 'ytlf-duration-enabled');
    durationEnabled.type = 'checkbox';
    durationSwitch.append(durationEnabled, makeElement('span', '', 'Фильтр длительности'));

    const rangeRow = makeElement('div', 'ytlf-range-row');
    const rangeName = makeElement('span', 'ytlf-range-name', 'Диапазон');
    const rangeLabel = makeElement('span', 'ytlf-range-label');
    rangeRow.append(rangeName, rangeLabel);

    const rangeStack = makeElement('div', 'ytlf-range-stack');
    const track = makeElement('div', 'ytlf-track');
    const fill = makeElement('div', 'ytlf-fill');
    const minRange = makeElement('input', 'ytlf-min-range');
    const maxRange = makeElement('input', 'ytlf-max-range');
    for (const range of [minRange, maxRange]) {
      range.type = 'range';
      range.min = '0';
      range.max = String(SLIDER_MAX_SECONDS);
      range.step = String(STEP_SECONDS);
    }
    rangeStack.append(track, fill, minRange, maxRange);

    const timeInputs = makeElement('div', 'ytlf-time-inputs');
    const minField = makeTimeField('От', 'ytlf-min-input');
    const maxField = makeTimeField('До', 'ytlf-max-input');
    timeInputs.append(minField.label, maxField.label);

    const presetRow = makeElement('div', 'ytlf-preset-row');
    const presetSelect = makeElement('select', 'ytlf-preset-select');
    const presetPlaceholder = makeElement('option');
    presetPlaceholder.value = '';
    presetPlaceholder.textContent = 'Пресет…';
    presetSelect.append(presetPlaceholder);
    addPresetOption(presetSelect, '0 – 5 минут', 0, 5 * 60);
    addPresetOption(presetSelect, '0 – 20 минут', 0, 20 * 60);
    addPresetOption(presetSelect, '5 минут – 3 часа', 5 * 60, 3 * 60 * 60);
    const reset = makeButton('ytlf-reset', 'Сброс');
    presetRow.append(presetSelect, reset);

    durationTab.append(durationSwitch, rangeRow, rangeStack, timeInputs, presetRow);

    const recencySwitch = makeElement('label', 'ytlf-switch');
    const recencyEnabled = makeElement('input', 'ytlf-recency-enabled');
    recencyEnabled.type = 'checkbox';
    recencySwitch.append(recencyEnabled, makeElement('span', '', 'Фильтр новизны'));

    const recencyHint = makeElement('div', 'ytlf-recency-hint',
      'Скрывать видео младше «От» и старше «До». Пустое поле — без ограничения.');

    const recencyMinField = makeRecencyField('От', 'ytlf-recency-min-input', 'ytlf-recency-min-unit');
    const recencyMaxField = makeRecencyField('До', 'ytlf-recency-max-input', 'ytlf-recency-max-unit');

    recencyTab.append(recencySwitch, recencyHint, recencyMinField.label, recencyMaxField.label);

    const irritantsSwitch = makeElement('label', 'ytlf-switch');
    const jamEnabled = makeElement('input', 'ytlf-jam-enabled');
    jamEnabled.type = 'checkbox';
    irritantsSwitch.append(jamEnabled, makeElement('span', '', 'Скрывать Джемы'));

    const irritantsHint = makeElement('div', 'ytlf-recency-hint',
      'Скрывает видео и плейлисты, в названии или разделе которых встречается «Джем». Можно дополнить своими словами-раздражителями.');

    const irritantsKeywords = makeElement('input', 'ytlf-irritants-keywords');
    irritantsKeywords.type = 'text';
    irritantsKeywords.placeholder = 'Свои слова (через запятую)';
    irritantsKeywords.autocomplete = 'off';
    irritantsKeywords.spellcheck = false;

    irritantsTab.append(irritantsSwitch, irritantsHint, irritantsKeywords);

    const status = makeElement('div', 'ytlf-status');

    panel.append(topRow, tabBar, durationTab, recencyTab, irritantsTab, status);
    host.append(button, panel);
    applyBaseUiStyles(host, button, panel);
    document.body.appendChild(host);

    try {
      addUiStyles();
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not install UI styles. Basic button is still visible.', error);
    }

    ui = {
      host,
      button,
      panel,
      close,
      tabDuration,
      tabRecency,
      tabIrritants,
      durationTab,
      recencyTab,
      irritantsTab,
      durationEnabled,
      recencyEnabled,
      jamEnabled,
      minRange,
      maxRange,
      minInput: minField.input,
      maxInput: maxField.input,
      fill,
      rangeLabel,
      status,
      presetSelect,
      reset,
      recencyMinInput: recencyMinField.input,
      recencyMinUnit: recencyMinField.select,
      recencyMaxInput: recencyMaxField.input,
      recencyMaxUnit: recencyMaxField.select,
      irritantsKeywords,
    };

    ui.button.addEventListener('click', () => setPanelOpen(!settings.panelOpen));
    ui.close.addEventListener('click', () => setPanelOpen(false));
    ui.tabDuration.addEventListener('click', () => setTab('duration'));
    ui.tabRecency.addEventListener('click', () => setTab('recency'));

    ui.durationEnabled.addEventListener('change', () => {
      settings.durationEnabled = ui.durationEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.recencyEnabled.addEventListener('change', () => {
      settings.recencyEnabled = ui.recencyEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.minRange.addEventListener('input', () => updateRangeFromSlider('min'));
    ui.maxRange.addEventListener('input', () => updateRangeFromSlider('max'));

    ui.minInput.addEventListener('change', () => updateRangeFromInput('min'));
    ui.maxInput.addEventListener('change', () => updateRangeFromInput('max'));
    ui.minInput.addEventListener('keydown', blurOnEnter);
    ui.maxInput.addEventListener('keydown', blurOnEnter);

    ui.presetSelect.addEventListener('change', () => {
      const value = ui.presetSelect.value;
      if (!value) {
        return;
      }
      const parts = value.split('-').map((part) => Number.parseInt(part, 10));
      if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
        setRange(parts[0], parts[1]);
      }
      ui.presetSelect.value = '';
    });

    ui.reset.addEventListener('click', () => {
      settings = { ...DEFAULT_SETTINGS, panelOpen: true, tab: settings.tab };
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.recencyMinInput.addEventListener('input', () => updateRecency('min'));
    ui.recencyMinUnit.addEventListener('change', () => updateRecency('min'));
    ui.recencyMaxInput.addEventListener('input', () => updateRecency('max'));
    ui.recencyMaxUnit.addEventListener('change', () => updateRecency('max'));
    ui.recencyMinInput.addEventListener('keydown', blurOnEnter);
    ui.recencyMaxInput.addEventListener('keydown', blurOnEnter);

    ui.tabIrritants.addEventListener('click', () => setTab('irritants'));

    ui.jamEnabled.addEventListener('change', () => {
      settings.jamEnabled = ui.jamEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.irritantsKeywords.addEventListener('change', () => {
      settings.irritantsKeywords = ui.irritantsKeywords.value;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    renderUi();
    setupFullscreenHandling();
  }

  function applyBaseUiStyles(host, button, panel) {
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.bottom = '18px';
    host.style.zIndex = '2147483647';
    host.style.display = 'block';
    host.style.pointerEvents = 'none';

    button.style.width = '54px';
    button.style.height = '42px';
    button.style.border = '1px solid #df7b73';
    button.style.borderRadius = '8px';
    button.style.background = '#d93025';
    button.style.color = '#ffffff';
    button.style.fontWeight = '800';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';

    panel.style.pointerEvents = 'auto';
  }

  function addUiStyles() {
    if (document.getElementById('ytlf-ui-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ytlf-ui-style';
    style.textContent = `
      #ytlf-root {
        --ytlf-bg: #ffffff;
        --ytlf-text: #1f2328;
        --ytlf-muted: #5f6368;
        --ytlf-border: #d7dce2;
        --ytlf-accent: #d93025;
        --ytlf-accent-border: #df7b73;
        --ytlf-accent-soft: #fce8e6;
        --ytlf-hover-border: #cd5a52;
        --ytlf-input-bg: #f8fafc;
        --ytlf-track: #dfe3e8;
        --ytlf-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
        position: fixed !important;
        right: 18px !important;
        bottom: 18px !important;
        z-index: 2147483647 !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        color: var(--ytlf-text) !important;
        color-scheme: light dark;
        font-family: Inter, Roboto, Arial, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        letter-spacing: 0 !important;
        pointer-events: none !important;
      }

      @media (prefers-color-scheme: dark) {
        #ytlf-root {
          --ytlf-bg: #202124;
          --ytlf-text: #f1f3f4;
          --ytlf-muted: #bdc1c6;
          --ytlf-border: #3c4043;
          --ytlf-accent-border: #7a3f3a;
          --ytlf-accent-soft: #3b2523;
          --ytlf-hover-border: #9f5049;
          --ytlf-input-bg: #17191c;
          --ytlf-track: #4b5158;
        }
      }

      #ytlf-root,
      #ytlf-root * {
        box-sizing: border-box !important;
      }

      #ytlf-root button,
      #ytlf-root input,
      #ytlf-root select {
        font: inherit !important;
      }

      #ytlf-root .ytlf-fab,
      #ytlf-root .ytlf-panel {
        pointer-events: auto !important;
      }

      #ytlf-root .ytlf-fab {
        width: 54px !important;
        height: 42px !important;
        border: 1px solid var(--ytlf-accent-border) !important;
        border-radius: 8px !important;
        background: var(--ytlf-accent) !important;
        color: #ffffff !important;
        padding: 0 !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22) !important;
      }

      #ytlf-root .ytlf-fab:hover {
        filter: brightness(1.05);
      }

      #ytlf-root .ytlf-panel {
        position: absolute !important;
        right: 0 !important;
        bottom: 52px !important;
        width: min(340px, calc(100vw - 28px)) !important;
        max-height: 80vh !important;
        overflow-y: auto !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 8px !important;
        background: var(--ytlf-bg) !important;
        color: var(--ytlf-text) !important;
        box-shadow: var(--ytlf-shadow) !important;
        padding: 14px !important;
      }

      #ytlf-root .ytlf-panel[hidden] {
        display: none !important;
      }

      #ytlf-root .ytlf-top-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
      }

      #ytlf-root .ytlf-title {
        color: var(--ytlf-text) !important;
        font-size: 15px !important;
        font-weight: 800 !important;
        line-height: 1.2 !important;
      }

      #ytlf-root .ytlf-close {
        width: 30px !important;
        height: 30px !important;
        border: 1px solid transparent !important;
        border-radius: 6px !important;
        background: transparent !important;
        color: var(--ytlf-muted) !important;
        padding: 0 !important;
        cursor: pointer !important;
        font-size: 20px !important;
        line-height: 1 !important;
      }

      #ytlf-root .ytlf-close:hover {
        border-color: var(--ytlf-border) !important;
        color: var(--ytlf-text) !important;
      }

      #ytlf-root .ytlf-tabs {
        display: flex !important;
        gap: 6px !important;
        margin-top: 12px !important;
      }

      #ytlf-root .ytlf-tab {
        flex: 1 !important;
        min-height: 34px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 7px !important;
        background: transparent !important;
        color: var(--ytlf-text) !important;
        padding: 6px 9px !important;
        font-size: 13px !important;
        font-weight: 750 !important;
        cursor: pointer !important;
      }

      #ytlf-root .ytlf-tab:hover {
        border-color: var(--ytlf-hover-border) !important;
      }

      #ytlf-root .ytlf-tab[aria-selected="true"] {
        border-color: var(--ytlf-accent-border) !important;
        background: var(--ytlf-accent-soft) !important;
        color: var(--ytlf-accent) !important;
      }

      #ytlf-root .ytlf-tab-panel[hidden] {
        display: none !important;
      }

      #ytlf-root .ytlf-switch {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
        margin-top: 12px !important;
        color: var(--ytlf-text) !important;
        font-size: 13px !important;
        font-weight: 650 !important;
        cursor: pointer !important;
      }

      #ytlf-root .ytlf-switch input {
        width: 18px !important;
        height: 18px !important;
        margin: 0 !important;
        accent-color: var(--ytlf-accent);
        cursor: pointer !important;
      }

      #ytlf-root .ytlf-range-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
        margin-top: 14px !important;
      }

      #ytlf-root .ytlf-range-name {
        color: var(--ytlf-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
      }

      #ytlf-root .ytlf-range-label {
        color: var(--ytlf-text) !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        white-space: nowrap !important;
      }

      #ytlf-root .ytlf-range-stack {
        position: relative !important;
        height: 38px !important;
        margin-top: 8px !important;
      }

      #ytlf-root .ytlf-track,
      #ytlf-root .ytlf-fill {
        position: absolute !important;
        top: 17px !important;
        height: 6px !important;
        border-radius: 999px !important;
      }

      #ytlf-root .ytlf-track {
        left: 0 !important;
        right: 0 !important;
        background: var(--ytlf-track) !important;
      }

      #ytlf-root .ytlf-fill {
        left: 0;
        right: 0;
        background: var(--ytlf-accent) !important;
      }

      #ytlf-root input[type="range"] {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 38px !important;
        margin: 0 !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        background: transparent !important;
        pointer-events: none !important;
      }

      #ytlf-root input[type="range"]::-webkit-slider-thumb {
        width: 18px !important;
        height: 18px !important;
        border: 2px solid #ffffff !important;
        border-radius: 50% !important;
        background: var(--ytlf-accent) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        appearance: none !important;
        -webkit-appearance: none !important;
      }

      #ytlf-root input[type="range"]::-moz-range-thumb {
        width: 18px !important;
        height: 18px !important;
        border: 2px solid #ffffff !important;
        border-radius: 50% !important;
        background: var(--ytlf-accent) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }

      #ytlf-root input[type="range"]::-webkit-slider-runnable-track {
        height: 6px !important;
        background: transparent !important;
      }

      #ytlf-root input[type="range"]::-moz-range-track {
        height: 6px !important;
        background: transparent !important;
      }

      #ytlf-root .ytlf-time-inputs {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        margin-top: 10px !important;
      }

      #ytlf-root .ytlf-time-field {
        display: grid !important;
        gap: 5px !important;
        color: var(--ytlf-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #ytlf-root .ytlf-time-field input {
        width: 100% !important;
        min-width: 0 !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-input-bg) !important;
        color: var(--ytlf-text) !important;
        padding: 8px 9px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        outline: none !important;
      }

      #ytlf-root .ytlf-time-field input:focus {
        border-color: var(--ytlf-accent) !important;
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-preset-row {
        display: flex !important;
        align-items: stretch !important;
        gap: 10px !important;
        margin-top: 12px !important;
      }

      #ytlf-root .ytlf-preset-select {
        flex: 1 !important;
        min-width: 0 !important;
        min-height: 32px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-input-bg) !important;
        color: var(--ytlf-text) !important;
        padding: 6px 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        outline: none !important;
      }

      #ytlf-root .ytlf-preset-select:focus {
        border-color: var(--ytlf-accent) !important;
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-reset {
        min-height: 32px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: transparent !important;
        color: var(--ytlf-text) !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: 750 !important;
        cursor: pointer !important;
        white-space: nowrap !important;
      }

      #ytlf-root .ytlf-reset:hover {
        border-color: var(--ytlf-hover-border) !important;
        background: var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-recency-hint {
        margin-top: 10px !important;
        color: var(--ytlf-muted) !important;
        font-size: 11.5px !important;
        line-height: 1.4 !important;
      }

      #ytlf-root .ytlf-recency-field {
        display: grid !important;
        gap: 5px !important;
        margin-top: 12px !important;
        color: var(--ytlf-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #ytlf-root .ytlf-recency-controls {
        display: flex !important;
        gap: 8px !important;
      }

      #ytlf-root .ytlf-recency-controls input {
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-input-bg) !important;
        color: var(--ytlf-text) !important;
        padding: 8px 9px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        outline: none !important;
      }

      #ytlf-root .ytlf-recency-controls input:focus {
        border-color: var(--ytlf-accent) !important;
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-recency-controls select {
        flex: 0 0 auto !important;
        min-height: 36px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-input-bg) !important;
        color: var(--ytlf-text) !important;
        padding: 8px 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        outline: none !important;
      }

      #ytlf-root .ytlf-recency-controls select:focus {
        border-color: var(--ytlf-accent) !important;
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-irritants-keywords {
        display: block !important;
        width: 100% !important;
        margin-top: 10px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-input-bg) !important;
        color: var(--ytlf-text) !important;
        padding: 8px 9px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: 0 !important;
        outline: none !important;
      }

      #ytlf-root .ytlf-irritants-keywords:focus {
        border-color: var(--ytlf-accent) !important;
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft) !important;
      }

      #ytlf-root .ytlf-status {
        margin-top: 12px !important;
        color: var(--ytlf-muted) !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
      }

      @media (max-width: 520px) {
        #ytlf-root {
          right: 10px !important;
          bottom: 10px !important;
        }

        #ytlf-root .ytlf-panel {
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

  function makeTimeField(labelText, inputClassName) {
    const label = makeElement('label', 'ytlf-time-field');
    const caption = makeElement('span', '', labelText);
    const input = makeElement('input', inputClassName);
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(caption, input);
    return { label, input };
  }

  function makeRecencyField(labelText, valueClassName, unitClassName) {
    const label = makeElement('label', 'ytlf-recency-field');
    const caption = makeElement('span', '', labelText);
    const controls = makeElement('div', 'ytlf-recency-controls');
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

  function addPresetOption(select, text, minSeconds, maxSeconds) {
    const option = makeElement('option');
    option.value = `${minSeconds}-${maxSeconds}`;
    option.textContent = text;
    select.append(option);
  }

  function registerMenuCommand() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }

    GM_registerMenuCommand('Открыть фильтр YouTube', () => {
      setPanelOpen(true);
    });

    GM_registerMenuCommand('Вкл/выкл фильтр длительности', () => {
      settings.durationEnabled = !settings.durationEnabled;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл фильтр новизны', () => {
      settings.recencyEnabled = !settings.recencyEnabled;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание Джемов', () => {
      settings.jamEnabled = !settings.jamEnabled;
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

    observer = new MutationObserver(scheduleScan);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, 120);
  }

  function scanPage() {
    const seenContainers = new Set();
    const hiddenContainers = new Set();
    const containers = document.querySelectorAll(CONTAINER_SELECTORS.join(','));

    for (const container of containers) {
      const ancestor = container.parentElement
        ? container.parentElement.closest(CONTAINER_SELECTORS.join(','))
        : null;
      if (ancestor) {
        continue;
      }

      if (seenContainers.has(container)) {
        continue;
      }

      seenContainers.add(container);

      if (computeHide(container)) {
        container.setAttribute('data-ytlf-hidden', 'true');
        hiddenContainers.add(container);
      } else {
        container.removeAttribute('data-ytlf-hidden');
      }
    }

    updateStatus(hiddenContainers.size, seenContainers.size);
  }

  function computeHide(container) {
    if (settings.durationEnabled) {
      const duration = readDuration(container);
      if (duration !== null && (duration < settings.minSeconds || duration > settings.maxSeconds)) {
        return true;
      }
    }

    if (settings.recencyEnabled) {
      const age = readAgeSeconds(container);
      if (age !== null) {
        const minAge = recencyToSeconds('min');
        const maxAge = recencyToSeconds('max');
        if (age < minAge || age > maxAge) {
          return true;
        }
      }
    }

    if (settings.jamEnabled && isIrritant(container)) {
      return true;
    }

    return false;
  }

  function isIrritant(container) {
    const keywords = ['джем'];
    const extra = (settings.irritantsKeywords || '')
      .split(',')
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 0);
    for (const word of extra) {
      keywords.push(word);
    }

    if (!keywords.length) {
      return false;
    }

    const text = (container.textContent || '').toLowerCase();
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return true;
      }
    }

    const section = container.closest('ytd-rich-shelf-renderer, ytd-rich-section-renderer');
    if (section) {
      const sectionText = (section.textContent || '').toLowerCase();
      for (const keyword of keywords) {
        if (sectionText.includes(keyword)) {
          return true;
        }
      }
    }

    return false;
  }

  function readDuration(container) {
    const badges = container.matches(DURATION_BADGE_SELECTOR)
      ? [container]
      : container.querySelectorAll(DURATION_BADGE_SELECTOR);

    for (const badge of badges) {
      const duration = parseDurationText(badge.textContent || '');
      if (duration !== null) {
        return duration;
      }
    }

    return null;
  }

  function parseDurationText(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/\b\d{1,5}:\d{2}(?::\d{2})?\b/);

    if (!match) {
      return null;
    }

    const parts = match[0].split(':').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }

    return parts[0] * 60 * 60 + parts[1] * 60 + parts[2];
  }

  function readAgeSeconds(container) {
    const nodes = container.querySelectorAll('#published-time-text, #metadata-line, ytd-video-meta-block');
    let text = '';
    for (const node of nodes) {
      text += ' ' + (node.textContent || '');
    }
    if (!text.trim()) {
      text = container.textContent || '';
    }
    return parseAgeText(text);
  }

  function parseAgeText(text) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();

    if (/сейчас|только что|just now/i.test(normalized)) {
      return 0;
    }

    const unitWords = Object.keys(RECENCY_WORD_TO_UNIT);
    const unitAlt = unitWords.slice().sort((a, b) => b.length - a.length).join('|');
    const relRegex = new RegExp('(\\d+)\\s*(' + unitAlt + ')\\s*(назад|ago)', 'i');
    const relMatch = relRegex.exec(normalized);
    if (relMatch) {
      const amount = Number.parseInt(relMatch[1], 10);
      const unitKey = RECENCY_WORD_TO_UNIT[String(relMatch[2]).toLowerCase()];
      if (Number.isFinite(amount) && unitKey && RECENCY_UNITS[unitKey]) {
        return amount * RECENCY_UNITS[unitKey];
      }
    }

    const absolute = parseAbsoluteDate(normalized);
    if (absolute !== null) {
      const age = (Date.now() - absolute) / 1000;
      if (age >= 0) {
        return age;
      }
    }

    return null;
  }

  function parseAbsoluteDate(text) {
    const ruMonths = {
      янв: 1, фев: 2, мар: 3, апр: 4, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
      января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8,
      сентября: 9, октября: 10, ноября: 11, декабря: 12,
    };

    const ruMatch = text.match(/\b(\d{1,2})\s+([а-яА-ЯёЄїҐа-я]+)\.?\s+(\d{4})\b/);
    if (ruMatch) {
      const month = ruMonths[String(ruMatch[2]).toLowerCase().replace(/\.$/, '')];
      if (month) {
        const ts = Date.UTC(Number(ruMatch[3]), month - 1, Number(ruMatch[1]));
        if (!Number.isNaN(ts)) {
          return ts;
        }
      }
    }

    const enMatch = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (enMatch) {
      const ts = Date.parse(`${enMatch[1]} ${enMatch[2]}, ${enMatch[3]}`);
      if (!Number.isNaN(ts)) {
        return ts;
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

  function updateRangeFromSlider(changed) {
    const min = Number.parseInt(ui.minRange.value, 10);
    const max = Number.parseInt(ui.maxRange.value, 10);

    if (changed === 'min' && min > max) {
      settings.minSeconds = max;
    } else if (changed === 'max' && max < min) {
      settings.maxSeconds = min;
    } else {
      settings.minSeconds = min;
      settings.maxSeconds = max;
    }

    saveSettings();
    renderUi();
    scheduleScan();
  }

  function updateRangeFromInput(changed) {
    const input = changed === 'min' ? ui.minInput : ui.maxInput;
    const parsed = parseTimeInput(input.value);

    if (parsed === null) {
      renderUi();
      return;
    }

    if (changed === 'min') {
      setRange(parsed, Math.max(parsed, settings.maxSeconds));
    } else {
      setRange(Math.min(settings.minSeconds, parsed), parsed);
    }
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

  function setRange(minSeconds, maxSeconds) {
    settings.minSeconds = clampTime(minSeconds);
    settings.maxSeconds = clampTime(maxSeconds);
    saveSettings();
    renderUi();
    scheduleScan();
  }

  function setTab(tab) {
    settings.tab = ['duration', 'recency', 'irritants'].includes(tab) ? tab : 'duration';
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

    const observePlayer = () => {
      const player = document.querySelector('#movie_player, .html5-video-player, ytd-watch-flexy');
      if (player) {
        new MutationObserver(apply).observe(player, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    };

    document.addEventListener('fullscreenchange', apply);
    document.addEventListener('webkitfullscreenchange', apply);
    document.addEventListener('mozfullscreenchange', apply);
    document.addEventListener('MSFullscreenChange', apply);

    observePlayer();
    apply();

    window.setInterval(apply, 250);

    window.addEventListener('yt-navigate-finish', () => window.setTimeout(() => {
      observePlayer();
      apply();
    }, 500));
    window.addEventListener('load', () => {
      observePlayer();
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

    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player && player.classList.contains('ytp-fullscreen')) {
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

    ui.tabDuration.setAttribute('aria-selected', String(settings.tab === 'duration'));
    ui.tabRecency.setAttribute('aria-selected', String(settings.tab === 'recency'));
    ui.tabIrritants.setAttribute('aria-selected', String(settings.tab === 'irritants'));
    ui.durationTab.hidden = settings.tab !== 'duration';
    ui.recencyTab.hidden = settings.tab !== 'recency';
    ui.irritantsTab.hidden = settings.tab !== 'irritants';

    ui.durationEnabled.checked = settings.durationEnabled;
    ui.recencyEnabled.checked = settings.recencyEnabled;
    ui.jamEnabled.checked = settings.jamEnabled;
    if (document.activeElement !== ui.irritantsKeywords) {
      ui.irritantsKeywords.value = settings.irritantsKeywords || '';
    }

    const sliderMin = Math.min(settings.minSeconds, SLIDER_MAX_SECONDS);
    const sliderMax = Math.min(settings.maxSeconds, SLIDER_MAX_SECONDS);
    ui.minRange.value = String(sliderMin);
    ui.maxRange.value = String(sliderMax);
    ui.minInput.value = document.activeElement === ui.minInput ? ui.minInput.value : formatTime(settings.minSeconds);
    ui.maxInput.value = document.activeElement === ui.maxInput ? ui.maxInput.value : formatTime(settings.maxSeconds);
    ui.rangeLabel.textContent = `${formatTime(settings.minSeconds)} - ${formatTime(settings.maxSeconds)}`;

    const left = (sliderMin / SLIDER_MAX_SECONDS) * 100;
    const right = 100 - (sliderMax / SLIDER_MAX_SECONDS) * 100;
    ui.fill.style.left = `${left}%`;
    ui.fill.style.right = `${right}%`;

    if (document.activeElement !== ui.recencyMinInput) {
      ui.recencyMinInput.value = settings.recencyMinValue ? String(settings.recencyMinValue) : '';
    }
    if (document.activeElement !== ui.recencyMaxInput) {
      ui.recencyMaxInput.value = settings.recencyMaxValue ? String(settings.recencyMaxValue) : '';
    }
    ui.recencyMinUnit.value = settings.recencyMinUnit;
    ui.recencyMaxUnit.value = settings.recencyMaxUnit;
  }

  function updateStatus(hiddenCount, totalCount) {
    if (!ui || !ui.status) {
      return;
    }

    const durationState = settings.durationEnabled ? 'вкл' : 'выкл';
    const recencyState = settings.recencyEnabled ? 'вкл' : 'выкл';
    const jamState = settings.jamEnabled ? 'вкл' : 'выкл';
    ui.status.textContent =
      `Длительность: ${durationState}. Новизна: ${recencyState}. Джемы: ${jamState}. ` +
      `Скрыто: ${hiddenCount}. Всего видео: ${totalCount}.`;
  }

  function parseTimeInput(value) {
    const text = value.trim().replace(',', '.');
    if (!text) {
      return null;
    }

    if (/^\d+$/.test(text)) {
      return clampTime(Number.parseInt(text, 10) * 60);
    }

    if (!/^\d{1,5}:\d{1,2}(?::\d{1,2})?$/.test(text)) {
      return null;
    }

    const parts = text.split(':').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    let seconds = 0;
    if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      seconds = parts[0] * 60 * 60 + parts[1] * 60 + parts[2];
    }

    return clampTime(seconds);
  }

  function clampTime(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.max(0, Math.min(STORED_MAX_SECONDS, Math.round(number / STEP_SECONDS) * STEP_SECONDS));
  }

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const restSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(restSeconds)}`;
    }

    return `${minutes}:${pad(restSeconds)}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function blurOnEnter(event) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }
})();
