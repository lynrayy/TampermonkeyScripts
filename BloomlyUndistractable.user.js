// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.7
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
    ];

    // Styles to copy from reference (excludes layout that should stay natural)
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
        'transition', 'transitionDuration', 'transitionTimingFunction', 'transitionProperty'
    ];

    // Icon styles to copy
    const ICON_STYLES_TO_COPY = [
        'width', 'height', 'margin', 'padding', 'borderRadius',
        'opacity', 'filter', 'color', 'backgroundColor', 'background',
        'boxShadow', 'transform', 'transition', 'flexShrink'
    ];

    function getReferenceElement() {
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

    function isBlacklistedClass(className) {
        const lower = className.toLowerCase();
        return ['dealers', 'den', 'highlight', 'special', 'featured', 'promo', 'unique', 'cta', 'primary', 'accent', 'brand', 'custom'].some(p => lower.includes(p));
    }

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return;

        const reference = getReferenceElement();
        if (!reference) return;

        // 1. Remove blacklisted classes
        for (const cls of dealersDen.classList) {
            if (isBlacklistedClass(cls)) dealersDen.classList.remove(cls);
        }

        // 2. Copy reference classes (for CSS hover/active states)
        for (const cls of reference.classList) {
            if (!isBlacklistedClass(cls) && !dealersDen.classList.contains(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // 3. Copy computed styles
        const refStyles = getComputedStyle(reference);
        const ddStyles = getComputedStyle(dealersDen);
        for (const prop of STYLES_TO_COPY) {
            const val = refStyles[prop];
            if (val && val !== ddStyles[prop] && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                dealersDen.style.setProperty(prop, val, 'important');
            }
        }

        // 4. Sync icon
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (ddImg && refImg) {
            for (const cls of refImg.classList) {
                if (!isBlacklistedClass(cls) && !ddImg.classList.contains(cls)) {
                    ddImg.classList.add(cls);
                }
            }
            for (const cls of ddImg.classList) {
                if (isBlacklistedClass(cls)) ddImg.classList.remove(cls);
            }
            const refImgStyles = getComputedStyle(refImg);
            const ddImgStyles = getComputedStyle(ddImg);
            for (const prop of ICON_STYLES_TO_COPY) {
                const val = refImgStyles[prop];
                if (val && val !== ddImgStyles[prop] && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                    ddImg.style.setProperty(prop, val, 'important');
                }
            }
            if (!refImgStyles.filter || refImgStyles.filter === 'none') {
                ddImg.style.setProperty('filter', 'none', 'important');
            }
        }

        // 5. Inject minimal CSS for hover/active states (only what's needed)
        injectMinimalCSS();
    }

    function injectMinimalCSS() {
        if (document.getElementById('bloomly-undistractable')) return;
        const style = document.createElement('style');
        style.id = 'bloomly-undistractable';
        style.textContent = `
            /* Only override hover/active states - let copied classes/styles handle the rest */
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

    function setActiveAttribute() {
        const link = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!link) return;
        const isActive = location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/');
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }

    // Initial
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { normalizeDealersDen(); setActiveAttribute(); });
    } else {
        normalizeDealersDen(); setActiveAttribute();
    }

    // Re-run on navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            normalizeDealersDen();
            setActiveAttribute();
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('popstate', () => { normalizeDealersDen(); setActiveAttribute(); });
    window.addEventListener('hashchange', () => { normalizeDealersDen(); setActiveAttribute(); });

    // Periodic fallback
    setInterval(() => { normalizeDealersDen(); setActiveAttribute(); }, 3000);
})();