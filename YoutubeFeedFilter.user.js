// ==UserScript==
// @name         YouTube Feed Filter
// @namespace    https://github.com/local/youtube-length-filter
// @version      2.0.24
// @description  Hides YouTube videos outside a configurable duration range and/or outside a recency (publish age) range. Hides jam playlists and shelf sections.
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

    const SCRIPT_VERSION = '2.0.24';
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
    ['minutes', 'минут'],
    ['hours', 'часов'],
    ['days', 'дней'],
    ['months', 'месяцев'],
    ['years', 'лет'],
  ];

  const RECENCY_WORD_TO_UNIT = {
    секунд: 'seconds', секунды: 'seconds', сек: 'seconds', с: 'seconds', second: 'seconds', seconds: 'seconds',
    минут: 'minutes', минуты: 'minutes', мин: 'minutes', м: 'minutes', minute: 'minutes', minutes: 'minutes',
    часов: 'hours', часа: 'hours', час: 'hours', ч: 'hours', 'ч.': 'hours', hour: 'hours', hours: 'hours',
    дней: 'days', дня: 'days', дн: 'days', д: 'days', 'д.': 'days', день: 'days', day: 'days', days: 'days',
    недель: 'weeks', недели: 'weeks', недел: 'weeks', нед: 'weeks', 'нед.': 'weeks', week: 'weeks', weeks: 'weeks',
    месяцев: 'months', месяца: 'months', месяц: 'months', мес: 'months', 'мес.': 'months', month: 'months', months: 'months',
    лет: 'years', года: 'years', год: 'years', г: 'years', 'г.': 'years', 'л.': 'years', л: 'years', year: 'years', years: 'years',
  };

  const DEFAULT_SETTINGS = {
    durationEnabled: true,
    recencyEnabled: false,
    jamEnabled: false,
    shelfEnabled: false,
    applyEverywhere: false,
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

  const CONTAINER_SELECTOR = [
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
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-channel-video-renderer',
    // Subscriptions page: heading + group pairs (not necessarily direct children)
    'main h3',
    'main h2',
    'main group',
    // YouTube subscription feed actual structure
    'main ytd-rich-grid-row',
    'main ytd-rich-grid-media',
    'main ytd-rich-item-renderer',
    'main [role="heading"][aria-level="3"]',
    'main [role="heading"][aria-level="2"]',
    'main yt-formatted-string[role="heading"]',
    // Fallback: all direct children of main that might be video entries
    'main > *',
  ].join(',');

  let settings = loadSettings();
  let scanTimer = 0;
  let scanDebounceTimer = 0;
  const SCAN_DEBOUNCE_MS = 500;
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
    window.removeEventListener('yt-page-data-updated', scheduleScan, true);
    window.removeEventListener('load', scheduleScan, true);
    if (ui && ui.host) {
      ui.host.remove();
      ui = null;
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', destroy, { once: true });
  window.addEventListener('unload', destroy, { once: true });

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
    console.log('[YT Filter] loadSettings saved:', saved);
    if (!saved || typeof saved !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
    console.log('[YT Filter] loadSettings normalized:', normalized);
    return normalized;
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
      shelfEnabled: Boolean(value.shelfEnabled),
      applyEverywhere: Boolean(value.applyEverywhere),
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
    console.log('[YT Filter] saveSettings recencyEnabled:', settings.recencyEnabled, 'full:', JSON.stringify(settings));
    safeSetValue(STORAGE_KEY, settings);
  }

  function safeGetValue(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        const result = GM_getValue(key, fallback);
        console.log('[YT Filter] safeGetValue GM_getValue:', key, result);
        return result;
      }
    } catch (error) {
      console.warn('[YouTube Length Filter] Could not read Tampermonkey storage.', error);
    }

    try {
      const raw = window.localStorage.getItem(key);
      const result = raw ? JSON.parse(raw) : fallback;
      console.log('[YT Filter] safeGetValue localStorage:', key, result);
      return result;
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
    const version = makeElement('span', 'ytlf-version', `v${SCRIPT_VERSION}`);
    title.appendChild(version);
    const close = makeButton('ytlf-close', '×', 'Закрыть');
    close.setAttribute('aria-label', 'Закрыть');
    topRow.append(title, close);

    const tabBar = makeElement('div', 'ytlf-tabs');
    const tabDuration = makeButton('ytlf-tab ytlf-tab-duration', 'Длительность');
    const tabRecency = makeButton('ytlf-tab ytlf-tab-recency', 'Новизна');
    const tabIrritants = makeButton('ytlf-tab ytlf-tab-irritants', 'Раздражители');
    tabBar.append(tabDuration, tabRecency, tabIrritants);

    const applyEverywhereRow = makeElement('div', 'ytlf-apply-everywhere-row');
    const applyEverywhereSwitch = makeElement('label', 'ytlf-switch');
    const applyEverywhereEnabled = makeElement('input', 'ytlf-apply-everywhere-enabled');
    applyEverywhereEnabled.type = 'checkbox';
    applyEverywhereSwitch.append(applyEverywhereEnabled, makeElement('span', '', 'Применять везде'));
    applyEverywhereRow.append(applyEverywhereSwitch);

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

    const recencyMinField = makeRecencyField('От', 'ytlf-recency-min-input', 'ytlf-recency-min-unit');
    const recencyMaxField = makeRecencyField('До', 'ytlf-recency-max-input', 'ytlf-recency-max-unit');

    recencyTab.append(recencySwitch, recencyMinField.label, recencyMaxField.label);

    const irritantsSwitch = makeElement('label', 'ytlf-switch');
    const jamEnabled = makeElement('input', 'ytlf-jam-enabled');
    jamEnabled.type = 'checkbox';
    irritantsSwitch.append(jamEnabled, makeElement('span', '', 'Скрывать джемы'));

    const shelfSwitch = makeElement('label', 'ytlf-switch');
    const shelfEnabled = makeElement('input', 'ytlf-shelf-enabled');
    shelfEnabled.type = 'checkbox';
    shelfSwitch.append(shelfEnabled, makeElement('span', '', 'Скрывать полки'));

    const jamHint = makeElement('div', 'ytlf-tooltip',
      'Скрывает плейлисты джемов (миксы). На превью вместо длительности написано «Джем», название начинается с «Джем –». Не работает, если выбрана категория «Джемы» сверху.');

    const shelfHint = makeElement('div', 'ytlf-tooltip',
      'Скрывает полки-разделы: «Ещё темы», «Shorts», предложения YouTube Premium и прочие рекомендательные блоки.');

    const jamRow = makeElement('div', 'ytlf-irritant-row');
    jamRow.append(irritantsSwitch, jamHint);

    const shelfRow = makeElement('div', 'ytlf-irritant-row');
    shelfRow.append(shelfSwitch, shelfHint);

    const irritantsKeywords = makeElement('input', 'ytlf-irritants-keywords');
    irritantsKeywords.type = 'text';
    irritantsKeywords.placeholder = 'Свои слова (через запятую)';
    irritantsKeywords.autocomplete = 'off';
    irritantsKeywords.spellcheck = false;

    irritantsTab.append(jamRow, shelfRow, irritantsKeywords);

    attachTooltip(jamRow, jamHint);
    attachTooltip(shelfRow, shelfHint);

    const status = makeElement('div', 'ytlf-status');

    panel.append(topRow, applyEverywhereRow, tabBar, durationTab, recencyTab, irritantsTab, status);
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
      shelfEnabled,
      applyEverywhereEnabled,
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
    ui.tabIrritants.addEventListener('click', () => setTab('irritants'));

    ui.applyEverywhereEnabled.addEventListener('change', () => {
      settings.applyEverywhere = ui.applyEverywhereEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.durationEnabled.addEventListener('change', () => {
      settings.durationEnabled = ui.durationEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.recencyEnabled.addEventListener('change', () => {
      console.log('[YT Filter] recencyEnabled checkbox changed:', ui.recencyEnabled.checked);
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

    ui.shelfEnabled.addEventListener('change', () => {
      settings.shelfEnabled = ui.shelfEnabled.checked;
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
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      #ytlf-root .ytlf-version {
        color: var(--ytlf-muted) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        opacity: 0.7 !important;
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

      #ytlf-root .ytlf-apply-everywhere-row {
        margin-top: 8px !important;
        margin-bottom: 8px !important;
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
        border-color: var(--ytlf-accent);
        box-shadow: 0 0 0 3px var(--ytlf-accent-soft);
      }

      #ytlf-root .ytlf-irritant-row {
        position: relative !important;
      }

      #ytlf-root .ytlf-tooltip {
        position: absolute !important;
        left: 0 !important;
        top: calc(100% + 6px) !important;
        width: min(300px, 100%) !important;
        margin: 0 !important;
        padding: 8px 10px !important;
        border: 1px solid var(--ytlf-border) !important;
        border-radius: 6px !important;
        background: var(--ytlf-bg) !important;
        color: var(--ytlf-muted) !important;
        font-size: 11.5px !important;
        font-weight: 500 !important;
        line-height: 1.4 !important;
        box-shadow: var(--ytlf-shadow) !important;
        z-index: 30 !important;
        display: none !important;
      }

      #ytlf-root .ytlf-tooltip.ytlf-tooltip-visible {
        display: block !important;
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

    GM_registerMenuCommand('Вкл/выкл скрывание джемов', () => {
      settings.jamEnabled = !settings.jamEnabled;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    GM_registerMenuCommand('Вкл/выкл скрывание полок', () => {
      settings.shelfEnabled = !settings.shelfEnabled;
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

    // Use a debounced scan to avoid excessive re-scanning on infinite scroll
    observer = new MutationObserver((mutations) => {
      if (isDestroyed) return;
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if added node is a video container or contains video containers
              if (node.matches && node.matches(CONTAINER_SELECTOR)) {
                shouldScan = true;
                break;
              }
              if (node.querySelector && node.querySelector(CONTAINER_SELECTOR)) {
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

  function isHomePage() {
    // Check if we're on YouTube home page or feed pages where filters should work by default
    const path = window.location.pathname;
    const feedPaths = ['/', '', '/feed', '/feed/subscriptions', '/feed/history', '/feed/playlists', '/feed/watch_later', '/feed/liked'];
    return feedPaths.some(p => path === p || path.startsWith(p + '/')) || path.startsWith('/feed/');
  }

  function isSearchPage() {
    const path = window.location.pathname;
    return path === '/results' || path.startsWith('/results/');
  }

  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/watch/');
  }

  function scheduleScan() {
    if (isDestroyed) return;
    if (!settings.applyEverywhere && (!isHomePage() || isSearchPage())) {
      return;
    }
    window.clearTimeout(scanTimer);
    window.clearTimeout(scanDebounceTimer);
    scanDebounceTimer = window.setTimeout(() => {
      if (!isDestroyed) {
        scanTimer = window.setTimeout(scanPage, 120);
      }
    }, SCAN_DEBOUNCE_MS);
  }

  function isVideoContainer(element) {
    // Check if it contains a video link (/watch or /shorts) - check element and children
    const videoLink = element.querySelector('a[href^="/watch"], a[href^="/shorts"]') || 
                      (element.tagName === 'A' && element.href && (element.href.includes('/watch') || element.href.includes('/shorts')));
    
    // Check for date text in element
    const text = element.textContent || '';
    const hasDate = /\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(text);
    
    // If it has both link and date, it's a video container
    if (videoLink && hasDate) return true;
    
    // If it's a GROUP element, check sibling heading for link
    if (element.tagName === 'GROUP') {
      const prevHeading = element.previousElementSibling;
      if (prevHeading && prevHeading.querySelector('a[href^="/watch"], a[href^="/shorts"]')) return true;
      // Also check if heading has date (rare case)
      if (prevHeading && /\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(prevHeading.textContent || '')) return true;
      return true; // GROUP elements in main are likely video entries
    }
    
    // If it's a heading-like element with link, check sibling group for date
    if (videoLink && !hasDate) {
      const nextGroup = element.nextElementSibling;
      if (nextGroup && nextGroup.tagName === 'GROUP') return true;
      // Also check if next sibling has date text
      if (nextGroup && /\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(nextGroup.textContent || '')) return true;
      // If it has link but no date in sibling, still might be valid (date could be elsewhere)
      return true;
    }
    
    // If it has date but no link, check siblings for link
    if (hasDate && !videoLink) {
      const prevLink = element.previousElementSibling?.querySelector?.('a[href^="/watch"], a[href^="/shorts"]');
      const nextLink = element.nextElementSibling?.querySelector?.('a[href^="/watch"], a[href^="/shorts"]');
      if (prevLink || nextLink) return true;
    }
    
    // Fallback: check parent/sibling for link (for heading+group pattern)
    const parentLink = element.closest('a[href^="/watch"], a[href^="/shorts"]');
    if (parentLink) return true;
    
    return false;
  }

  function findVideoEntries() {
    // Structural approach: find all elements with video links, then pair with date siblings
    const entries = [];
    const seen = new Set();

    // Find all elements that have or are video links
    const linkElements = document.querySelectorAll('a[href^="/watch"], a[href^="/shorts"]');
    
    for (const link of linkElements) {
      // Find the container - walk up to find a heading-like parent or use the link's parent
      let container = link.closest('[role="heading"]') || link.parentElement;
      
      // Skip if already seen
      if (seen.has(container)) continue;
      
      // Check if this container or its next sibling has date text
      let dateText = container.textContent || '';
      let nextSibling = container.nextElementSibling;
      
      // Check next few siblings for date (heading+group pattern)
      for (let i = 0; i < 3 && nextSibling; i++) {
        if (/\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(nextSibling.textContent || '')) {
          dateText = nextSibling.textContent || '';
          break;
        }
        nextSibling = nextSibling.nextElementSibling;
      }
      
      if (/\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(dateText)) {
        entries.push({ container, dateText, titleEl: link });
        seen.add(container);
      }
    }

    // Also include standard containers as fallback
    const standardContainers = document.querySelectorAll(CONTAINER_SELECTOR);
    for (const container of standardContainers) {
      if (seen.has(container)) continue;
      const link = container.querySelector('a[href^="/watch"], a[href^="/shorts"]');
      if (link) {
        entries.push({ container, dateText: container.textContent || '', titleEl: link });
        seen.add(container);
      }
    }

    return entries;
  }

  function scanPage() {
    if (!settings.applyEverywhere && (!isHomePage() || isSearchPage())) {
      return;
    }
    if (isDestroyed) return;
    const seenContainers = new Set();
    const hiddenContainers = new Set();

    // Get video entries using structural approach
    const entries = findVideoEntries();

    console.log('[YT Filter] scanPage found', entries.length, 'video entries');
    let processed = 0;
    for (const entry of entries) {
      if (isDestroyed) break;
      const container = entry.container;

      const ancestor = container.parentElement
        ? container.parentElement.closest(CONTAINER_SELECTOR)
        : null;
      if (ancestor) {
        continue;
      }

      if (seenContainers.has(container)) {
        continue;
      }

      seenContainers.add(container);
      processed++;

      if (computeHide(container)) {
        container.setAttribute('data-ytlf-hidden', 'true');
        // Also hide associated siblings for heading/group pattern
        const nextGroup = container.nextElementSibling;
        if (nextGroup && (nextGroup.tagName === 'GROUP' || /\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(nextGroup.textContent || ''))) {
          nextGroup.setAttribute('data-ytlf-hidden', 'true');
        }
        hiddenContainers.add(container);
      } else {
        container.removeAttribute('data-ytlf-hidden');
        const nextGroup = container.nextElementSibling;
        if (nextGroup && (nextGroup.tagName === 'GROUP' || /\d+\s*(секунд|секунды|секунда|мин|минут|минуты|час|часа|часов|ч\.|д\.|дн|дня|дней|нед|недели|недель|мес|месяца|месяцев|г\.|лет|года|год|seconds|minutes|hours|days|weeks|months|years)\s*(назад|ago)/i.test(nextGroup.textContent || ''))) {
          nextGroup.removeAttribute('data-ytlf-hidden');
        }
      }
    }
    console.log('[YT Filter] scanPage processed', processed, 'unique containers, hidden:', hiddenContainers.size);

    updateStatus(hiddenContainers.size, seenContainers.size);
    hideShelfContainers();
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
      console.log('[YT Filter] computeHide recency check: age=', age, 'container=', container.tagName);
      if (age !== null) {
        const minAge = recencyToSeconds('min');
        const maxAge = recencyToSeconds('max');
        console.log('[YT Filter] computeHide recency range: minAge=', minAge, 'maxAge=', maxAge);
        if (age < minAge || age > maxAge) {
          console.log('[YT Filter] computeHide: HIDING by recency (age:', age, 'not in range', minAge, '-', maxAge, ')');
          return true;
        }
      } else {
        console.log('[YT Filter] computeHide: age is null, not hiding by recency');
      }
    }

    if (settings.jamEnabled && isJamItem(container)) {
      return true;
    }

    if (settings.shelfEnabled && isShelfItem(container)) {
      return true;
    }

    return false;
  }

  function isJamsCategorySelected() {
    const tabs = document.querySelectorAll('tp-yt-tab[role="tab"], ytd-tab[role="tab"], [role="tab"]');
    for (const tab of tabs) {
      const text = (tab.textContent || '').trim();
      if (text === 'Джемы' && (tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('selected'))) {
        return true;
      }
    }
    return false;
  }

  function isJamItem(container) {
    if (isJamsCategorySelected()) {
      return false;
    }

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

  function isShelfContainer(element) {
    // Check if this element is a shelf container we want to hide
    if (!element.matches('ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer')) {
      return false;
    }

    const text = (element.textContent || '').toLowerCase();

    // Check for "Shorts" shelf - look for ytd-reel-item-renderer inside or heading "Shorts"
    const hasShorts = element.querySelector('ytd-reel-item-renderer') ||
      element.querySelector('ytd-reel-video-renderer') ||
      text.includes('shorts');

    // Check for "Ещё темы" shelf
    const hasMoreThemes = /ещё темы|еще темы/i.test(text);

    // Check for "Самые актуальные" shelf
    const hasMostRelevant = /самые актуальные|most relevant/i.test(text);

    // Check for other recommendation shelves (topic shelves, etc.)
    const hasChips = element.querySelector('ytd-chips-shelf-with-video-shelf-renderer');

    return hasShorts || hasMoreThemes || hasMostRelevant || hasChips;
  }

  function hideShelfContainers() {
    if (!settings.shelfEnabled) return;

    // Don't hide shelves on search page - they are part of search results
    // Don't hide shelves on watch page - recommended videos are not "shelves" to hide
    if (isSearchPage() || isWatchPage()) return;

    const shelfSelectors = 'ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer';
    const shelves = document.querySelectorAll(shelfSelectors);

    for (const shelf of shelves) {
      if (isShelfContainer(shelf)) {
        // Hide the shelf container
        shelf.setAttribute('data-ytlf-hidden', 'true');

        // Also hide the preceding header (h2, h3, etc.) that belongs to this shelf
        let prev = shelf.previousElementSibling;
        while (prev) {
          // Stop if we hit another shelf container or a video item
          if (prev.matches('ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer')) {
            break;
          }
          // Hide heading elements that are likely shelf headers
          if (prev.matches('h1, h2, h3, h4, h5, h6, ytd-section-header-renderer, yt-section-header-view-model')) {
            prev.setAttribute('data-ytlf-hidden', 'true');
            break;
          }
          // Also hide button "Ещё" that might be next to header
          if (prev.matches('button[aria-label*="Ещё"], button[aria-label*="More"]')) {
            prev.setAttribute('data-ytlf-hidden', 'true');
          }
          prev = prev.previousElementSibling;
        }
      } else {
        shelf.removeAttribute('data-ytlf-hidden');
        // Also unhide any headers we might have hidden
        let prev = shelf.previousElementSibling;
        while (prev) {
          if (prev.matches('ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer')) {
            break;
          }
          if (prev.matches('h1, h2, h3, h4, h5, h6, ytd-section-header-renderer, yt-section-header-view-model, button[aria-label*="Ещё"], button[aria-label*="More"]')) {
            prev.removeAttribute('data-ytlf-hidden');
          }
          prev = prev.previousElementSibling;
        }
      }
    }
  }

  function isShelfItem(container) {
    // This is now only used for video items inside shelves
    // We check if the video item is inside a shelf container that should be hidden
    const shelfSelectors = [
      'ytd-rich-section-renderer',
      'ytd-rich-shelf-renderer',
      'ytd-shelf-renderer',
      'ytd-item-section-renderer',
    ];

    for (const selector of shelfSelectors) {
      const shelf = container.closest(selector);
      if (shelf && isShelfContainer(shelf)) {
        return true;
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
    // Try specific metadata elements first
    const nodes = container.querySelectorAll('#published-time-text, #metadata-line, ytd-video-meta-block, ytd-video-metadata-block, .ytd-video-meta-block, #byline-container, .ytd-video-meta-block, ytd-grid-video-renderer #metadata-line, ytd-rich-item-renderer #metadata-line, .ytd-video-renderer #metadata-line');
    let text = '';
    for (const node of nodes) {
      text += ' ' + (node.textContent || '');
    }
    // Fallback to container text content
    if (!text.trim()) {
      text = container.textContent || '';
    }
    // Subscriptions page: heading + group pattern - check siblings (for actual H3/H2/GROUP tags)
    if ((container.tagName === 'H3' || container.tagName === 'H2') && !text.trim()) {
      const nextGroup = container.nextElementSibling;
      if (nextGroup && nextGroup.tagName === 'GROUP') {
        text = nextGroup.textContent || '';
      }
    }
    // Subscriptions page: group element - check previous sibling heading
    if (container.tagName === 'GROUP' && !text.trim()) {
      const prevHeading = container.previousElementSibling;
      if (prevHeading && (prevHeading.tagName === 'H3' || prevHeading.tagName === 'H2')) {
        text = prevHeading.textContent + ' ' + (container.textContent || '');
      }
    }
    // For YouTube component containers (ytd-rich-grid-media, ytd-rich-grid-row, etc.)
    // Use full text content which should contain the date
    const result = parseAgeText(text);
    // Find video title for debugging
    let title = '';
    if (container.tagName === 'H3' || container.tagName === 'H2') {
      const link = container.querySelector('a');
      if (link) title = link.textContent.trim().substring(0, 50);
    } else if (container.tagName === 'GROUP') {
      const prevHeading = container.previousElementSibling;
      if (prevHeading && (prevHeading.tagName === 'H3' || prevHeading.tagName === 'H2')) {
        const link = prevHeading.querySelector('a');
        if (link) title = link.textContent.trim().substring(0, 50);
      }
    } else {
      // For YouTube component containers, find the video title link
      const titleEl = container.querySelector('h3 a, #video-title, .ytd-video-renderer h3 a, a[href^="/watch"], a[href^="/shorts"]');
      if (titleEl) title = titleEl.textContent.trim().substring(0, 50);
    }
    console.log('[YT Filter] readAgeSeconds container:', container.tagName, 'class:', container.className, 'title:', title, 'text sample:', text.substring(0, 100), 'result:', result);
    return result;
  }

  function parseAgeText(text) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();

    if (/сейчас|только что|just now/i.test(normalized)) {
      return 0;
    }

    const unitWords = Object.keys(RECENCY_WORD_TO_UNIT);
    const unitAlt = unitWords.slice().sort((a, b) => b.length - a.length).join('|');
    // Match time ago patterns - allow punctuation between unit and "назад"
    const relRegex = new RegExp('(\\d+)\\s*(' + unitAlt + ')\\s*[.]*\\s*(назад|ago)', 'ig');
    let relMatch;
    let lastMatch = null;
    // Find the LAST match (in case there are view counts like "210 тыс" before the date)
    while ((relMatch = relRegex.exec(normalized)) !== null) {
      lastMatch = relMatch;
    }
    if (lastMatch) {
      const amount = Number.parseInt(lastMatch[1], 10);
      const unitKey = RECENCY_WORD_TO_UNIT[String(lastMatch[2]).toLowerCase()];
      console.log('[YT Filter] parseAgeText match:', lastMatch[0], 'amount:', amount, 'unit:', lastMatch[2], 'unitKey:', unitKey);
      if (Number.isFinite(amount) && unitKey && RECENCY_UNITS[unitKey]) {
        const result = amount * RECENCY_UNITS[unitKey];
        console.log('[YT Filter] parseAgeText result:', result, 'seconds');
        return result;
      }
    }

    const absolute = parseAbsoluteDate(normalized);
    if (absolute !== null) {
      const age = (Date.now() - absolute) / 1000;
      if (age >= 0) {
        console.log('[YT Filter] parseAgeText absolute date result:', age, 'seconds');
        return age;
      }
    }

    console.log('[YT Filter] parseAgeText no match for:', normalized.substring(0, 200));
    return null;
  }

  function parseAbsoluteDate(text) {
    const ruMonths = {
      янв: 1, фев: 2, мар: 3, апр: 4, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
      января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8,
      сентября: 9, октября: 10, ноября: 11, декабря: 12,
    };

    // Match "Дата премьеры: 09.10.2026, 17:00" or "09.10.2026"
    const numericDateMatch = text.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/);
    if (numericDateMatch) {
      const day = Number(numericDateMatch[1]);
      const month = Number(numericDateMatch[2]) - 1;
      const year = Number(numericDateMatch[3]);
      const ts = Date.UTC(year, month, day);
      if (!Number.isNaN(ts)) {
        return ts;
      }
    }

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
      const result = value * RECENCY_UNITS[settings.recencyMinUnit];
      console.log('[YT Filter] recencyToSeconds min:', value, settings.recencyMinUnit, '=', result, 'RECENCY_UNITS[min]:', RECENCY_UNITS[settings.recencyMinUnit]);
      return result;
    }

    const value = settings.recencyMaxValue;
    if (!value || value <= 0) {
      console.log('[YT Filter] recencyToSeconds max: Infinity (value <= 0), value:', value, 'unit:', settings.recencyMaxUnit);
      return Infinity;
    }
    const result = value * RECENCY_UNITS[settings.recencyMaxUnit];
    console.log('[YT Filter] recencyToSeconds max:', value, settings.recencyMaxUnit, '=', result, 'RECENCY_UNITS[max]:', RECENCY_UNITS[settings.recencyMaxUnit]);
    return result;
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

    console.log('[YT Filter] updateRecency', kind, 'value:', value, 'unit.value:', unit.value, 'unit:', unit);

    if (kind === 'min') {
      settings.recencyMinValue = value;
      settings.recencyMinUnit = unit.value;
    } else {
      settings.recencyMaxValue = value;
      settings.recencyMaxUnit = unit.value;
    }

    console.log('[YT Filter] updateRecency saved:', kind, settings.recencyMaxValue, settings.recencyMaxUnit);

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

    ui.applyEverywhereEnabled.checked = settings.applyEverywhere;
    ui.durationEnabled.checked = settings.durationEnabled;
    ui.recencyEnabled.checked = settings.recencyEnabled;
    ui.jamEnabled.checked = settings.jamEnabled;
    ui.shelfEnabled.checked = settings.shelfEnabled;
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
    const shelfState = settings.shelfEnabled ? 'вкл' : 'выкл';
    const applyEverywhereState = settings.applyEverywhere ? 'вкл' : 'выкл';
    ui.status.textContent =
      `Применять везде: ${applyEverywhereState}. Длительность: ${durationState}. Новизна: ${recencyState}. Джемы: ${jamState}. Полки: ${shelfState}. ` +
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

  function attachTooltip(row, tooltip) {
    let timer = 0;
    const show = () => tooltip.classList.add('ytlf-tooltip-visible');
    const hide = () => {
      window.clearTimeout(timer);
      tooltip.classList.remove('ytlf-tooltip-visible');
    };

    row.addEventListener('mouseenter', () => {
      timer = window.setTimeout(show, 450);
    });
    row.addEventListener('mouseleave', hide);
  }
})();
