// ==UserScript==
// @name         X.com Feed Filter
// @namespace    https://github.com/local/x-feed-filter
// @version      1.3.8
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

    const SCRIPT_VERSION = '1.3.8';
    const STORAGE_KEY = 'x-feed-filter-settings-v1';
    const POST_SELECTOR = 'article[data-testid="tweet"], article[role="article"]';
    const AUTHOR_NAME_SELECTOR = '[data-testid="User-Name"]';
    const VERIFIED_BADGE_SELECTOR = [
      '[data-testid^="icon-verified"]',
      'img[alt*="Verified" i]',
      'svg[aria-label*="Verified" i]',
      'img[alt*="Подлинная"]',
      'svg[aria-label*="Подлинная"]',
      'img[alt*="вериф" i]',
      'svg[aria-label*="вериф" i]',
    ].join(',');

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

    const NAV_MENU_ITEMS = [
        { setting: 'hideMenuHome', label: 'Главная', selector: '[data-testid="AppTabBar_Home_Link"]' },
        { setting: 'hideMenuExplore', label: 'Обзор', selector: '[data-testid="AppTabBar_Explore_Link"]' },
        { setting: 'hideMenuNotifications', label: 'Уведомления', selector: '[data-testid="AppTabBar_Notifications_Link"]' },
        { setting: 'hideMenuChat', label: 'Чат', selector: '[data-testid="AppTabBar_DirectMessage_Link"]' },
        { setting: 'hideMenuCalls', label: 'Звонки', selector: '[data-testid="AppTabBar_Calls_Link"]' },
        { setting: 'hideMenuGrok', label: 'Grok', selector: 'a[href="/i/grok"]' },
        { setting: 'hideMenuHistory', label: 'История', selector: 'a[href="/i/history"]' },
        { setting: 'hideMenuCreatorStudio', label: 'Творческая студия', selector: 'a[href="/i/jf/creators/studio"]' },
        { setting: 'hideMenuPremium', label: 'Premium', selector: '[data-testid="premium-signup-tab"]' },
        { setting: 'hideMenuProfile', label: 'Профиль', selector: '[data-testid="AppTabBar_Profile_Link"]' },
        { setting: 'hideMenuMore', label: 'Ещё', selector: '[data-testid="AppTabBar_More_Menu"]' },
    ];

    const POST_ACTION_SHORTCUTS = [
        {
            setting: 'showPostDislikeButton',
            name: 'dislike',
            actionType: 'dislike',
            ariaLabel: 'Мне не интересна эта публикация',
            paths: [
                { d: 'M12 13.6c1.64-.013 3.278.76 4.284 2.02.114.14.218.282.317.43l-1.202.9c-.088-.102-.177-.197-.272-.289-.844-.823-1.98-1.264-3.125-1.26-1.146-.002-2.282.441-3.129 1.263-.095.092-.185.186-.273.287l-1.2-.902c.1-.149.205-.29.319-.429C8.728 14.364 10.36 13.59 12 13.6zM9.25 8c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9zm5.5 0c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9z' },
                { d: 'M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z', clipRule: 'evenodd', fillRule: 'evenodd' },
            ],
        },
        {
            setting: 'showPostIgnoreButton',
            name: 'ignore',
            actionType: 'ignore',
            ariaLabel: 'Игнорировать',
            paths: [
                { d: 'M16 22h-2.35l-.275-.219-3.842-3.073 1.424-1.424L14 19.72v-5.477l2-2V22z' },
                { d: 'M16 6.586l4.293-4.293 1.414 1.414-18 18-1.414-1.414 2.657-2.658C3.795 17.063 3 15.875 3 14.5v-5C3 7.567 4.567 6 6.5 6h2.148l4.727-3.781.274-.219H16v4.586zM9.625 7.78L9.351 8H6.5C5.672 8 5 8.672 5 9.5v5c0 .828.672 1.5 1.5 1.5h.086L14 8.586V4.28l-4.375 3.5z', clipRule: 'evenodd', fillRule: 'evenodd' },
            ],
        },
        {
            setting: 'showPostBlacklistButton',
            name: 'blacklist',
            actionType: 'blacklist',
            ariaLabel: 'Внести в черный список',
            paths: [
                { d: 'M12 3.75c-4.55 0-8.25 3.69-8.25 8.25 0 1.92.66 3.68 1.75 5.08L17.09 5.5C15.68 4.4 13.92 3.75 12 3.75zm6.5 3.17L6.92 18.5c1.4 1.1 3.16 1.75 5.08 1.75 4.56 0 8.25-3.69 8.25-8.25 0-1.92-.65-3.68-1.75-5.08zM1.75 12C1.75 6.34 6.34 1.75 12 1.75S22.25 6.34 22.25 12 17.66 22.25 12 22.25 1.75 17.66 1.75 12z' },
            ],
        },
    ];

    const FLOATING_BUTTONS = [
        {
            setting: 'hideFloatingGrok',
            buttonSelector: 'button[data-testid="GrokDrawerHeader"]',
            containerSelector: '[data-testid="GrokDrawer"]',
        },
        {
            setting: 'hideFloatingChat',
            buttonSelector: 'button[data-testid="chat-drawer-main"]',
            containerSelector: '[data-testid="chat-drawer-root"]',
        },
    ];

    const DEFAULT_SETTINGS = {
        ...Object.fromEntries(NAV_MENU_ITEMS.map(({ setting }) => [setting, false])),
        recencyEnabled: false,
        hideVerified: false,
        hideVerifiedReplies: false,
        hideVerifiedUseDB: false,
        hideVerifiedDBOnlyExceptions: false,
        hideVerifiedNotInterested: false,
        hidePremium: false,
        hideWhatsHappening: false,
        hideWhoToFollow: false,
        hideWhoToFollowFeed: false,
        hidePureRetweets: false,
        hidePureRetweetsNotInterested: false,
        hideReplies: false,
        feedKeyboardNavigationEnabled: false,
        hideFloatingGrok: false,
        hideFloatingChat: false,
        hidePostGrokButton: false,
        showPostDislikeButton: false,
        showPostIgnoreButton: false,
        showPostBlacklistButton: false,
        nameFilterEnabled: false,
        nameFilterNotInterested: false,
        nameFilterIncludeReplies: false,
        nameFilterKeywords: '',
        contentFilterEnabled: false,
        contentFilterNotInterested: false,
        contentFilterIncludeReplies: false,
        contentFilterKeywords: '',
        tab: 'recency',
        subtab: 'posts-verified',
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
  let observerTarget = null;
  let irritantObserver = null;
  let irritantObserverTarget = null;
  let irritantObserverTimer = 0;
  let irritantRetryTimer = 0;
  let menuButtonPlacementTimer = 0;
  let postUiSyncTimer = 0;
  let ui = null;
  let isDestroyed = false;
  const notInterestedQueue = [];
  let notInterestedInProgress = false;
  let notInterestedMenuObserver = null;
  let notInterestedMenuTimeout = 0;
  let notInterestedFeedbackObserver = null;
  let notInterestedFeedbackTimeout = 0;
  let postActionMenuObserver = null;
  let postActionMenuTimeout = 0;
  let postActionConfirmationObserver = null;
  let postActionConfirmationTimeout = 0;
  let userScrollIntentVersion = 0;
  let keyboardNavigationPost = null;
    let directNotInterestedStrategyRegistered = false;
    let lastHiddenPostCount = 0;
    let lastTotalPostCount = 0;

  boot();

  function destroy() {
    isDestroyed = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observerTarget = null;
    if (irritantObserver) {
      irritantObserver.disconnect();
      irritantObserver = null;
    }
    irritantObserverTarget = null;
    window.clearTimeout(irritantObserverTimer);
    window.clearTimeout(irritantRetryTimer);
    window.clearTimeout(menuButtonPlacementTimer);
    window.clearTimeout(postUiSyncTimer);
    if (notInterestedMenuObserver) {
      notInterestedMenuObserver.disconnect();
      notInterestedMenuObserver = null;
    }
    window.clearTimeout(notInterestedMenuTimeout);
    if (notInterestedFeedbackObserver) {
      notInterestedFeedbackObserver.disconnect();
      notInterestedFeedbackObserver = null;
    }
    window.clearTimeout(notInterestedFeedbackTimeout);
    if (postActionMenuObserver) {
      postActionMenuObserver.disconnect();
      postActionMenuObserver = null;
    }
    window.clearTimeout(postActionMenuTimeout);
    if (postActionConfirmationObserver) {
      postActionConfirmationObserver.disconnect();
      postActionConfirmationObserver = null;
    }
    window.clearTimeout(postActionConfirmationTimeout);
    notInterestedQueue.length = 0;
    window.clearTimeout(scanTimer);
    window.clearTimeout(scanDebounceTimer);
    window.removeEventListener('popstate', handleRouteChange, true);
    window.removeEventListener('load', scheduleScan, true);
    window.removeEventListener('wheel', recordUserScrollIntent, true);
    window.removeEventListener('touchstart', recordUserScrollIntent, true);
    window.removeEventListener('touchmove', recordUserScrollIntent, true);
    window.removeEventListener('pointerdown', recordUserScrollIntent, true);
    window.removeEventListener('pointermove', recordUserScrollIntent, true);
    window.removeEventListener('keydown', recordUserScrollIntent, true);
    window.removeEventListener('keydown', handleFeedNavigationKeydown, true);
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
    startIrritantObserver();
    scheduleMenuButtonPlacementRetries();
    hideFloatingButtons();
    syncPostUiElements();
    scheduleIrritantRetries();
    scheduleScan();

    window.addEventListener('wheel', recordUserScrollIntent, { capture: true, passive: true });
    window.addEventListener('touchstart', recordUserScrollIntent, { capture: true, passive: true });
    window.addEventListener('touchmove', recordUserScrollIntent, { capture: true, passive: true });
    window.addEventListener('pointerdown', recordUserScrollIntent, true);
    window.addEventListener('pointermove', recordUserScrollIntent, true);
    window.addEventListener('keydown', recordUserScrollIntent, true);
    window.addEventListener('keydown', handleFeedNavigationKeydown, true);

    window.addEventListener('popstate', handleRouteChange, true);
    window.addEventListener('load', scheduleScan, true);
  }

  function handleRouteChange() {
    startObserver();
    startIrritantObserver();
    scheduleMenuButtonPlacementRetries();
    hideFloatingButtons();
    schedulePostUiSync();
    scheduleIrritantRetries();
    scheduleScan();
  }

  function recordUserScrollIntent(event) {
    if (event.type === 'pointermove' && event.buttons === 0) {
      return;
    }
    if (event.type !== 'keydown') {
      keyboardNavigationPost = null;
    }
    userScrollIntentVersion += 1;
  }

  function handleFeedNavigationKeydown(event) {
    if (!settings.feedKeyboardNavigationEnabled || !isHomePage()
      || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target
      || target.closest('input:not([type="checkbox"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="dialog"], [role="menu"]')) {
      return;
    }

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const actions = {
      ArrowUp: 'previous',
      ArrowDown: 'next',
      ArrowLeft: 'dislike',
      ArrowRight: 'like',
    };
    const wasdActions = {
      KeyW: 'previous',
      KeyS: 'next',
      KeyA: 'dislike',
      KeyD: 'like',
    };
    const action = actions[key] || wasdActions[event.code];
    if (!action) {
      return;
    }

    const posts = getKeyboardNavigablePosts();
    const anchorY = getFeedNavigationAnchorY();
    if (action === 'previous' || action === 'next') {
      const rememberedPost = keyboardNavigationPost?.isConnected && posts.includes(keyboardNavigationPost)
        ? keyboardNavigationPost
        : null;
      const nextPost = rememberedPost
        ? getAdjacentKeyboardNavigationPost(posts, rememberedPost, action)
        : getInitialKeyboardNavigationPost(posts, action, anchorY);
      if (!nextPost) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      keyboardNavigationPost = nextPost;
      alignPostToFeedNavigationAnchor(nextPost, anchorY);
      return;
    }

    const currentPost = getKeyboardNavigationPost(posts, anchorY);
    if (!currentPost) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    keyboardNavigationPost = currentPost;
    if (action === 'like') {
      const likeButton = currentPost.querySelector('[data-testid="like"], [data-testid="unlike"]');
      likeButton?.click();
      return;
    }

    clickNotInterested(currentPost);
  }

  function getKeyboardNavigablePosts() {
    const feedRoot = document.querySelector('main') || document;
    return Array.from(getPostElements(feedRoot)).filter((post) => {
      if (post.parentElement?.closest(POST_SELECTOR)) {
        return false;
      }
      const wrapper = getPostWrapper(post);
      if (wrapper?.hasAttribute('data-xff-hidden')) {
        return false;
      }
      const rect = post.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function getFeedNavigationAnchorY() {
    const main = document.querySelector('main');
    const tablist = Array.from(main?.querySelectorAll('[role="tablist"]') || []).find((element) => {
      const tabs = Array.from(element.querySelectorAll('[role="tab"]'))
        .map((tab) => (tab.innerText || tab.getAttribute('aria-label') || '').trim());
      const hasForYou = tabs.some((label) => /для вас|for you/i.test(label));
      const hasFollowing = tabs.some((label) => /читаю|following/i.test(label));
      return hasForYou && hasFollowing;
    });
    let anchorY = 0;
    const headerRect = tablist?.getBoundingClientRect();
    if (headerRect && headerRect.width > 0 && headerRect.bottom > 0) {
      anchorY = Math.max(anchorY, headerRect.bottom);
    }

    const newPostsIndicator = Array.from(document.querySelectorAll('[role="status"], [role="alert"]'))
      .find((element) => /смотреть новые посты|нов(?:ые|ых) посты|нов(?:ая|ые|ых) публикац|new posts?|added (?:a )?post|добавил[аи]? публикац/i
        .test((element.innerText || element.textContent || '').trim()));
    const indicatorRect = newPostsIndicator?.getBoundingClientRect();
    if (indicatorRect && indicatorRect.width > 0 && indicatorRect.height > 0
      && indicatorRect.bottom > 0 && indicatorRect.top < window.innerHeight) {
      anchorY = Math.max(anchorY, indicatorRect.bottom);
    }
    return anchorY;
  }

  function getKeyboardNavigationPost(posts, anchorY) {
    if (keyboardNavigationPost?.isConnected && posts.includes(keyboardNavigationPost)) {
      return keyboardNavigationPost;
    }
    keyboardNavigationPost = posts.find((post) => {
      const rect = post.getBoundingClientRect();
      return rect.top <= anchorY && rect.bottom > anchorY;
    }) || posts.find((post) => {
      const rect = post.getBoundingClientRect();
      return rect.top >= anchorY && rect.top < window.innerHeight;
    }) || null;
    return keyboardNavigationPost;
  }

  function getAdjacentKeyboardNavigationPost(posts, currentPost, direction) {
    const step = direction === 'next' ? 1 : -1;
    const currentIndex = posts.indexOf(currentPost);
    return currentIndex >= 0 ? posts[currentIndex + step] || null : null;
  }

  function getInitialKeyboardNavigationPost(posts, direction, anchorY) {
    const step = direction === 'next' ? 1 : -1;
    const crossingIndex = posts.findIndex((post) => {
      const rect = post.getBoundingClientRect();
      return rect.top <= anchorY && rect.bottom > anchorY;
    });
    if (crossingIndex >= 0) {
      return posts[crossingIndex + step] || null;
    }

    if (step > 0) {
      return posts.find((post) => post.getBoundingClientRect().top >= anchorY) || null;
    }

    for (let index = posts.length - 1; index >= 0; index -= 1) {
      if (posts[index].getBoundingClientRect().bottom <= anchorY) {
        return posts[index];
      }
    }
    return null;
  }

  function alignPostToFeedNavigationAnchor(post, anchorY) {
    const scrollRoot = document.scrollingElement;
    if (!scrollRoot || !post?.isConnected) {
      return;
    }
    const offset = post.getBoundingClientRect().top - anchorY;
    if (Math.abs(offset) > 0.5) {
      scrollRoot.scrollTop += offset;
    }
  }

  function loadSettings() {
    const saved = safeGetValue(STORAGE_KEY, null);
    console.log('[X Filter] loadSettings saved:', saved);
    if (!saved || typeof saved !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    const savedSettings = { ...DEFAULT_SETTINGS, ...saved };
    if (!Object.prototype.hasOwnProperty.call(saved, 'hideWhoToFollowFeed')) {
      savedSettings.hideWhoToFollowFeed = Boolean(saved.hideWhoToFollow);
    }
    const normalized = normalizeSettings(savedSettings);
    console.log('[X Filter] loadSettings normalized:', normalized);
    return normalized;
  }

  function normalizeSettings(value) {
    return {
      ...Object.fromEntries(NAV_MENU_ITEMS.map(({ setting }) => [setting, Boolean(value[setting])])),
      recencyEnabled: Boolean(value.recencyEnabled),
      hideVerified: Boolean(value.hideVerified),
      hideVerifiedReplies: Boolean(value.hideVerifiedReplies),
      hideVerifiedUseDB: Boolean(value.hideVerifiedUseDB),
      hideVerifiedDBOnlyExceptions: Boolean(value.hideVerifiedDBOnlyExceptions),
      hideVerifiedNotInterested: Boolean(value.hideVerifiedNotInterested),
      hidePremium: Boolean(value.hidePremium),
      hideWhatsHappening: Boolean(value.hideWhatsHappening),
      hideWhoToFollow: Boolean(value.hideWhoToFollow),
      hideWhoToFollowFeed: Boolean(value.hideWhoToFollowFeed),
      hidePureRetweets: Boolean(value.hidePureRetweets),
      hidePureRetweetsNotInterested: Boolean(value.hidePureRetweetsNotInterested),
      hideReplies: Boolean(value.hideReplies),
      feedKeyboardNavigationEnabled: Boolean(value.feedKeyboardNavigationEnabled),
      hideFloatingGrok: Boolean(value.hideFloatingGrok),
      hideFloatingChat: Boolean(value.hideFloatingChat),
      hidePostGrokButton: Boolean(value.hidePostGrokButton),
      showPostDislikeButton: Boolean(value.showPostDislikeButton),
      showPostIgnoreButton: Boolean(value.showPostIgnoreButton),
      showPostBlacklistButton: Boolean(value.showPostBlacklistButton),
      nameFilterEnabled: Boolean(value.nameFilterEnabled),
      nameFilterNotInterested: Boolean(value.nameFilterNotInterested),
      nameFilterIncludeReplies: Boolean(value.nameFilterIncludeReplies),
      nameFilterKeywords: typeof value.nameFilterKeywords === 'string' ? value.nameFilterKeywords : '',
      contentFilterEnabled: Boolean(value.contentFilterEnabled),
      contentFilterNotInterested: Boolean(value.contentFilterNotInterested),
      contentFilterIncludeReplies: Boolean(value.contentFilterIncludeReplies),
      contentFilterKeywords: typeof value.contentFilterKeywords === 'string' ? value.contentFilterKeywords : '',
      tab: ['recency', 'other', 'irritants', 'db'].includes(value.tab) ? value.tab : 'recency',
      subtab: [
        'posts-verified',
        'posts-names',
        'posts-content',
        'posts-other',
        'ui-floating',
        'ui-side-panels',
        'ui-menu-buttons',
        'ui-post-elements',
      ].includes(value.subtab) ? value.subtab : 'posts-verified',
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
      [data-xff-menu-hidden="true"] {
        display: none !important;
      }
      [data-xff-grok-action-hidden="true"] {
        display: none !important;
      }
      [data-xff-floating-button-hidden="true"] {
        display: none !important;
      }
      .xff-post-action-shortcut-container {
        display: flex !important;
        align-items: center !important;
        flex: 0 0 auto !important;
      }
      .xff-post-action-shortcut {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 20px !important;
        height: 20px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 9999px !important;
        background: transparent !important;
        color: rgb(83, 100, 113) !important;
        cursor: pointer !important;
        transition: background-color 120ms ease, color 120ms ease !important;
      }
      .xff-post-action-shortcut:hover,
      .xff-post-action-shortcut:focus-visible {
        background: rgba(29, 155, 240, 0.1) !important;
        color: rgb(29, 155, 240) !important;
      }
      .xff-post-action-shortcut:active {
        background: rgba(29, 155, 240, 0.18) !important;
      }
      .xff-post-action-shortcut svg {
        display: block !important;
        width: 18px !important;
        height: 18px !important;
        fill: currentColor !important;
      }
      @media (prefers-color-scheme: dark) {
        .xff-post-action-shortcut {
          color: rgb(113, 118, 123) !important;
        }
        .xff-post-action-shortcut:hover,
        .xff-post-action-shortcut:focus-visible {
          background: rgba(29, 155, 240, 0.18) !important;
          color: rgb(29, 155, 240) !important;
        }
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

  function schedulePostUiSync() {
    if (isDestroyed) {
      return;
    }
    window.clearTimeout(postUiSyncTimer);
    postUiSyncTimer = window.setTimeout(syncPostUiElements, 100);
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
    const tabIrritants = makeButton('xff-tab xff-tab-irritants', 'UI');
    const tabDb = makeButton('xff-tab xff-tab-db', 'БД');
    tabBar.append(tabRecency, tabOther, tabIrritants, tabDb);

    const tabDivider = makeElement('div', 'xff-tab-divider');
    const subtabBar = makeElement('div', 'xff-subtabs');
    const makeSubtabButton = (id, label, unimplemented = false) => {
      const subtabButton = makeButton(
        'xff-tab xff-subtab' + (unimplemented ? ' xff-unimplemented' : ''),
        label
      );
      subtabButton.dataset.subtab = id;
      subtabButton.addEventListener('click', () => setSubtab(id));
      return subtabButton;
    };
    const postSubtabs = makeElement('div', 'xff-subtab-group xff-post-subtabs');
    const postSubtabButtons = [
      makeSubtabButton('posts-verified', 'Галочники'),
      makeSubtabButton('posts-names', 'Имена'),
      makeSubtabButton('posts-content', 'Содержимое'),
      makeSubtabButton('posts-other', 'Прочее'),
    ];
    postSubtabs.append(...postSubtabButtons);
    const uiSubtabs = makeElement('div', 'xff-subtab-group xff-ui-subtabs');
    const uiSubtabButtons = [
      makeSubtabButton('ui-floating', 'Плавающие кнопки', true),
      makeSubtabButton('ui-side-panels', 'Панели справа'),
      makeSubtabButton('ui-menu-buttons', 'Кнопки меню', true),
      makeSubtabButton('ui-post-elements', 'Элементы постов'),
    ];
    uiSubtabs.append(...uiSubtabButtons);
    subtabBar.append(postSubtabs, uiSubtabs);

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

    const hideVerifiedDBOnlyExceptionsSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const hideVerifiedDBOnlyExceptions = makeElement('input', 'xff-hide-verified-db-only-exceptions');
    hideVerifiedDBOnlyExceptions.type = 'checkbox';
    hideVerifiedDBOnlyExceptionsSwitch.append(hideVerifiedDBOnlyExceptions, makeElement('span', '', 'Только исключения'));

    const hidePremiumSwitch = makeElement('label', 'xff-switch');
    const hidePremium = makeElement('input', 'xff-hide-premium');
    hidePremium.type = 'checkbox';
    hidePremiumSwitch.append(hidePremium, makeElement('span', '', 'Реклама Premium'));

    const hideWhatsHappeningSwitch = makeElement('label', 'xff-switch');
    const hideWhatsHappening = makeElement('input', 'xff-hide-whats-happening');
    hideWhatsHappening.type = 'checkbox';
    hideWhatsHappeningSwitch.append(hideWhatsHappening, makeElement('span', '', 'Что происходит'));

    const hideWhoToFollowSwitch = makeElement('label', 'xff-switch');
    const hideWhoToFollow = makeElement('input', 'xff-hide-who-to-follow');
    hideWhoToFollow.type = 'checkbox';
    hideWhoToFollowSwitch.append(hideWhoToFollow, makeElement('span', '', 'Кого читать'));

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

    const postVerifiedPanel = makeElement('div', 'xff-subtab-panel xff-post-verified-panel');
    postVerifiedPanel.append(hideVerifiedSwitch, hideVerifiedRepliesSwitch, hideVerifiedNotInterestedSwitch, hideVerifiedUseDBSwitch, hideVerifiedDBOnlyExceptionsSwitch);
    const postNamesPanel = makeElement('div', 'xff-subtab-panel xff-post-names-panel');
    postNamesPanel.append(nameFilterSwitch, nameFilterKeywordsField, nameFilterNotInterestedSwitch, nameFilterIncludeRepliesSwitch);
    const postContentPanel = makeElement('div', 'xff-subtab-panel xff-post-content-panel');
    const blacklistSwitch = makeElement('label', 'xff-switch');
    const blacklistEnabled = makeElement('input', 'xff-content-filter-enabled');
    blacklistEnabled.type = 'checkbox';
    blacklistSwitch.append(blacklistEnabled, makeElement('span', '', 'Чёрный список слов'));

    const blacklistKeywordsField = makeElement('label', 'xff-name-filter-field');
    const blacklistKeywordsCaption = makeElement('span', '', 'Запрещённые слова (через запятую)');
    const blacklistKeywordsInput = makeElement('input', 'xff-content-filter-keywords');
    blacklistKeywordsInput.type = 'text';
    blacklistKeywordsInput.placeholder = 'слово, фраза, эмодзи';
    blacklistKeywordsInput.autocomplete = 'off';
    blacklistKeywordsInput.spellcheck = false;
    blacklistKeywordsField.append(blacklistKeywordsCaption, blacklistKeywordsInput);

    const blacklistNotInterestedSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const blacklistNotInterested = makeElement('input', 'xff-content-filter-not-interested');
    blacklistNotInterested.type = 'checkbox';
    blacklistNotInterestedSwitch.append(blacklistNotInterested, makeElement('span', '', 'Прожимать "Не интересно"'));

    const blacklistIncludeRepliesSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const blacklistIncludeReplies = makeElement('input', 'xff-content-filter-include-replies');
    blacklistIncludeReplies.type = 'checkbox';
    blacklistIncludeRepliesSwitch.append(blacklistIncludeReplies, makeElement('span', '', 'Также учитывать ответы'));
    postContentPanel.append(blacklistSwitch, blacklistKeywordsField, blacklistNotInterestedSwitch, blacklistIncludeRepliesSwitch);

    const postOtherPanel = makeElement('div', 'xff-subtab-panel xff-post-other-panel');

    const retweetsOnlySwitch = makeElement('label', 'xff-switch xff-switch-parent');
    const retweetsOnly = makeElement('input', 'xff-hide-pure-retweets');
    retweetsOnly.type = 'checkbox';
    retweetsOnlySwitch.append(retweetsOnly, makeElement('span', '', 'Скрывать чисто репосты'));

    const retweetsNotInterestedSwitch = makeElement('label', 'xff-switch xff-switch-child');
    const retweetsNotInterested = makeElement('input', 'xff-hide-pure-retweets-not-interested');
    retweetsNotInterested.type = 'checkbox';
    retweetsNotInterestedSwitch.append(retweetsNotInterested, makeElement('span', '', 'Прожимать «Не интересно»'));

    const hideViewedSwitch = makeElement('label', 'xff-switch xff-unimplemented');
    const hideViewed = makeElement('input', 'xff-unimplemented-control');
    hideViewed.type = 'checkbox';
    hideViewed.disabled = true;
    hideViewedSwitch.append(hideViewed, makeElement('span', '', 'Скрывать просмотренные'));

    const hideRepliesSwitch = makeElement('label', 'xff-switch');
    const hideReplies = makeElement('input', 'xff-hide-replies');
    hideReplies.type = 'checkbox';
    hideRepliesSwitch.append(hideReplies, makeElement('span', '', 'Скрывать посты-ответы'));

    const hideWhoToFollowFeedSwitch = makeElement('label', 'xff-switch');
    const hideWhoToFollowFeed = makeElement('input', 'xff-hide-who-to-follow-feed');
    hideWhoToFollowFeed.type = 'checkbox';
    hideWhoToFollowFeedSwitch.append(hideWhoToFollowFeed, makeElement('span', '', 'Скрывать Who to follow'));

    const feedKeyboardNavigationSwitch = makeElement('label', 'xff-switch xff-feed-keyboard-navigation-switch');
    const feedKeyboardNavigation = makeElement('input', 'xff-feed-keyboard-navigation');
    feedKeyboardNavigation.type = 'checkbox';
    const feedKeyboardNavigationText = makeElement('span', '', 'Навигация на стрелочки');
    const feedKeyboardNavigationHelp = makeElement('span', 'xff-help-tooltip', '?');
    const feedKeyboardNavigationHelpText = '[↑] Предыдущий пост\n[↓] Следующий пост\n[←] Не интересно\n[→] Лайк\nТакже поддерживает WASD';
    feedKeyboardNavigationHelp.setAttribute('title', feedKeyboardNavigationHelpText);
    feedKeyboardNavigationHelp.setAttribute('tabindex', '0');
    feedKeyboardNavigationHelp.setAttribute('role', 'img');
    feedKeyboardNavigationHelp.setAttribute('aria-label', feedKeyboardNavigationHelpText.replace(/\n/g, '. '));
    feedKeyboardNavigationHelp.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    feedKeyboardNavigationSwitch.append(feedKeyboardNavigation, feedKeyboardNavigationText, feedKeyboardNavigationHelp);

    postOtherPanel.append(
      retweetsOnlySwitch,
      retweetsNotInterestedSwitch,
      hideViewedSwitch,
      hideRepliesSwitch,
      hideWhoToFollowFeedSwitch,
      feedKeyboardNavigationSwitch
    );
    otherTab.append(postVerifiedPanel, postNamesPanel, postContentPanel, postOtherPanel);

    const uiFloatingPanel = makeElement('div', 'xff-subtab-panel xff-ui-floating-panel');
    const uiSidePanelsPanel = makeElement('div', 'xff-subtab-panel xff-ui-side-panels-panel');
    const uiMenuButtonsPanel = makeElement('div', 'xff-subtab-panel xff-ui-menu-buttons-panel');
    const uiPostElementsPanel = makeElement('div', 'xff-subtab-panel xff-ui-post-elements-panel');

    const makeUnavailableSwitch = (label, nested = false) => {
      const option = makeElement(
        'label',
        'xff-switch xff-unimplemented' + (nested ? ' xff-switch-child' : '')
      );
      const checkbox = makeElement('input', 'xff-unimplemented-control');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      option.append(checkbox, makeElement('span', '', label));
      return option;
    };
    const makeUnavailableNote = (text, section = false) => makeElement(
      'div',
      'xff-unimplemented-note' + (section ? ' xff-unimplemented-section-title' : ''),
      text
    );

    const floatingButtonCheckboxes = {};
    const makeFloatingButtonSwitch = (setting, label) => {
      const option = makeElement('label', 'xff-switch');
      const checkbox = makeElement('input', `xff-${setting}`);
      checkbox.type = 'checkbox';
      option.append(checkbox, makeElement('span', '', label));
      floatingButtonCheckboxes[setting] = checkbox;
      return option;
    };

    uiSidePanelsPanel.append(
      makeUnavailableNote('Скрывать следующие панели:'),
      hidePremiumSwitch,
      hideWhatsHappeningSwitch,
      hideWhoToFollowSwitch
    );

    uiFloatingPanel.append(
      makeUnavailableNote('Скрывать следующие кнопки:'),
      makeFloatingButtonSwitch('hideFloatingGrok', 'Grok'),
      makeFloatingButtonSwitch('hideFloatingChat', 'Чат')
    );

    const menuItemCheckboxes = {};
    uiMenuButtonsPanel.append(makeUnavailableNote('Скрывать следующие пункты меню:'));
    NAV_MENU_ITEMS.forEach(({ setting, label }) => {
      const option = makeElement('label', 'xff-switch');
      const checkbox = makeElement('input', `xff-${setting}`);
      checkbox.type = 'checkbox';
      option.append(checkbox, makeElement('span', '', label));
      menuItemCheckboxes[setting] = checkbox;
      uiMenuButtonsPanel.append(option);
    });
    uiMenuButtonsPanel.append(
      makeUnavailableNote('Другие опции', true),
      makeUnavailableSwitch('Изменить иконку История')
    );

    const postElementCheckboxes = {};
    const makePostElementSwitch = (setting, label, remainsUnimplemented = false) => {
      const option = makeElement('label', 'xff-switch' + (remainsUnimplemented ? ' xff-unimplemented' : ''));
      const checkbox = makeElement('input', `xff-${setting}`);
      checkbox.type = 'checkbox';
      option.append(checkbox, makeElement('span', '', label));
      postElementCheckboxes[setting] = checkbox;
      return option;
    };
    uiPostElementsPanel.append(
      makeUnavailableNote('Скрывать следующие кнопки:'),
      makePostElementSwitch('hidePostGrokButton', 'Кнопка Grok'),
      makeUnavailableNote('Добавить следующие кнопки:'),
      makePostElementSwitch('showPostDislikeButton', 'Дизлайк'),
      makePostElementSwitch('showPostIgnoreButton', 'Игнор'),
      makePostElementSwitch('showPostBlacklistButton', 'Чёрный список')
    );
    irritantsTab.append(uiFloatingPanel, uiSidePanelsPanel, uiMenuButtonsPanel, uiPostElementsPanel);

    const status = makeElement('div', 'xff-status');

    const dbClearBtn = makeButton('xff-db-clear', 'Очистить базу');
    const dbClearExceptBtn = makeButton('xff-db-clear-except xff-unimplemented', 'Очистить кроме исключений');
    dbClearExceptBtn.disabled = true;
    const dbSearchField = makeElement('label', 'xff-db-search-field xff-unimplemented');
    dbSearchField.append(makeElement('span', '', 'Поиск'));
    const dbSearch = makeElement('input', 'xff-db-search');
    dbSearch.type = 'search';
    dbSearch.placeholder = 'Поиск';
    dbSearch.disabled = true;
    dbSearchField.append(dbSearch);
    const dbTable = makeElement('table', 'xff-db-table');
    const dbThead = makeElement('thead');
    const dbTrHead = makeElement('tr');
    const dbThNick = makeElement('th', 'xff-db-th-nick', 'Ник');
    const dbThAction = makeElement('th', 'xff-db-th-action', 'Действие');
    const dbTbody = makeElement('tbody', 'xff-db-tbody');
    dbTrHead.append(dbThNick, dbThAction);
    dbThead.append(dbTrHead);
    dbTable.append(dbThead, dbTbody);

    const dbExtraActions = makeElement('div', 'xff-db-extra-actions');
    const dbExportBtn = makeButton('xff-db-extra-button xff-unimplemented', 'Экспорт');
    const dbImportBtn = makeButton('xff-db-extra-button xff-unimplemented', 'Импорт');
    dbExportBtn.disabled = true;
    dbImportBtn.disabled = true;
    dbExtraActions.append(dbExportBtn, dbImportBtn);
    dbTab.append(dbClearBtn, dbClearExceptBtn, dbSearchField, dbTable, dbExtraActions);

    panel.append(topRow, tabBar, tabDivider, subtabBar, recencyTab, otherTab, irritantsTab, dbTab, status);
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
      subtabBar,
      postSubtabs,
      uiSubtabs,
      postSubtabButtons,
      uiSubtabButtons,
      postPanels: [
        { id: 'posts-verified', element: postVerifiedPanel },
        { id: 'posts-names', element: postNamesPanel },
        { id: 'posts-content', element: postContentPanel },
        { id: 'posts-other', element: postOtherPanel },
      ],
      uiPanels: [
        { id: 'ui-floating', element: uiFloatingPanel },
        { id: 'ui-side-panels', element: uiSidePanelsPanel },
        { id: 'ui-menu-buttons', element: uiMenuButtonsPanel },
        { id: 'ui-post-elements', element: uiPostElementsPanel },
      ],
      recencyTab,
      otherTab,
      irritantsTab,
      dbTab,
      recencyEnabled,
      hideVerified,
      hideVerifiedReplies,
      hideVerifiedNotInterested,
      hideVerifiedUseDB,
      hideVerifiedDBOnlyExceptions,
      hidePremium,
      hideWhatsHappening,
      hideWhoToFollow,
      hideWhoToFollowFeed,
      hidePureRetweets: retweetsOnly,
      hidePureRetweetsNotInterested: retweetsNotInterested,
      hideReplies,
      feedKeyboardNavigation,
      nameFilterEnabled,
      nameFilterKeywordsInput,
      nameFilterNotInterested,
      nameFilterIncludeReplies,
      contentFilterEnabled: blacklistEnabled,
      contentFilterKeywordsInput: blacklistKeywordsInput,
      contentFilterNotInterested: blacklistNotInterested,
      contentFilterIncludeReplies: blacklistIncludeReplies,
      recencyMinInput: recencyMinField.input,
      recencyMinUnit: recencyMinField.select,
      recencyMaxInput: recencyMaxField.input,
      recencyMaxUnit: recencyMaxField.select,
      status,
      presetSelect,
      dbClearBtn,
      dbTbody,
      menuItemCheckboxes,
      postElementCheckboxes,
      floatingButtonCheckboxes,
    };

    ui.button.addEventListener('click', () => setPanelOpen(!settings.panelOpen));
    ui.close.addEventListener('click', () => setPanelOpen(false));
    ui.tabRecency.addEventListener('click', () => setTab('recency'));
    ui.tabOther.addEventListener('click', () => setTab('other'));
    ui.tabIrritants.addEventListener('click', () => setTab('irritants'));
    ui.tabDb.addEventListener('click', () => setTab('db'));

    Object.entries(ui.menuItemCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.addEventListener('change', () => {
        settings[setting] = checkbox.checked;
        saveSettings();
        renderUi();
        hideNavigationMenuItems();
      });
    });

    Object.entries(ui.postElementCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.addEventListener('change', () => {
        settings[setting] = checkbox.checked;
        saveSettings();
        renderUi();
        syncPostUiElements();
      });
    });

    Object.entries(ui.floatingButtonCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.addEventListener('change', () => {
        settings[setting] = checkbox.checked;
        saveSettings();
        renderUi();
        hideFloatingButtons();
      });
    });

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

    ui.hideVerifiedDBOnlyExceptions.addEventListener('change', () => {
      settings.hideVerifiedDBOnlyExceptions = ui.hideVerifiedDBOnlyExceptions.checked;
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

    ui.hideWhoToFollowFeed.addEventListener('change', () => {
      settings.hideWhoToFollowFeed = ui.hideWhoToFollowFeed.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hidePureRetweets.addEventListener('change', () => {
      settings.hidePureRetweets = ui.hidePureRetweets.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hidePureRetweetsNotInterested.addEventListener('change', () => {
      settings.hidePureRetweetsNotInterested = ui.hidePureRetweetsNotInterested.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.hideReplies.addEventListener('change', () => {
      settings.hideReplies = ui.hideReplies.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.feedKeyboardNavigation.addEventListener('change', () => {
      settings.feedKeyboardNavigationEnabled = ui.feedKeyboardNavigation.checked;
      keyboardNavigationPost = null;
      saveSettings();
      renderUi();
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

    ui.contentFilterEnabled.addEventListener('change', () => {
      settings.contentFilterEnabled = ui.contentFilterEnabled.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.contentFilterNotInterested.addEventListener('change', () => {
      settings.contentFilterNotInterested = ui.contentFilterNotInterested.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.contentFilterIncludeReplies.addEventListener('change', () => {
      settings.contentFilterIncludeReplies = ui.contentFilterIncludeReplies.checked;
      saveSettings();
      renderUi();
      scheduleScan();
    });

    ui.contentFilterKeywordsInput.addEventListener('input', () => {
      settings.contentFilterKeywords = ui.contentFilterKeywordsInput.value;
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
    scheduleMenuButtonPlacementRetries();
  }

  function applyBaseUiStyles(host, button, panel) {
    host.style.position = 'fixed';
    host.style.right = '82px';
    host.style.bottom = '18px';
    host.style.zIndex = '2147483647';
    host.style.display = 'block';
    host.style.pointerEvents = 'none';

    button.style.width = '55px';
    button.style.height = '55px';
    button.style.border = '1px solid #9fb5c3';
    button.style.borderRadius = '16px';
    button.style.background = 'rgba(255, 255, 255, 0.85)';
    button.style.color = '#0f1419';
    button.style.fontWeight = '800';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';

    panel.style.pointerEvents = 'auto';
  }

  function getFloatingDockButtons() {
    return [
      document.querySelector('[data-testid="GrokDrawerHeader"]'),
      document.querySelector('[data-testid="chat-drawer-main"]'),
    ].filter(Boolean);
  }

  function findFloatingButtonDock(buttons) {
    if (!buttons.length) {
      return null;
    }

    for (let current = buttons[0].parentElement; current; current = current.parentElement) {
      if (window.getComputedStyle(current).position === 'fixed'
        && buttons.every((button) => current.contains(button))) {
        return current;
      }
    }
    return null;
  }

  function copyFloatingButtonStyle(button, referenceButton) {
    const referenceStyle = referenceButton ? window.getComputedStyle(referenceButton) : null;
    const properties = {
      width: referenceStyle?.width || '55px',
      height: referenceStyle?.height || '55px',
      border: referenceStyle?.border || '1px solid rgb(159, 181, 195)',
      borderRadius: referenceStyle?.borderRadius || '16px',
      boxShadow: referenceStyle?.boxShadow || '0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15)',
      outline: referenceStyle?.outline || 'none',
      color: referenceStyle?.color || '#0f1419',
    };

    Object.entries(properties).forEach(([property, value]) => {
      button.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, 'important');
    });

    const backgroundColor = referenceStyle?.backgroundColor || 'rgba(255, 255, 255, 0.85)';
    const channels = backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1]
      .split(',')
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel));
    const brightness = channels?.every(Number.isFinite)
      ? channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114
      : 255;
    button.style.setProperty('--xff-menu-button-background', backgroundColor);
    button.style.setProperty(
      '--xff-menu-button-hover-background',
      brightness < 128 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 20, 25, 0.12)'
    );
  }

  function moveMenuHostToFallback(referenceButton) {
    if (!ui?.host || !document.body) {
      return;
    }

    ui.host.classList.remove('xff-docked-menu');
    ['--xff-dock-right', '--xff-dock-bottom', '--xff-dock-width', '--xff-dock-height']
      .forEach((property) => ui.host.style.removeProperty(property));
    if (ui.host.parentElement !== document.body) {
      document.body.appendChild(ui.host);
    }
    copyFloatingButtonStyle(ui.button, referenceButton);
  }

  function placeMenuHostInFloatingDock() {
    if (!ui?.host || !document.body) {
      return false;
    }

    const buttons = getFloatingDockButtons();
    const dock = findFloatingButtonDock(buttons);
    if (!dock) {
      moveMenuHostToFallback(buttons[0] || null);
      return false;
    }

    const dockRect = dock.getBoundingClientRect();
    const visibleButtons = buttons.map((button) => ({
      button,
      rect: button.getBoundingClientRect(),
    })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const sizeSource = buttons[0];
    const sourceStyle = sizeSource ? window.getComputedStyle(sizeSource) : null;
    const sourceContainerStyle = sizeSource?.parentElement
      ? window.getComputedStyle(sizeSource.parentElement)
      : null;
    const buttonHeight = Number.parseFloat(sourceStyle?.height) || 55;
    const dockWidth = Number.parseFloat(sourceContainerStyle?.width) || 400;
    let right = 20;
    let bottom = 146;

    if (visibleButtons.length > 0) {
      const rightmost = Math.max(...visibleButtons.map(({ rect }) => rect.right));
      const topmost = Math.min(...visibleButtons.map(({ rect }) => rect.top));
      const ordered = visibleButtons.map(({ rect }) => rect).sort((a, b) => a.top - b.top);
      const measuredGaps = ordered.slice(1)
        .map((rect, index) => rect.top - (ordered[index].top + ordered[index].height))
        .filter((gap) => gap >= 0);
      const gap = measuredGaps.length ? Math.min(...measuredGaps) : 12;
      right = Math.max(0, dockRect.right - rightmost);
      bottom = Math.max(0, dockRect.bottom - topmost + gap);
    }

    ui.host.style.setProperty('--xff-dock-right', `${right}px`);
    ui.host.style.setProperty('--xff-dock-bottom', `${bottom}px`);
    ui.host.style.setProperty('--xff-dock-width', `${dockWidth}px`);
    ui.host.style.setProperty('--xff-dock-height', `${buttonHeight}px`);
    ui.host.classList.add('xff-docked-menu');
    if (ui.host.parentElement !== dock) {
      dock.appendChild(ui.host);
    }
    copyFloatingButtonStyle(ui.button, buttons[0] || null);
    return true;
  }

  function scheduleMenuButtonPlacementRetries() {
    if (menuButtonPlacementTimer || isDestroyed) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 30;
    const retry = () => {
      if (isDestroyed || !ui?.host) {
        menuButtonPlacementTimer = 0;
        return;
      }
      if (placeMenuHostInFloatingDock()) {
        menuButtonPlacementTimer = 0;
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        menuButtonPlacementTimer = window.setTimeout(retry, 500);
      } else {
        menuButtonPlacementTimer = 0;
      }
    };

    retry();
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

      #xff-root.xff-docked-menu {
        position: absolute !important;
        top: auto !important;
        right: var(--xff-dock-right, 20px) !important;
        bottom: var(--xff-dock-bottom, 146px) !important;
        left: auto !important;
        width: var(--xff-dock-width, 400px) !important;
        height: var(--xff-dock-height, 55px) !important;
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
        width: 55px !important;
        height: 55px !important;
        border: 1px solid #9fb5c3 !important;
        border-radius: 16px !important;
        background-color: var(--xff-menu-button-background, rgba(255, 255, 255, 0.85)) !important;
        color: #0f1419 !important;
        padding: 0 !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
        text-align: center !important;
        line-height: 55px !important;
        cursor: pointer !important;
        box-shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15) !important;
        outline: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #xff-root.xff-docked-menu .xff-fab {
        position: absolute !important;
        top: 0 !important;
        right: 0 !important;
        bottom: auto !important;
        left: auto !important;
      }

      #xff-root .xff-fab {
        transform-origin: center !important;
        transition: background-color 120ms ease, transform 120ms ease, filter 120ms ease !important;
      }

      #xff-root .xff-fab:hover {
        background-color: var(--xff-menu-button-hover-background, rgba(15, 20, 25, 0.12)) !important;
        filter: brightness(1.02) !important;
        transform: scale(1.06) !important;
      }

      #xff-root .xff-fab:active {
        transform: scale(0.97) !important;
      }

      #xff-root .xff-panel {
        position: absolute !important;
        right: 0 !important;
        bottom: 67px !important;
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

      #xff-root.xff-docked-menu .xff-panel {
        right: 0 !important;
        bottom: 67px !important;
        left: auto !important;
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
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
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
        text-align: center !important;
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

      #xff-root .xff-tab-divider {
        border-top: 1px solid var(--xff-border) !important;
        margin: 10px 0 8px !important;
      }

      #xff-root .xff-subtab-group {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 6px !important;
      }

      #xff-root .xff-subtab {
        min-height: 30px !important;
        padding: 5px 7px !important;
        font-size: 12px !important;
      }

      #xff-root .xff-unimplemented,
      #xff-root .xff-unimplemented[aria-selected="true"] {
        color: #d93025 !important;
      }

      #xff-root .xff-tab.xff-subtab[data-subtab="ui-menu-buttons"] {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-tab.xff-subtab[data-subtab="posts-content"],
      #xff-root .xff-tab.xff-subtab[data-subtab="posts-other"] {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-tab.xff-subtab[data-subtab="ui-floating"] {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-tab.xff-subtab[data-subtab="ui-post-elements"] {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-tab-panel[hidden] {
        display: none !important;
      }

      #xff-root .xff-subtabs[hidden],
      #xff-root .xff-subtab-group[hidden],
      #xff-root .xff-subtab-panel[hidden] {
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

      #xff-root .xff-feed-keyboard-navigation-switch {
        gap: 8px !important;
      }

      #xff-root .xff-help-tooltip {
        position: relative !important;
        display: inline-flex !important;
        flex: 0 0 16px !important;
        align-items: center !important;
        justify-content: center !important;
        width: 16px !important;
        height: 16px !important;
        border-radius: 50% !important;
        background: #555 !important;
        color: #fff !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        line-height: 1 !important;
        cursor: help !important;
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

      #xff-root .xff-switch.xff-unimplemented,
      #xff-root .xff-db-search-field.xff-unimplemented {
        color: #d93025 !important;
      }

      #xff-root .xff-unimplemented-control {
        cursor: not-allowed !important;
      }

      #xff-root .xff-switch input.xff-unimplemented-control {
        opacity: 0.65 !important;
        cursor: not-allowed !important;
      }

      #xff-root .xff-switch-child.xff-unimplemented input:disabled + span {
        opacity: 1 !important;
        cursor: not-allowed !important;
      }

      #xff-root .xff-unimplemented-note {
        margin-top: 12px !important;
        color: #d93025 !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #xff-root .xff-ui-menu-buttons-panel .xff-unimplemented-note {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-ui-floating-panel .xff-unimplemented-note,
      #xff-root .xff-ui-side-panels-panel .xff-unimplemented-note,
      #xff-root .xff-ui-post-elements-panel .xff-unimplemented-note {
        color: var(--xff-text) !important;
      }

      #xff-root .xff-unimplemented-section-title {
        margin-top: 18px !important;
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
        white-space: pre-line !important;
      }

      #xff-root .xff-name-filter-field {
        display: grid !important;
        gap: 5px !important;
        margin-top: 12px !important;
        color: var(--xff-muted) !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #xff-root .xff-name-filter-field.xff-unimplemented {
        color: #d93025 !important;
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

      #xff-root .xff-name-filter-field input:disabled {
        color: #d93025 !important;
        opacity: 0.75 !important;
        cursor: not-allowed !important;
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

      #xff-root .xff-db-clear-except,
      #xff-root .xff-db-extra-button {
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

      #xff-root .xff-db-clear-except {
        width: 100% !important;
        margin-bottom: 8px !important;
      }

      #xff-root .xff-db-extra-actions {
        display: flex !important;
        gap: 8px !important;
        margin-top: 8px !important;
      }

      #xff-root .xff-db-extra-button {
        flex: 1 !important;
      }

      #xff-root .xff-db-search-field {
        display: grid !important;
        gap: 5px !important;
        margin: 4px 0 8px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
      }

      #xff-root .xff-db-search {
        width: 100% !important;
        min-height: 34px !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 6px !important;
        background: var(--xff-input-bg) !important;
        color: #d93025 !important;
        padding: 7px 9px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
      }

      #xff-root .xff-db-clear-except:disabled,
      #xff-root .xff-db-extra-button:disabled,
      #xff-root .xff-db-search:disabled {
        color: #d93025 !important;
        opacity: 0.75 !important;
        cursor: not-allowed !important;
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

      #xff-root .xff-db-btn-bar {
        width: 100% !important;
        display: flex !important;
        flex-direction: row !important;
        justify-content: center !important;
        gap: 8px !important;
        margin: 6px 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }

      #xff-root .xff-db-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        min-width: 0 !important;
        height: auto !important;
        aspect-ratio: auto !important;
        border: 1px solid var(--xff-border) !important;
        border-radius: 10px !important;
        background: #ff4444 !important;
        background-image: none !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        outline: none !important;
        padding: 6px 14px !important;
        line-height: 1 !important;
        white-space: nowrap !important;
      }

      #xff-root .xff-db-btn-filter {
        background: #ff4444 !important;
        border-color: #ff4444 !important;
        color: #ffffff !important;
      }

      #xff-root .xff-db-btn-filter:hover {
        background: #cc0000 !important;
        border-color: #cc0000 !important;
      }

      #xff-root .xff-db-btn-except {
        background: #00aa00 !important;
        border-color: #00aa00 !important;
        color: #ffffff !important;
      }

      #xff-root .xff-db-btn-except:hover {
        background: #008800 !important;
        border-color: #008800 !important;
      }

      #xff-root .xff-post-wrapper {
        position: relative !important;
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

    GM_registerMenuCommand('Вкл/выкл только исключения для БД', () => {
      settings.hideVerifiedDBOnlyExceptions = !settings.hideVerifiedDBOnlyExceptions;
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
    const target = document.querySelector('main') || document.body || document.documentElement;
    if (!target) {
      window.setTimeout(startObserver, 250);
      return;
    }

    if (observer && observerTarget === target) {
      return;
    }
    if (observer) {
      observer.disconnect();
    }
    observerTarget = target;

    observer = new MutationObserver((mutations) => {
      if (isDestroyed) return;
      let shouldScan = false;
      let shouldSyncPostUi = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const mutationTarget = mutation.target.nodeType === Node.ELEMENT_NODE
            ? mutation.target
            : mutation.target.parentElement;
          const targetIsPost = Boolean(mutationTarget?.closest?.(POST_SELECTOR));
          const onlyOurActionButtonsWereAdded = mutation.addedNodes.length > 0
            && Array.from(mutation.addedNodes).every((node) => {
              return node.nodeType === Node.ELEMENT_NODE
                && node.matches('.xff-post-action-shortcut-container');
            });
          if (targetIsPost && !onlyOurActionButtonsWereAdded) {
            shouldSyncPostUi = true;
          }

          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches(POST_SELECTOR)) {
                shouldScan = true;
                shouldSyncPostUi = true;
                break;
              }
              if (node.querySelector && node.querySelector(POST_SELECTOR)) {
                shouldScan = true;
                shouldSyncPostUi = true;
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
      if (shouldSyncPostUi) {
        schedulePostUiSync();
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: false,
    });
  }

  function startIrritantObserver() {
    const target = document.body || document.documentElement;
    if (!target) {
      window.setTimeout(startIrritantObserver, 250);
      return;
    }

    if (irritantObserver && irritantObserverTarget === target) {
      return;
    }
    if (irritantObserver) {
      irritantObserver.disconnect();
    }
    irritantObserverTarget = target;
    irritantObserver = new MutationObserver((mutations) => {
      if (isDestroyed || !mutations.some(isIrritantMutation)) {
        return;
      }

      window.clearTimeout(irritantObserverTimer);
      irritantObserverTimer = window.setTimeout(() => {
        if (!isDestroyed) {
          hideIrritantElements();
        }
      }, 80);
    });
    irritantObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function isIrritantMutation(mutation) {
    const floatingButtonSelector = FLOATING_BUTTONS
      .flatMap(({ buttonSelector, containerSelector }) => [buttonSelector, containerSelector])
      .join(',');
    const mutationTarget = mutation.target.nodeType === Node.ELEMENT_NODE
      ? mutation.target
      : mutation.target.parentElement;
    if (mutationTarget?.closest?.(floatingButtonSelector)) {
      return true;
    }

    if (mutation.type === 'characterData') {
      return isMainNavigationElement(mutation.target.parentElement)
        || isIrritantHeading(mutation.target.parentElement?.closest('[role="heading"], h1, h2, h3, h4, h5, h6'));
    }

    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (isIrritantHeading(node.parentElement?.closest('[role="heading"], h1, h2, h3, h4, h5, h6'))) {
          return true;
        }
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      if (isMainNavigationElement(node)) {
        return true;
      }

      if (node.matches(floatingButtonSelector) || node.querySelector(floatingButtonSelector)) {
        return true;
      }

      if (node.matches('[data-testid="sidebarColumn"], [data-testid="trend"], [data-testid="UserCell"], aside[role="complementary"]')
        || node.querySelector('[data-testid="sidebarColumn"], [data-testid="trend"], [data-testid="UserCell"], aside[role="complementary"]')) {
        return true;
      }

      const headings = [];
      if (node.matches('[role="heading"], h1, h2, h3, h4, h5, h6')) {
        headings.push(node);
      }
      headings.push(...node.querySelectorAll('[role="heading"], h1, h2, h3, h4, h5, h6'));
      if (headings.some(isIrritantHeading)) {
        return true;
      }
    }

    for (const node of mutation.removedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE
        && (node.matches(floatingButtonSelector) || node.querySelector(floatingButtonSelector))) {
        return true;
      }
    }
    return false;
  }

  function isMainNavigationElement(element) {
    if (!element) {
      return false;
    }

    const nav = element.matches?.('nav[role="navigation"]')
      ? element
      : element.closest?.('nav[role="navigation"]') || element.querySelector?.('nav[role="navigation"]');
    return Boolean(nav?.querySelector('[data-testid="AppTabBar_Home_Link"], [data-testid="AppTabBar_Profile_Link"]'));
  }

  function isIrritantHeading(heading) {
    if (!heading) {
      return false;
    }
    const text = (heading.textContent || '').trim().toLowerCase();
    return [
      'что происходит',
      "what's happening",
      'what’s happening',
      'кого читать',
      'who to follow',
    ].some((label) => text === label || text.startsWith(`${label} `));
  }

  function scheduleIrritantRetries() {
    window.clearTimeout(irritantRetryTimer);
    let attempts = 0;
    const maxAttempts = 30;
    const retryInterval = 500;
    const retry = () => {
      if (isDestroyed) {
        return;
      }
      hideIrritantElements();
      attempts += 1;
      if (attempts < maxAttempts) {
        irritantRetryTimer = window.setTimeout(retry, retryInterval);
      }
    };

    irritantRetryTimer = window.setTimeout(retry, retryInterval);
  }

  function getPostElements(root) {
    const searchRoot = root || document;
    return searchRoot.querySelectorAll(POST_SELECTOR);
  }

  function isPureRetweet(post) {
    const context = post.querySelector('[data-testid="socialContext"]');
    if (!context) {
      return false;
    }

    const label = (context.textContent || '').normalize('NFKC').toLowerCase();
    return /репост|retweeted|reposted/.test(label);
  }

  function isReplyPost(post) {
    const context = post.querySelector('[data-testid="socialContext"]');
    const contextLabel = (context?.textContent || '').normalize('NFKC').toLowerCase();
    if (/replying\s+to|in\s+reply\s+to|в\s+ответ|ответ\s+пользователю/.test(contextLabel)) {
      return true;
    }

    if (post.querySelector('[data-testid="quoteTweet"], [data-testid="quote-tweet"], [data-testid="quotedTweet"]')) {
      return true;
    }

    // X currently renders quote cards without a dedicated data-testid.
    // Their exact "Quote" / "Цитата" marker is outside the author's tweet text.
    return Array.from(post.querySelectorAll('span')).some((element) => {
      if (element.closest('[data-testid="tweetText"]')) {
        return false;
      }
      const label = (element.textContent || '').normalize('NFKC').trim().toLowerCase();
      return label === 'quote' || label === 'цитата';
    });
  }

  function getPostWrapper(post) {
    const xFeedCell = post.closest('[data-testid="cellInnerDiv"]');
    if (xFeedCell) {
      return xFeedCell;
    }

    // Fallback for X layouts that do not expose cellInnerDiv.
    let current = post;
    while (current && current.parentElement && current.parentElement.parentElement) {
      const parent = current.parentElement;
      const grandParent = parent.parentElement;
      let articleWrapperCount = 0;
      for (const child of grandParent.children) {
        if (child.querySelector(POST_SELECTOR)) {
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

  function syncPostUiElements() {
    if (isDestroyed) {
      return;
    }
    getPostElements(document).forEach(syncPostUiForPost);
  }

  function syncPostUiForPost(post) {
    if (!post?.isConnected) {
      return;
    }

    const grokButton = post.querySelector('button[aria-label*="Grok" i]');
    const grokContainer = grokButton?.parentElement || null;
    if (grokContainer) {
      if (settings.hidePostGrokButton) {
        grokContainer.setAttribute('data-xff-grok-action-hidden', 'true');
      }
    }
    if (!settings.hidePostGrokButton) {
      post.querySelectorAll('[data-xff-grok-action-hidden="true"]').forEach((element) => {
        element.removeAttribute('data-xff-grok-action-hidden');
      });
    }

    const enabledShortcuts = POST_ACTION_SHORTCUTS.filter((shortcut) => settings[shortcut.setting]);
    post.querySelectorAll('.xff-post-action-shortcut-container').forEach((element) => {
      const shortcut = POST_ACTION_SHORTCUTS.find(({ name }) => name === element.dataset.xffPostAction);
      if (!shortcut || !settings[shortcut.setting]) {
        element.remove();
      }
    });
    if (enabledShortcuts.length === 0) {
      return;
    }

    const menuButton = post.querySelector('[data-testid="caret"]');
    const actionContainer = grokContainer?.parentElement
      || findPostActionContainer(menuButton, post);
    if (!actionContainer) {
      return;
    }

    const insertionAnchor = grokContainer?.parentElement === actionContainer
      ? grokContainer
      : getDirectChildContaining(actionContainer, menuButton);

    enabledShortcuts.forEach((shortcut) => {
      const existing = Array.from(actionContainer.children).find((child) => {
        return child.dataset.xffPostAction === shortcut.name;
      });
      if (!existing) {
        actionContainer.insertBefore(createPostActionShortcut(post, shortcut), insertionAnchor || null);
      }
    });
  }

  function findPostActionContainer(menuButton, post) {
    for (let current = menuButton?.parentElement; current && current !== post; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      const columnGap = Number.parseFloat(style.columnGap);
      const gap = Number.parseFloat(style.gap);
      if (style.display === 'flex' && Math.max(columnGap || 0, gap || 0) > 0
        && current.querySelector('[data-testid="caret"]')) {
        return current;
      }
    }
    return null;
  }

  function getDirectChildContaining(container, descendant) {
    let current = descendant;
    while (current && current.parentElement !== container) {
      current = current.parentElement;
    }
    return current?.parentElement === container ? current : null;
  }

  function createPostActionShortcut(post, shortcut) {
    const wrapper = makeElement('div', 'xff-post-action-shortcut-container');
    wrapper.dataset.xffPostAction = shortcut.name;

    const button = makeElement('button', 'xff-post-action-shortcut');
    button.type = 'button';
    button.setAttribute('aria-label', shortcut.ariaLabel);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clickPostActionShortcut(post, shortcut);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    shortcut.paths.forEach((pathInfo) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathInfo.d);
      if (pathInfo.clipRule) path.setAttribute('clip-rule', pathInfo.clipRule);
      if (pathInfo.fillRule) path.setAttribute('fill-rule', pathInfo.fillRule);
      group.append(path);
    });
    svg.append(group);
    button.append(svg);
    wrapper.append(button);
    return wrapper;
  }

  function clickPostActionShortcut(post, shortcut) {
    if (!post?.isConnected || isDestroyed) {
      return;
    }

    // Let X show its confirmation dialog before applying the block action.
    const directAction = shortcut.actionType === 'blacklist'
      ? null
      : getDirectPostMenuAction(post, shortcut.actionType);
    if (directAction) {
      try {
        directAction();
        return;
      } catch (error) {
        console.warn(`[X Feed Filter] Direct ${shortcut.name} action failed; opening the post menu.`, error);
      }
    }

    const moreButton = post.querySelector('[data-testid="caret"]')
      || post.querySelector('button[aria-label*="Ещё"], button[aria-label*="More"]');
    if (!moreButton) {
      return;
    }

    if (postActionMenuObserver) {
      postActionMenuObserver.disconnect();
      postActionMenuObserver = null;
    }
    window.clearTimeout(postActionMenuTimeout);
    postActionMenuTimeout = 0;

    const finishMenuObserver = () => {
      if (postActionMenuObserver) {
        postActionMenuObserver.disconnect();
        postActionMenuObserver = null;
      }
      window.clearTimeout(postActionMenuTimeout);
      postActionMenuTimeout = 0;
    };

    const tryClickMenuAction = () => {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'));
      for (let menuIndex = menus.length - 1; menuIndex >= 0; menuIndex -= 1) {
        const menuItems = menus[menuIndex].querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          if (matchesPostMenuAction(
            shortcut.actionType,
            `${item.getAttribute('aria-label') || ''} ${item.textContent || ''}`,
            item.getAttribute('data-testid') || ''
          )) {
            item.click();
            finishMenuObserver();
            if (shortcut.actionType === 'blacklist') {
              waitForBlacklistConfirmationClose(post, moreButton);
            }
            return true;
          }
        }
      }
      return false;
    };

    moreButton.click();
    if (tryClickMenuAction()) {
      return;
    }

    postActionMenuObserver = new MutationObserver(() => {
      tryClickMenuAction();
    });
    postActionMenuObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    postActionMenuTimeout = window.setTimeout(finishMenuObserver, 2000);
  }

  function waitForBlacklistConfirmationClose(post, moreButton) {
    if (postActionConfirmationObserver) {
      postActionConfirmationObserver.disconnect();
      postActionConfirmationObserver = null;
    }
    window.clearTimeout(postActionConfirmationTimeout);

    let dialogSeen = false;
    let finished = false;
    const findBlockDialog = () => Array.from(
      document.querySelectorAll('[role="alertdialog"], [role="dialog"]')
    ).find((dialog) => /черн.{0,5}\s+список|blacklist|block\s+@/i.test(dialog.textContent || ''));

    const finish = (closeMenu) => {
      if (finished) return;
      finished = true;
      if (postActionConfirmationObserver) {
        postActionConfirmationObserver.disconnect();
        postActionConfirmationObserver = null;
      }
      window.clearTimeout(postActionConfirmationTimeout);
      postActionConfirmationTimeout = 0;

      if (closeMenu && post.isConnected && moreButton.isConnected) {
        if (moreButton.getAttribute('aria-expanded') === 'true') {
          moreButton.click();
        } else {
          const blacklistMenuRemainsOpen = Array.from(
            document.querySelectorAll('[role="menu"]')
          ).some((menu) => menu.getClientRects().length > 0
            && Array.from(menu.querySelectorAll('[role="menuitem"]')).some((item) => matchesPostMenuAction(
              'blacklist',
              `${item.getAttribute('aria-label') || ''} ${item.textContent || ''}`,
              item.getAttribute('data-testid') || ''
            )));
          if (blacklistMenuRemainsOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }));
          }
        }
      }
    };

    const checkDialogState = () => {
      if (findBlockDialog()) {
        dialogSeen = true;
      } else if (dialogSeen) {
        finish(true);
      }
    };

    if (findBlockDialog()) {
      dialogSeen = true;
    }
    postActionConfirmationObserver = new MutationObserver(checkDialogState);
    postActionConfirmationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    postActionConfirmationTimeout = window.setTimeout(() => finish(false), 60000);
  }

  function scanPage() {
    if (!isHomePage()) {
      return;
    }
    if (isDestroyed) return;

    const feedRoot = document.querySelector('main') || document;
    const posts = getPostElements(feedRoot);
    console.log('[X Filter] scanPage found', posts.length, 'posts');

    let hiddenCount = 0;
    let totalCount = 0;
    const visibilityChanges = [];

    for (const post of posts) {
      totalCount++;
      syncPostUiForPost(post);
      let hide = post.hasAttribute('data-xff-not-interested')
        || (post.hasAttribute('data-xff-not-interested-pending')
          && !post.hasAttribute('data-xff-feedback-pending'));

      if (!hide && settings.hidePureRetweets && isPureRetweet(post)) {
        if (settings.hidePureRetweetsNotInterested) {
          const actionQueued = clickNotInterested(post, { feedbackAction: 'retweets' });
          hide = !actionQueued && !post.hasAttribute('data-xff-feedback-pending');
        } else {
          hide = true;
        }
      }

      if (!hide && settings.hideReplies && isReplyPost(post)) {
        hide = true;
      }

      if (!hide && settings.hideVerified && isVerifiedPost(post)) {
        if (!settings.hideVerifiedUseDB) {
          // Without DB: hide all verified posts
          if (settings.hideVerifiedNotInterested) {
            clickNotInterested(post);
          } else {
            hide = true;
          }
        } else {
          // With DB
          const authorNicks = getVerifiedAuthorNick(post);
          let shouldHide = false;
          let dbChanged = false;
          let needsButtons = false;
          let buttonNick = null;

          for (const nick of authorNicks) {
            const dbEntry = settings.dbUsers.find((u) => u.nick === nick);
            if (!dbEntry) {
              settings.dbUsers.push({ nick, action: 'Не выбрано' });
              dbChanged = true;
              // Under "Только исключения": new entries are hidden (not exceptions)
              // Under normal DB mode: new entries are not hidden
              if (settings.hideVerifiedDBOnlyExceptions) {
                shouldHide = true;
              } else {
                needsButtons = true;
                buttonNick = nick;
              }
            } else if (settings.hideVerifiedDBOnlyExceptions) {
              // Only exceptions mode: hide everything except "Исключение"
              if (dbEntry.action !== 'Исключение') {
                shouldHide = true;
              }
            } else if (dbEntry.action === 'Фильтровать') {
              shouldHide = true;
            } else if (dbEntry.action === 'Не выбрано') {
              needsButtons = true;
              buttonNick = nick;
            }
          }

          if (dbChanged) {
            saveSettings();
          }

          if (shouldHide) {
            if (settings.hideVerifiedNotInterested) {
              clickNotInterested(post);
            } else {
              hide = true;
            }
          } else if (needsButtons && buttonNick) {
            addDbActionButtons(post, buttonNick);
          } else {
            removeDbActionButtons(post);
          }
        }
      }

      if (!hide && settings.nameFilterEnabled && isNameFiltered(post, settings.nameFilterIncludeReplies)) {
        if (settings.nameFilterNotInterested) {
          const actionQueued = clickNotInterested(post, { feedbackAction: 'authorPosts' });
          hide = !actionQueued && !post.hasAttribute('data-xff-not-interested-pending');
        } else {
          hide = true;
        }
      }

      if (!hide && settings.contentFilterEnabled
        && isContentFiltered(post, settings.contentFilterIncludeReplies)) {
        if (settings.contentFilterNotInterested) {
          const actionQueued = clickNotInterested(post);
          hide = !actionQueued && !post.hasAttribute('data-xff-not-interested-pending');
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

      const shouldUnhide = !hide
        && !post.hasAttribute('data-xff-not-interested')
        && (!settings.nameFilterNotInterested || !isNameFiltered(post, settings.nameFilterIncludeReplies));
      const wrapper = getPostWrapper(post);
      visibilityChanges.push({ post, wrapper, hide, shouldUnhide });
      if (hide) {
        hiddenCount++;
      }
    }

    const wrappersToHide = new Set(
      visibilityChanges.filter((change) => change.hide).map((change) => change.wrapper)
    );
    const wrappersToUnhide = new Set(
      visibilityChanges.filter((change) => change.shouldUnhide).map((change) => change.wrapper)
    );
    const visibilityWillChange = Array.from(wrappersToHide)
      .some((wrapper) => !wrapper.hasAttribute('data-xff-hidden'))
      || Array.from(wrappersToUnhide)
        .some((wrapper) => !wrappersToHide.has(wrapper) && wrapper.hasAttribute('data-xff-hidden'));
    const scrollAnchor = visibilityWillChange
      ? captureScrollAnchor(visibilityChanges, wrappersToHide)
      : null;

    for (const wrapper of wrappersToHide) {
      wrapper.classList.add('xff-post-wrapper');
      wrapper.setAttribute('data-xff-hidden', 'true');
    }
    for (const wrapper of wrappersToUnhide) {
      if (!wrappersToHide.has(wrapper)) {
        wrapper.removeAttribute('data-xff-hidden');
      }
    }

    restoreScrollAnchor(scrollAnchor);

    updateStatus(hiddenCount, totalCount);

    hideIrritantElements();
  }

  function captureScrollAnchor(visibilityChanges, wrappersToHide) {
    for (const { post, wrapper, hide } of visibilityChanges) {
      if (hide || wrappersToHide.has(wrapper) || wrapper.hasAttribute('data-xff-hidden')) {
        continue;
      }
      const rect = post.getBoundingClientRect();
      if (rect.bottom > 0) {
        return {
          post,
          wrapper,
          top: rect.top,
          userIntentVersion: userScrollIntentVersion,
        };
      }
    }
    return null;
  }

  function restoreScrollAnchor(anchor) {
    if (!anchor) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (isDestroyed
          || anchor.userIntentVersion !== userScrollIntentVersion
          || !anchor.post.isConnected
          || anchor.wrapper.hasAttribute('data-xff-hidden')) {
          return;
        }

        const currentTop = anchor.post.getBoundingClientRect().top;
        const scrollDelta = currentTop - anchor.top;
        if (Math.abs(scrollDelta) < 1) {
          return;
        }

        const scrollRoot = document.scrollingElement;
        if (scrollRoot) {
          scrollRoot.scrollTop += scrollDelta;
        }
      });
    });
  }

  function clickNotInterested(post, options = {}) {
    const feedbackAction = ['retweets', 'authorPosts'].includes(options.feedbackAction)
      ? options.feedbackAction
      : null;
    if (feedbackAction && post.hasAttribute('data-xff-feedback-pending')) {
      return true;
    }
    if (post.hasAttribute('data-xff-not-interested')
      || post.hasAttribute('data-xff-not-interested-pending')
      || (feedbackAction && post.hasAttribute('data-xff-feedback-action-failed'))) {
      return false;
    }
    const moreBtn = post.querySelector('[data-testid="caret"]')
      || post.querySelector('button[aria-label*="Ещё"], button[aria-label*="More"]');
    if (!moreBtn) {
      return false;
    }
    post.setAttribute('data-xff-not-interested-pending', 'true');
    if (feedbackAction) {
      post.setAttribute('data-xff-feedback-pending', 'true');
    }
    notInterestedQueue.push({
      post,
      wrapper: getPostWrapper(post),
      feedbackAction,
    });
    processNotInterestedQueue();
    return true;
  }

  function getDirectNotInterestedAction(post) {
    return getDirectPostMenuAction(post, 'dislike');
  }

  function getDirectPostMenuAction(post, actionType) {
    const moreButton = post.querySelector('[data-testid="caret"]')
      || post.querySelector('button[aria-label*="Ещё"], button[aria-label*="More"]');
    if (!moreButton) {
      return null;
    }

    const fiberKey = Object.keys(moreButton).find((key) => key.startsWith('__reactFiber$'));
    let fiber = fiberKey ? moreButton[fiberKey] : null;
    for (let depth = 0; fiber && depth < 30; depth += 1, fiber = fiber.return) {
      const renderMenu = fiber.memoizedProps?.renderMenu || fiber.pendingProps?.renderMenu;
      if (typeof renderMenu !== 'function') {
        continue;
      }

      try {
        const menuShell = renderMenu(() => {});
        const renderItems = menuShell?.props?.children;
        const menu = typeof renderItems === 'function'
          ? renderItems({ downloadLink: null })
          : null;
        const items = menu?.props?.actionItems;
        if (!Array.isArray(items)) {
          continue;
        }

        const matchingItem = items.find((item) => {
          return matchesPostMenuAction(
            actionType,
            String(item?.text || ''),
            String(item?.testID || '')
          );
        });
        if (typeof matchingItem?.onClick === 'function') {
          return matchingItem.onClick;
        }
      } catch (_) {
        // X can change its menu internals; the visible menu remains the fallback.
      }
    }
    return null;
  }

  function matchesPostMenuAction(actionType, label, testId = '') {
    const normalizedLabel = `${testId} ${label}`
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (actionType === 'dislike') {
      return /не\s*интерес|not\s+interested/.test(normalizedLabel);
    }
    if (actionType === 'ignore') {
      return /^(?:игнорировать(?:\s|$)|mute(?:\s|$)|ignore(?:\s|$))/.test(normalizedLabel);
    }
    if (actionType === 'blacklist') {
      if (/^(?:(?:убрать|снять|удалить)(?:\s|$)|(?:remove|unblock|unblacklist)\b)/.test(normalizedLabel)) {
        return false;
      }
      return testId.toLowerCase() === 'block'
        || /^(?:внести\s+.+\s+в\s+ч[её]р?н.{0,3}\s+список|block\b|add\s+.+\s+to\s+(?:the\s+)?(?:block|black)\s*list)/.test(normalizedLabel);
    }
    return false;
  }

  function waitForNotInterestedFeedbackAction(wrapper, feedbackAction, callback) {
    let finished = false;

    const finish = (clicked) => {
      if (finished) return;
      finished = true;
      if (notInterestedFeedbackObserver) {
        notInterestedFeedbackObserver.disconnect();
        notInterestedFeedbackObserver = null;
      }
      window.clearTimeout(notInterestedFeedbackTimeout);
      notInterestedFeedbackTimeout = 0;
      callback(clicked);
    };

    const tryClickAction = () => {
      const root = wrapper?.isConnected ? wrapper : document;
      const pattern = feedbackAction === 'retweets'
        ? /показывать меньше репостов от|show (?:me )?fewer reposts from|see fewer reposts from/
        : /показывать меньше (?:публикаций|постов) от|show (?:me )?fewer posts from|see fewer posts from/;
      const action = Array.from(root.querySelectorAll('button, [role="button"]')).find((button) => {
        const label = `${button.getAttribute('aria-label') || ''} ${button.innerText || button.textContent || ''}`
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .toLowerCase();
        return pattern.test(label);
      });
      if (!action) {
        return false;
      }

      action.click();
      finish(true);
      return true;
    };

    if (tryClickAction()) {
      return;
    }

    notInterestedFeedbackObserver = new MutationObserver(() => {
      tryClickAction();
    });
    notInterestedFeedbackObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    notInterestedFeedbackTimeout = window.setTimeout(() => finish(false), 5000);
  }

  function processNotInterestedQueue() {
    if (notInterestedInProgress || isDestroyed) {
      return;
    }

    const request = notInterestedQueue.shift();
    if (!request) {
      return;
    }
    const { post, wrapper, feedbackAction } = request;
    if (!post.isConnected) {
      post.removeAttribute('data-xff-not-interested-pending');
      post.removeAttribute('data-xff-feedback-pending');
      processNotInterestedQueue();
      return;
    }

    notInterestedInProgress = true;
    let actionFinished = false;
    let requestCompleted = false;

    const complete = (clicked, feedbackActionClicked = false) => {
      if (requestCompleted) return;
      requestCompleted = true;
      if (notInterestedMenuObserver) {
        notInterestedMenuObserver.disconnect();
        notInterestedMenuObserver = null;
      }
      window.clearTimeout(notInterestedMenuTimeout);
      notInterestedMenuTimeout = 0;
      if (clicked && !feedbackAction) {
        markPostNotInterested(post);
      } else if (feedbackAction && clicked && !feedbackActionClicked && post.isConnected) {
        post.setAttribute('data-xff-feedback-action-failed', 'true');
        markPostNotInterested(post);
      } else if (feedbackAction && !clicked) {
        post.setAttribute('data-xff-feedback-action-failed', 'true');
      }
      post.removeAttribute('data-xff-not-interested-pending');
      post.removeAttribute('data-xff-feedback-pending');
      notInterestedInProgress = false;
      if (clicked || feedbackAction) {
        scheduleScan();
      }
      window.setTimeout(processNotInterestedQueue, 100);
    };

    const finish = (clicked) => {
      if (actionFinished) return;
      actionFinished = true;
      if (notInterestedMenuObserver) {
        notInterestedMenuObserver.disconnect();
        notInterestedMenuObserver = null;
      }
      window.clearTimeout(notInterestedMenuTimeout);
      notInterestedMenuTimeout = 0;

      if (clicked && feedbackAction) {
        waitForNotInterestedFeedbackAction(wrapper, feedbackAction, (feedbackActionClicked) => {
          complete(true, feedbackActionClicked);
        });
        return;
      }
      complete(clicked);
    };

    const runClassicAction = () => {
      const moreBtn = post.querySelector('[data-testid="caret"]')
        || post.querySelector('button[aria-label*="Ещё"], button[aria-label*="More"]');
      if (!moreBtn) {
        finish(false);
        return;
      }

      const findNotInterestedMenuItem = () => {
        const menus = Array.from(document.querySelectorAll('[role="menu"]'));
        for (let index = menus.length - 1; index >= 0; index--) {
          const menuItems = menus[index].querySelectorAll('[role="menuitem"]');
          for (const item of menuItems) {
            const label = `${item.getAttribute('aria-label') || ''} ${item.textContent || ''}`
              .normalize('NFKC')
              .toLowerCase();
            if (/не\s*интерес|not\s+interested/.test(label)) {
              return item;
            }
          }
        }
        return null;
      };

      const tryClickNotInterested = () => {
        const menuItem = findNotInterestedMenuItem();
        if (!menuItem) {
          return false;
        }

        const directActionAvailable = typeof getDirectNotInterestedAction(post) === 'function';
        menuItem.click();
        if (directActionAvailable && !directNotInterestedStrategyRegistered) {
          directNotInterestedStrategyRegistered = true;
          updateStatus(lastHiddenPostCount, lastTotalPostCount);
          console.info('[X Feed Filter] Registered X per-post Not Interested action handler.');
        }
        finish(true);
        return true;
      };

      moreBtn.click();
      if (tryClickNotInterested()) {
        return;
      }

      notInterestedMenuObserver = new MutationObserver(() => {
        tryClickNotInterested();
      });
      notInterestedMenuObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      notInterestedMenuTimeout = window.setTimeout(() => finish(false), 2000);
    };

    if (!directNotInterestedStrategyRegistered) {
      runClassicAction();
      return;
    }

    const directAction = getDirectNotInterestedAction(post);
    if (directAction) {
      try {
        directAction();
        finish(true);
        return;
      } catch (error) {
        console.warn('[X Feed Filter] Direct Not Interested action failed; using the menu.', error);
      }
    }

    runClassicAction();
  }

  function hidePostForNotInterested(post) {
    setPostWrapperHiddenWithScroll(post);
  }

  function setPostWrapperHiddenWithScroll(post, beforeHide) {
    const wrapper = getPostWrapper(post);
    if (!wrapper) {
      return;
    }

    const scrollAnchor = wrapper.hasAttribute('data-xff-hidden')
      ? null
      : captureScrollAnchorExcludingWrappers(new Set([wrapper]));
    if (typeof beforeHide === 'function') {
      beforeHide();
    }
    wrapper.classList.add('xff-post-wrapper');
    wrapper.setAttribute('data-xff-hidden', 'true');
    restoreScrollAnchor(scrollAnchor);
  }

  function captureScrollAnchorExcludingWrappers(excludedWrappers) {
    const feedRoot = document.querySelector('main') || document;
    const excluded = excludedWrappers instanceof Set ? excludedWrappers : new Set([excludedWrappers]);
    for (const post of getPostElements(feedRoot)) {
      const wrapper = getPostWrapper(post);
      if (excluded.has(wrapper) || wrapper.hasAttribute('data-xff-hidden')) {
        continue;
      }
      const rect = post.getBoundingClientRect();
      if (rect.bottom > 0) {
        return {
          post,
          wrapper,
          top: rect.top,
          userIntentVersion: userScrollIntentVersion,
        };
      }
    }
    return null;
  }

  function markPostNotInterested(post) {
    post.setAttribute('data-xff-not-interested', 'true');
    hidePostForNotInterested(post);
  }

  function addDbActionButtons(post, nick) {
    if (post.getAttribute('data-xff-db-buttons-added')) {
      return;
    }

    const wrapper = getPostWrapper(post);
    if (!wrapper) {
      return;
    }

    const btnBar = makeElement('div', 'xff-db-btn-bar');
    Object.assign(btnBar.style, {
      width: '100%',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: '8px',
      margin: '6px 0',
      padding: '0',
      boxSizing: 'border-box'
    });

    const btnFilter = makeElement('div', 'xff-db-btn xff-db-btn-filter', 'Скрыть галочника');
    btnFilter.setAttribute('role', 'button');
    btnFilter.setAttribute('aria-label', 'Скрыть посты этого галочника');
    Object.assign(btnFilter.style, {
      background: '#ff4444',
      borderColor: '#ff4444',
      color: '#ffffff',
      borderRadius: '9999px',
      borderStyle: 'solid',
      borderWidth: '1px',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
      padding: '6px 14px',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'auto',
      height: 'auto',
      minWidth: '0',
      aspectRatio: 'auto',
      outline: 'none',
      boxSizing: 'border-box'
    });
    btnFilter.addEventListener('mouseenter', () => {
      btnFilter.style.background = '#cc0000';
      btnFilter.style.borderColor = '#cc0000';
    });
    btnFilter.addEventListener('mouseleave', () => {
      btnFilter.style.background = '#ff4444';
      btnFilter.style.borderColor = '#ff4444';
    });
    btnFilter.addEventListener('click', () => {
      setPostWrapperHiddenWithScroll(post, () => {
        setDbUserAction(nick, 'Фильтровать');
        removeDbActionButtons(post);
      });
    });

    const btnExcept = makeElement('div', 'xff-db-btn xff-db-btn-except', 'Пощадить галочника');
    btnExcept.setAttribute('role', 'button');
    btnExcept.setAttribute('aria-label', 'Не скрывать посты этого галочника');
    Object.assign(btnExcept.style, {
      background: '#00aa00',
      borderColor: '#00aa00',
      color: '#ffffff',
      borderRadius: '9999px',
      borderStyle: 'solid',
      borderWidth: '1px',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
      padding: '6px 14px',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'auto',
      height: 'auto',
      minWidth: '0',
      aspectRatio: 'auto',
      outline: 'none',
      boxSizing: 'border-box'
    });
    btnExcept.addEventListener('mouseenter', () => {
      btnExcept.style.background = '#008800';
      btnExcept.style.borderColor = '#008800';
    });
    btnExcept.addEventListener('mouseleave', () => {
      btnExcept.style.background = '#00aa00';
      btnExcept.style.borderColor = '#00aa00';
    });
    btnExcept.addEventListener('click', () => {
      setDbUserAction(nick, 'Исключение');
      removeDbActionButtons(post);
    });

    btnBar.append(btnFilter, btnExcept);

    // Insert button bar at the very top of the wrapper, before article content
    const article = wrapper.querySelector(POST_SELECTOR);
    if (article) {
      article.parentNode.insertBefore(btnBar, article);
    } else {
      wrapper.insertBefore(btnBar, wrapper.firstChild);
    }

    post.setAttribute('data-xff-db-buttons-added', 'true');
  }

  function removeDbActionButtons(post) {
    const wrapper = getPostWrapper(post);
    if (!wrapper) {
      return;
    }
    const btnBar = wrapper.querySelector('.xff-db-btn-bar');
    if (btnBar) {
      btnBar.remove();
    }
    post.removeAttribute('data-xff-db-buttons-added');
  }

  function setDbUserAction(nick, action) {
    const entry = settings.dbUsers.find((u) => u.nick === nick);
    if (entry) {
      entry.action = action;
      saveSettings();
    }
  }

  function isVerifiedPost(post) {
    return getVerifiedAuthorElements(post).length > 0;
  }

  function getAuthorNameElements(post) {
    const authorNameElements = Array.from(post.querySelectorAll(AUTHOR_NAME_SELECTOR));
    if (authorNameElements.length > 0) {
      return authorNameElements;
    }

    // Fallback for layouts without X's User-Name test id.
    return Array.from(post.querySelectorAll('a[href^="/"]:not([href*="/status/"])'))
      .filter((link) => (link.textContent || '').trim().length > 0);
  }

  function hasVerifiedBadge(element) {
    if (!element) {
      return false;
    }
    return Boolean(
      (element.matches && element.matches(VERIFIED_BADGE_SELECTOR))
      || (element.querySelector && element.querySelector(VERIFIED_BADGE_SELECTOR))
    );
  }

  function getVerifiedAuthorElements(post) {
    const authorElements = getAuthorNameElements(post);
    const relevantAuthors = settings.hideVerifiedReplies
      ? authorElements
      : authorElements.slice(0, 1);
    return relevantAuthors.filter(hasVerifiedBadge);
  }

  function getAuthorNick(authorElement) {
    const links = Array.from(authorElement.querySelectorAll('a[href]'));
    const skipPaths = new Set([
      'i', 'hashtag', 'search', 'compose', 'settings', 'messages',
      'notifications', 'home', 'explore', 'login', 'signup',
    ]);

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const profileMatch = href.match(/^\/([^/?#]+)\/?$/);
      if (profileMatch && !skipPaths.has(profileMatch[1].toLowerCase())) {
        try {
          return decodeURIComponent(profileMatch[1]);
        } catch (_) {
          return profileMatch[1];
        }
      }
    }

    const handleMatch = (authorElement.textContent || '').match(/@([a-z\d_]+)/i);
    return handleMatch ? handleMatch[1] : null;
  }

  function getVerifiedAuthorNick(post) {
    const nicks = [];
    const seen = new Set();
    for (const authorElement of getVerifiedAuthorElements(post)) {
      const nick = getAuthorNick(authorElement);
      if (nick && !seen.has(nick)) {
        seen.add(nick);
        nicks.push(nick);
      }
    }
    return nicks;
  }

  function parseKeywordList(value) {
    // Trim each comma-delimited entry while preserving spaces inside phrases.
    return String(value || '')
      .split(',')
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase.length > 0);
  }

  function isNameFiltered(post, includeReplies) {
    const keywords = parseKeywordList(settings.nameFilterKeywords);

    if (!keywords.length) {
      return false;
    }

    const authorNameElements = getAuthorNameElements(post);
    const authorElementsToCheck = includeReplies
      ? authorNameElements
      : authorNameElements.slice(0, 1);
    for (const authorElement of authorElementsToCheck) {
      const name = (authorElement.textContent || '').trim();
      const imgs = authorElement.querySelectorAll('img');
      const altTexts = Array.from(imgs).map((img) => img.getAttribute('alt') || '').join(' ');
      const fullText = (name + ' ' + altTexts).trim();
      for (const keyword of keywords) {
        if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    if (includeReplies) {
      const contentElements = post.querySelectorAll('[data-testid="tweetText"]');
      if (contentElements.length > 0) {
        for (const contentElement of contentElements) {
          const contentText = (contentElement.textContent || '').trim().toLowerCase();
          for (const keyword of keywords) {
            if (contentText.includes(keyword.toLowerCase())) {
              return true;
            }
          }
        }
      } else {
        // Older X layouts do not expose tweetText; keep the previous broad fallback there.
        const postText = (post.textContent || '').trim().toLowerCase();
        for (const keyword of keywords) {
          if (postText.includes(keyword.toLowerCase())) {
            return true;
          }
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

  function isContentFiltered(post, includeReplies) {
    const keywords = parseKeywordList(settings.contentFilterKeywords);
    if (keywords.length === 0) {
      return false;
    }

    const contentElements = Array.from(post.querySelectorAll('[data-testid="tweetText"]'));
    const elementsToCheck = includeReplies ? contentElements : contentElements.slice(0, 1);
    const postText = elementsToCheck.length > 0
      ? elementsToCheck.map((element) => {
        const emojiAltText = Array.from(element.querySelectorAll('img[alt]'))
          .map((image) => image.getAttribute('alt') || '')
          .join(' ');
        return `${element.textContent || ''} ${emojiAltText}`;
      }).join(' ')
      : (post.textContent || '');
    const normalizedPostText = postText.toLowerCase();

    return keywords.some((keyword) => normalizedPostText.includes(keyword.toLowerCase()));
  }

  function readPostAgeSeconds(post) {
    const timeEl = post.querySelector('time');
    if (!timeEl) {
      return null;
    }
    const datetime = timeEl.getAttribute('datetime') || timeEl.dateTime || '';
    const timestamp = Date.parse(datetime);
    if (Number.isFinite(timestamp)) {
      const age = (Date.now() - timestamp) / 1000;
      if (age >= 0) {
        return age;
      }
    }
    return parseAgeText(timeEl.textContent || '');
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
    if (settings.tab === 'other' && !settings.subtab.startsWith('posts-')) {
      settings.subtab = 'posts-verified';
    } else if (settings.tab === 'irritants' && !settings.subtab.startsWith('ui-')) {
      settings.subtab = 'ui-side-panels';
    }
    saveSettings();
    renderUi();
  }

  function setSubtab(subtab) {
    const validSubtabs = [
      'posts-verified',
      'posts-names',
      'posts-content',
      'posts-other',
      'ui-floating',
      'ui-side-panels',
      'ui-menu-buttons',
      'ui-post-elements',
    ];
    settings.subtab = validSubtabs.includes(subtab) ? subtab : 'posts-verified';
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
    if (settings.tab === 'other' && !settings.subtab.startsWith('posts-')) {
      settings.subtab = 'posts-verified';
    } else if (settings.tab === 'irritants' && !settings.subtab.startsWith('ui-')) {
      settings.subtab = 'ui-side-panels';
    }

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
    ui.subtabBar.hidden = settings.tab !== 'other' && settings.tab !== 'irritants';
    ui.postSubtabs.hidden = settings.tab !== 'other';
    ui.uiSubtabs.hidden = settings.tab !== 'irritants';
    ui.postSubtabButtons.forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.subtab === settings.subtab));
    });
    ui.uiSubtabButtons.forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.subtab === settings.subtab));
    });
    ui.postPanels.forEach(({ id, element }) => {
      element.hidden = settings.tab !== 'other' || settings.subtab !== id;
    });
    ui.uiPanels.forEach(({ id, element }) => {
      element.hidden = settings.tab !== 'irritants' || settings.subtab !== id;
    });

    ui.recencyEnabled.checked = settings.recencyEnabled;
    ui.hideVerified.checked = settings.hideVerified;
    ui.hideVerifiedReplies.checked = settings.hideVerifiedReplies;
    ui.hideVerifiedReplies.disabled = !settings.hideVerified;
    ui.hideVerifiedNotInterested.checked = settings.hideVerifiedNotInterested;
    ui.hideVerifiedNotInterested.disabled = !settings.hideVerified;
    ui.hideVerifiedUseDB.checked = settings.hideVerifiedUseDB;
    ui.hideVerifiedUseDB.disabled = !settings.hideVerified;
    ui.hideVerifiedDBOnlyExceptions.checked = settings.hideVerifiedDBOnlyExceptions;
    ui.hideVerifiedDBOnlyExceptions.disabled = !settings.hideVerifiedUseDB;
    ui.hidePremium.checked = settings.hidePremium;
    ui.hideWhatsHappening.checked = settings.hideWhatsHappening;
    ui.hideWhoToFollow.checked = settings.hideWhoToFollow;
    ui.hideWhoToFollowFeed.checked = settings.hideWhoToFollowFeed;
    ui.hidePureRetweets.checked = settings.hidePureRetweets;
    ui.hidePureRetweetsNotInterested.checked = settings.hidePureRetweetsNotInterested;
    ui.hidePureRetweetsNotInterested.disabled = !settings.hidePureRetweets;
    ui.hideReplies.checked = settings.hideReplies;
    ui.feedKeyboardNavigation.checked = settings.feedKeyboardNavigationEnabled;
    Object.entries(ui.floatingButtonCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.checked = settings[setting];
    });
    ui.nameFilterEnabled.checked = settings.nameFilterEnabled;
    ui.nameFilterNotInterested.checked = settings.nameFilterNotInterested;
    ui.nameFilterNotInterested.disabled = !settings.nameFilterEnabled;
    ui.nameFilterIncludeReplies.checked = settings.nameFilterIncludeReplies;
    ui.nameFilterIncludeReplies.disabled = !settings.nameFilterEnabled;
    ui.contentFilterEnabled.checked = settings.contentFilterEnabled;
    ui.contentFilterNotInterested.checked = settings.contentFilterNotInterested;
    ui.contentFilterNotInterested.disabled = !settings.contentFilterEnabled;
    ui.contentFilterIncludeReplies.checked = settings.contentFilterIncludeReplies;
    ui.contentFilterIncludeReplies.disabled = !settings.contentFilterEnabled;
    Object.entries(ui.menuItemCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.checked = settings[setting];
    });
    Object.entries(ui.postElementCheckboxes).forEach(([setting, checkbox]) => {
      checkbox.checked = settings[setting];
    });
    if (document.activeElement !== ui.nameFilterKeywordsInput) {
      ui.nameFilterKeywordsInput.value = settings.nameFilterKeywords || '';
    }
    if (document.activeElement !== ui.contentFilterKeywordsInput) {
      ui.contentFilterKeywordsInput.value = settings.contentFilterKeywords || '';
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

  function updateStatus(hiddenCount, totalCount) {
    lastHiddenPostCount = hiddenCount;
    lastTotalPostCount = totalCount;
    if (!ui || !ui.status) {
      return;
    }

    const handlerDetected = directNotInterestedStrategyRegistered ? 'True' : 'False';
    ui.status.textContent = `Всего постов: ${totalCount}. Скрыто: ${hiddenCount}.\nNot Interested Detected: ${handlerDetected}`;
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
    setElementsHidden(getPremiumPanels(), settings.hidePremium);
    setElementsHidden(getWhatsHappeningPanels(), settings.hideWhatsHappening);
    setElementsHidden(getWhoToFollowPanels(), settings.hideWhoToFollow);
    setElementsHidden(getWhoToFollowFeedModules(), settings.hideWhoToFollowFeed, false);
    hideFloatingButtons();
    hideNavigationMenuItems();
    if (!placeMenuHostInFloatingDock()) {
      scheduleMenuButtonPlacementRetries();
    }
  }

  function hideFloatingButtons() {
    document.querySelectorAll('[data-xff-floating-button-hidden="true"]').forEach((element) => {
      const button = FLOATING_BUTTONS.find(({ buttonSelector, containerSelector }) => {
        return element.matches(containerSelector) || element.matches(buttonSelector);
      });
      if (!button || !settings[button.setting]) {
        element.removeAttribute('data-xff-floating-button-hidden');
      }
    });

    FLOATING_BUTTONS.forEach(({ setting, buttonSelector, containerSelector }) => {
      document.querySelectorAll(buttonSelector).forEach((button) => {
        const target = button.closest(containerSelector) || button;
        if (settings[setting]) {
          target.setAttribute('data-xff-floating-button-hidden', 'true');
        } else {
          target.removeAttribute('data-xff-floating-button-hidden');
        }
      });
    });
  }

  function hideNavigationMenuItems() {
    const homeLink = document.querySelector('[data-testid="AppTabBar_Home_Link"]');
    const nav = homeLink?.closest('nav[role="navigation"]')
      || document.querySelector('nav[role="navigation"]');
    if (!nav) {
      return;
    }

    NAV_MENU_ITEMS.forEach(({ setting, selector }) => {
      nav.querySelectorAll(selector).forEach((element) => {
        if (settings[setting]) {
          element.setAttribute('data-xff-menu-hidden', 'true');
        } else {
          element.removeAttribute('data-xff-menu-hidden');
        }
      });
    });
  }

  function setElementsHidden(elements, shouldHide, expandToCard = true) {
    const panels = Array.from(elements, (element) => ({
      element,
      target: expandToCard ? getPanelCardElement(element) : element,
    }));
    const targets = new Set(panels.map((panel) => panel.target));
    const feedTargets = new Set(Array.from(targets).filter((target) => target.closest('main')));
    const visibilityWillChange = Array.from(feedTargets).some((target) => {
      return shouldHide
        ? !target.hasAttribute('data-xff-hidden')
        : target.hasAttribute('data-xff-hidden');
    });
    const scrollAnchor = visibilityWillChange
      ? captureScrollAnchorExcludingWrappers(feedTargets)
      : null;

    if (shouldHide) {
      for (const target of targets) {
        target.setAttribute('data-xff-hidden', 'true');
      }
      restoreScrollAnchor(scrollAnchor);
      return;
    }

    const sidebar = getSidebarRoot();
    for (const { element, target } of panels) {
      for (let current = element; current; current = current.parentElement) {
        current.removeAttribute('data-xff-hidden');
        if (current === target || current === sidebar) {
          break;
        }
      }
    }
    restoreScrollAnchor(scrollAnchor);
  }

  function getPanelCardElement(element) {
    const sidebar = getSidebarRoot();
    for (let current = element; current && current !== sidebar; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      const hasRoundedCorners = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomLeftRadius,
        style.borderBottomRightRadius,
      ].some((radius) => Number.parseFloat(radius) > 0);
      const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
        return Number.parseFloat(style[`border${side}Width`]) > 0
          && style[`border${side}Style`] !== 'none';
      });
      if (hasRoundedCorners && hasBorder) {
        return current;
      }
    }
    return element;
  }

  function getSidebarRoot() {
    return document.querySelector('[data-testid="sidebarColumn"]') || document;
  }

  function getPremiumPanels() {
    const sidebar = getSidebarRoot();
    const complementaryPanels = Array.from(sidebar.querySelectorAll('aside[role="complementary"]'));
    const byLink = complementaryPanels.filter((panel) => {
      return Array.from(panel.querySelectorAll('a[href]')).some((link) => {
        try {
          return new URL(link.href, window.location.origin).pathname.startsWith('/i/premium_sign_up');
        } catch (_) {
          return (link.getAttribute('href') || '').startsWith('/i/premium_sign_up');
        }
      });
    });
    if (byLink.length > 0) {
      return byLink;
    }
    return Array.from(sidebar.querySelectorAll('aside[aria-label*="Premium" i], aside[aria-label*="Подпишитесь на Premium"]'));
  }

  function getWhatsHappeningPanels() {
    const sidebar = getSidebarRoot();
    const trends = Array.from(sidebar.querySelectorAll('[data-testid="trend"]'));
    if (trends.length > 0) {
      for (let candidate = trends[0].parentElement; candidate && candidate !== sidebar; candidate = candidate.parentElement) {
        const candidateTrendCount = candidate.querySelectorAll('[data-testid="trend"]').length;
        if (candidateTrendCount === trends.length && !candidate.querySelector('[data-testid="UserCell"]')) {
          return [candidate];
        }
      }
    }

    return findElementsByHeading(['Что происходит', "What's happening", 'What’s happening'], 8);
  }

  function getWhoToFollowPanels() {
    const sidebar = getSidebarRoot();
    const complementaryPanels = Array.from(sidebar.querySelectorAll('aside[role="complementary"]'));
    const byUserCells = complementaryPanels.filter((panel) => panel.querySelector('[data-testid="UserCell"]'));
    if (byUserCells.length > 0) {
      return byUserCells;
    }
    return Array.from(sidebar.querySelectorAll(
      'aside[aria-label*="Кого читать"], aside[aria-label*="Who to follow" i]'
    ));
  }

  function getWhoToFollowFeedModules() {
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    const headings = Array.from(document.querySelectorAll('[role="heading"], h1, h2, h3, h4, h5, h6'));
    const modules = new Set();
    for (const heading of headings) {
      const text = (heading.textContent || '').trim().toLowerCase();
      if (text !== 'who to follow' && text !== 'кого читать') {
        continue;
      }
      if (sidebar?.contains(heading) || heading.closest('aside[role="complementary"]')) {
        continue;
      }

      const feedCell = heading.closest('[data-testid="cellInnerDiv"]');
      if (feedCell) {
        modules.add(feedCell);
      }
    }
    return Array.from(modules);
  }

  function findElementsByHeading(headingTexts, maxDepth) {
    const elements = [];
    const targetTexts = (Array.isArray(headingTexts) ? headingTexts : [headingTexts])
      .map((text) => String(text).trim().toLowerCase())
      .filter(Boolean);
    const headings = document.querySelectorAll('[role="heading"], h1, h2, h3, h4, h5, h6');
    for (const heading of headings) {
      const text = (heading.textContent || '').trim().toLowerCase();
      if (targetTexts.some((targetText) => text === targetText || text.startsWith(targetText))) {
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
