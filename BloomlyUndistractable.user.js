// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.4
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
        'nav a[href="/"]',           // Главная
        'nav a[href="/explore"]',    // Интересное
        'nav a[href="/shop"]',       // Магазин (in Categories)
        'aside a[href="/shop"]',     // Магазин (in Categories)
    ];

    // Classes that indicate active/current state (common patterns)
    const ACTIVE_CLASS_PATTERNS = [
        'active', 'current', 'selected', 'open', 'focused',
        'router-link-active', 'router-link-exact-active',
        'nuxt-link-active', 'nuxt-link-exact-active',
        'v-active', 'is-active', 'has-focus'
    ];

    // Classes to always remove from Dealers' Den
    const BLACKLISTED_CLASS_PATTERNS = [
        'dealers', 'den', 'highlight', 'special', 'featured', 'promo',
        'unique', 'cta', 'primary', 'accent', 'brand', 'custom'
    ];

    // Styles to copy from reference element
    const STYLES_TO_COPY = [
        'fontWeight', 'fontSize', 'color', 'backgroundColor',
        'background', 'border', 'borderRadius', 'padding', 'margin',
        'textDecoration', 'textTransform', 'letterSpacing',
        'display', 'alignItems', 'justifyContent', 'gap',
        'lineHeight', 'fontFamily'
    ];

    // Icon styles to copy
    const ICON_STYLES_TO_COPY = [
        'width', 'height', 'margin', 'padding', 'borderRadius',
        'opacity', 'filter', 'color', 'backgroundColor', 'background',
        'boxShadow', 'transform', 'transition'
    ];

    function getReferenceElement() {
        for (const selector of REFERENCE_SELECTORS) {
            const el = document.querySelector(selector);
            if (el && el.offsetParent !== null) {
                return el;
            }
        }
        const fallbacks = document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]');
        for (const el of fallbacks) {
            if (el.offsetParent !== null && !el.href.includes('/dealers-den')) {
                return el;
            }
        }
        return null;
    }

    function isActiveClass(className) {
        const lower = className.toLowerCase();
        return ACTIVE_CLASS_PATTERNS.some(pattern => lower.includes(pattern));
    }

    function isBlacklistedClass(className) {
        const lower = className.toLowerCase();
        return BLACKLISTED_CLASS_PATTERNS.some(pattern => lower.includes(pattern));
    }

    function syncClasses(dealersDen, reference) {
        // Get all classes from reference
        const refClasses = new Set(reference.classList);
        const ddClasses = new Set(dealersDen.classList);

        // 1. Add all reference classes that Dealers' Den doesn't have
        for (const cls of refClasses) {
            if (!ddClasses.has(cls) && !isBlacklistedClass(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // 2. Remove blacklisted classes
        for (const cls of ddClasses) {
            if (isBlacklistedClass(cls)) {
                dealersDen.classList.remove(cls);
            }
        }

        // 3. Sync active state: if reference has active class, ensure Dealers' Den has it too
        const refActiveClasses = Array.from(refClasses).filter(isActiveClass);
        for (const cls of refActiveClasses) {
            if (!dealersDen.classList.contains(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // 4. If we're on /dealers-den page, force active classes
        if (location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/')) {
            for (const cls of refActiveClasses) {
                dealersDen.classList.add(cls);
            }
            // Also add common active patterns
            ACTIVE_CLASS_PATTERNS.forEach(pattern => {
                dealersDen.classList.add(pattern);
            });
        }
    }

    function syncIconClasses(dealersDen, reference) {
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (!ddImg || !refImg) return;

        const refImgClasses = new Set(refImg.classList);
        const ddImgClasses = new Set(ddImg.classList);

        for (const cls of refImgClasses) {
            if (!ddImgClasses.has(cls) && !isBlacklistedClass(cls)) {
                ddImg.classList.add(cls);
            }
        }
        for (const cls of ddImgClasses) {
            if (isBlacklistedClass(cls)) {
                ddImg.classList.remove(cls);
            }
        }
    }

    function applyInlineStyles(dealersDen, reference) {
        const refStyles = window.getComputedStyle(reference);
        const ddStyles = window.getComputedStyle(dealersDen);

        let needsUpdate = false;
        for (const prop of STYLES_TO_COPY) {
            if (ddStyles[prop] !== refStyles[prop]) {
                needsUpdate = true;
                break;
            }
        }
        if (!needsUpdate) return;

        for (const prop of STYLES_TO_COPY) {
            const value = refStyles[prop];
            if (value && value !== 'initial' && value !== 'inherit' && value !== 'unset') {
                dealersDen.style.setProperty(prop, value, 'important');
            }
        }
    }

    function applyIconStyles(dealersDen, reference) {
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (!ddImg || !refImg) return;

        const refImgStyles = window.getComputedStyle(refImg);
        const ddImgStyles = window.getComputedStyle(ddImg);

        for (const prop of ICON_STYLES_TO_COPY) {
            if (ddImgStyles[prop] !== refImgStyles[prop]) {
                ddImg.style.setProperty(prop, refImgStyles[prop], 'important');
            }
        }
        if (!refImgStyles.filter || refImgStyles.filter === 'none') {
            ddImg.style.setProperty('filter', 'none', 'important');
        }
    }

    function injectFallbackHoverStyles() {
        // Fallback CSS injection for cases where class syncing isn't enough
        let styleEl = document.getElementById('bloomly-undistractable-fallback');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'bloomly-undistractable-fallback';
            document.head.appendChild(styleEl);
        }

        const css = `
            /* Force Dealers' Den to behave like standard nav links */
            ${DEALERS_DEN_SELECTOR} {
                all: unset !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                padding: 8px 12px !important;
                border-radius: 8px !important;
                color: inherit !important;
                text-decoration: none !important;
                font: inherit !important;
                background: transparent !important;
                border: none !important;
                cursor: pointer !important;
                transition: background-color 0.15s ease, color 0.15s ease !important;
            }

            ${DEALERS_DEN_SELECTOR}:hover {
                background-color: var(--hover-bg, rgba(255,255,255,0.08)) !important;
            }

            ${DEALERS_DEN_SELECTOR}:focus-visible {
                outline: 2px solid var(--focus-color, #5865f2) !important;
                outline-offset: 2px !important;
            }

            ${DEALERS_DEN_SELECTOR}.active,
            ${DEALERS_DEN_SELECTOR}.current,
            ${DEALERS_DEN_SELECTOR}.selected,
            ${DEALERS_DEN_SELECTOR}.router-link-active,
            ${DEALERS_DEN_SELECTOR}.router-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.is-active,
            ${DEALERS_DEN_SELECTOR}[aria-current="page"] {
                background-color: var(--active-bg, rgba(88, 101, 242, 0.15)) !important;
                color: var(--active-color, #5865f2) !important;
                font-weight: 600 !important;
            }

            ${DEALERS_DEN_SELECTOR} img,
            ${DEALERS_DEN_SELECTOR} svg,
            ${DEALERS_DEN_SELECTOR} i,
            ${DEALERS_DEN_SELECTOR} [class*="icon"] {
                width: 20px !important;
                height: 20px !important;
                flex-shrink: 0 !important;
                filter: none !important;
                opacity: 1 !important;
            }
        `;

        if (styleEl.textContent !== css.trim()) {
            styleEl.textContent = css;
        }
    }

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return false;

        const reference = getReferenceElement();
        if (!reference) return false;

        // Sync classes (handles hover via CSS, active via JS)
        syncClasses(dealersDen, reference);
        syncIconClasses(dealersDen, reference);

        // Apply inline styles as backup
        applyInlineStyles(dealersDen, reference);
        applyIconStyles(dealersDen, reference);

        // Inject fallback styles
        injectFallbackHoverStyles();

        return true;
    }

    // Initial normalization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeDealersDen);
    } else {
        normalizeDealersDen();
    }

    // Observe for class/style changes on reference elements to sync active state
    const classObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.matches && REFERENCE_SELECTORS.some(s => target.matches(s))) {
                    normalizeDealersDen();
                    break;
                }
            }
        }
    });

    // Start observing once we have reference elements
    function startClassObserver() {
        const refs = REFERENCE_SELECTORS.flatMap(s => Array.from(document.querySelectorAll(s)));
        refs.forEach(el => {
            if (el.offsetParent !== null) {
                classObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startClassObserver);
    } else {
        startClassObserver();
    }

    // Observe for dynamic changes (SPA navigation, etc.)
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches(DEALERS_DEN_SELECTOR)) {
                            shouldCheck = true;
                        } else if (node.querySelector && node.querySelector(DEALERS_DEN_SELECTOR)) {
                            shouldCheck = true;
                        }
                        for (const selector of REFERENCE_SELECTORS) {
                            if (node.matches && node.matches(selector)) {
                                shouldCheck = true;
                                // Start observing new reference elements
                                classObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
                            }
                        }
                    }
                }
            } else if (mutation.type === 'attributes' &&
                       mutation.target.matches &&
                       mutation.target.matches(DEALERS_DEN_SELECTOR)) {
                shouldCheck = true;
            }
        }
        if (shouldCheck) {
            requestAnimationFrame(() => {
                requestAnimationFrame(normalizeDealersDen);
            });
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'href']
    });

    // Run on navigation (for SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(normalizeDealersDen, 50);
        }
    }).observe(document, { subtree: true, childList: true });

    // Periodic check as fallback
    setInterval(normalizeDealersDen, 2000);
})();