// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Normalize "Dealers' Den" menu button style to match other menu items
// @author       Lynrayy
// @match        https://bloomly.fun/*
// @match        https://bloomly.xyz/*
// @grant        none
// @run-at       document-start
// @updateURL    https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/master/BloomlyUndistractable.user.js
// @downloadURL  https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/master/BloomlyUndistractable.user.js
// ==/UserScript==

(function() {
    'use strict';

    const DEALERS_DEN_SELECTOR = 'a[href="/dealers-den"]';
    const REFERENCE_SELECTORS = [
        'aside a[href="/shop"]',       // Магазин in Categories (same section)
        'aside a[href="/scheduled-posts"]', // Черновики и отложенные (same section)
        'nav a[href="/"]',             // Главная
        'nav a[href="/explore"]',      // Интересное
        'nav a[href="/notifications"]', // Уведомления
        'nav a[href="/messages"]',     // Сообщения
        'nav a[href="/friends"]',      // Друзья
        'nav a[href="/groups"]',       // Группы
        'nav a[href="/bookmarks"]',    // Закладки
        'nav a[href="/subscriptions"]', // Premium
        'nav a[href="/settings/profile"]', // Настройки
    ];

    const ACTIVE_CLASS_PATTERNS = [
        'active', 'current', 'selected', 'router-link-active',
        'router-link-exact-active', 'nuxt-link-active', 'nuxt-link-exact-active',
        'is-active', 'v-active', 'nav-item-active', 'menu-item-active'
    ];

    const BLACKLISTED_CLASS_PATTERNS = [
        'dealers', 'den', 'highlight', 'special', 'featured', 'promo',
        'unique', 'cta', 'primary', 'accent', 'brand', 'custom'
    ];

    const STYLES_TO_COPY = [
        'fontSize', 'fontWeight', 'fontFamily', 'lineHeight',
        'color', 'textDecoration', 'letterSpacing', 'textTransform',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'borderRadius', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'backgroundColor', 'backgroundImage', 'backgroundRepeat', 'backgroundPosition', 'backgroundSize',
        'gap', 'alignItems', 'justifyContent',
        'transition', 'transitionDuration', 'transitionTimingFunction', 'transitionProperty',
        'boxShadow'
    ];

    const ICON_STYLES_TO_COPY = [
        'width', 'height', 'margin', 'padding', 'borderRadius',
        'opacity', 'filter', 'color', 'backgroundColor', 'background',
        'boxShadow', 'transform', 'transition', 'flexShrink'
    ];

    function isActiveElement(el) {
        if (el.getAttribute('aria-current') === 'page') return true;
        for (const cls of el.classList) {
            const lower = cls.toLowerCase();
            if (ACTIVE_CLASS_PATTERNS.some(p => lower.includes(p))) return true;
        }
        return false;
    }

    function isBlacklistedClass(className) {
        const lower = className.toLowerCase();
        return BLACKLISTED_CLASS_PATTERNS.some(p => lower.includes(p));
    }

    function getReferenceElement(preferActive = false) {
        // First try to find an active element (not Dealers' Den)
        if (preferActive) {
            for (const selector of REFERENCE_SELECTORS) {
                const el = document.querySelector(selector);
                if (el && el.offsetParent !== null && isActiveElement(el)) return el;
            }
            // Fallback: any visible active nav/aside link
            const allLinks = document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]');
            for (const el of allLinks) {
                if (el.offsetParent !== null && !el.href.includes('/dealers-den') && isActiveElement(el)) {
                    return el;
                }
            }
        }
        // Default: first visible reference
        for (const selector of REFERENCE_SELECTORS) {
            const el = document.querySelector(selector);
            if (el && el.offsetParent !== null) return el;
        }
        const fallbacks = document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]');
        for (const el of fallbacks) {
            if (el.offsetParent !== null && !el.href.includes('/dealers-den')) return el;
        }
        return null;
    }

    function copyStyles(target, source, properties) {
        const srcStyles = getComputedStyle(source);
        const tgtStyles = getComputedStyle(target);
        for (const prop of properties) {
            const val = srcStyles[prop];
            if (val && val !== tgtStyles[prop] && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                target.style.setProperty(prop, val, 'important');
            }
        }
    }

    function syncClasses(target, source) {
        // Remove blacklisted
        for (const cls of target.classList) {
            if (isBlacklistedClass(cls)) target.classList.remove(cls);
        }
        // Add source classes
        for (const cls of source.classList) {
            if (!isBlacklistedClass(cls) && !target.classList.contains(cls)) {
                target.classList.add(cls);
            }
        }
    }

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return;

        // Determine if Dealers' Den should be active
        const isDealersDenActive = location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/');

        // Get reference: active element if Dealers' Den is active, otherwise default
        const reference = getReferenceElement(isDealersDenActive);
        if (!reference) return;

        // Sync classes (this gives us hover/active CSS from site's stylesheet)
        syncClasses(dealersDen, reference);

        // Copy computed styles from reference
        copyStyles(dealersDen, reference, STYLES_TO_COPY);

        // Sync icon
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (ddImg && refImg) {
            syncClasses(ddImg, refImg);
            copyStyles(ddImg, refImg, ICON_STYLES_TO_COPY);
            const refImgStyles = getComputedStyle(refImg);
            if (!refImgStyles.filter || refImgStyles.filter === 'none') {
                ddImg.style.setProperty('filter', 'none', 'important');
            }
        }

        // Set aria-current for CSS targeting
        if (isDealersDenActive) {
            dealersDen.setAttribute('aria-current', 'page');
        } else {
            dealersDen.removeAttribute('aria-current');
        }

        injectMinimalCSS();
    }

    function injectMinimalCSS() {
        if (document.getElementById('bloomly-undistractable')) return;
        const style = document.createElement('style');
        style.id = 'bloomly-undistractable';
        style.textContent = `
            ${DEALERS_DEN_SELECTOR}:hover {
                background-color: var(--hover-bg, rgba(255,255,255,0.08)) !important;
            }
            ${DEALERS_DEN_SELECTOR}:focus-visible {
                outline: 2px solid var(--focus-color, #5865f2) !important;
                outline-offset: 2px !important;
            }
            ${DEALERS_DEN_SELECTOR}[aria-current="page"],
            ${DEALERS_DEN_SELECTOR}.active,
            ${DEALERS_DEN_SELECTOR}.current,
            ${DEALERS_DEN_SELECTOR}.selected,
            ${DEALERS_DEN_SELECTOR}.router-link-active,
            ${DEALERS_DEN_SELECTOR}.router-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.is-active {
                background-color: var(--active-bg, rgba(88, 101, 242, 0.18)) !important;
                color: var(--active-color, #5865f2) !important;
                font-weight: 600 !important;
            }
            ${DEALERS_DEN_SELECTOR} img,
            ${DEALERS_DEN_SELECTOR} svg,
            ${DEALERS_DEN_SELECTOR} i,
            ${DEALERS_DEN_SELECTOR} [class*="icon"] {
                filter: none !important;
                opacity: 1 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // Initial
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeDealersDen);
    } else {
        normalizeDealersDen();
    }

    // Re-run on navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            normalizeDealersDen();
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('popstate', normalizeDealersDen);
    window.addEventListener('hashchange', normalizeDealersDen);

    // Periodic fallback
    setInterval(normalizeDealersDen, 3000);
})();