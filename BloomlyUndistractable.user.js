// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.5
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
        'v-active', 'is-active', 'has-focus',
        'nav-item-active', 'menu-item-active', 'sidebar-item-active'
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

    let styleInjected = false;
    let lastPathname = location.pathname;

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

    function injectCriticalStyles() {
        if (styleInjected) return;
        
        const styleEl = document.createElement('style');
        styleEl.id = 'bloomly-undistractable-critical';
        styleEl.textContent = `
            /* Critical: Force Dealers' Den to match other menu items exactly */
            ${DEALERS_DEN_SELECTOR} {
                all: initial !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
                padding: 8px 12px !important;
                border-radius: 8px !important;
                color: var(--text-primary, #fff) !important;
                text-decoration: none !important;
                font: inherit !important;
                background: transparent !important;
                border: none !important;
                cursor: pointer !important;
                transition: background-color 0.15s ease, color 0.15s ease !important;
                box-sizing: border-box !important;
                line-height: 1.4 !important;
            }

            ${DEALERS_DEN_SELECTOR}:hover {
                background-color: var(--hover-bg, rgba(255,255,255,0.1)) !important;
                color: var(--text-primary, #fff) !important;
            }

            ${DEALERS_DEN_SELECTOR}:focus-visible {
                outline: 2px solid var(--focus-color, #5865f2) !important;
                outline-offset: 2px !important;
            }

            ${DEALERS_DEN_SELECTOR}:active {
                background-color: var(--active-bg, rgba(255,255,255,0.15)) !important;
            }

            /* Active/Current state - highest specificity */
            ${DEALERS_DEN_SELECTOR}.active,
            ${DEALERS_DEN_SELECTOR}.current,
            ${DEALERS_DEN_SELECTOR}.selected,
            ${DEALERS_DEN_SELECTOR}.router-link-active,
            ${DEALERS_DEN_SELECTOR}.router-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-active,
            ${DEALERS_DEN_SELECTOR}.nuxt-link-exact-active,
            ${DEALERS_DEN_SELECTOR}.is-active,
            ${DEALERS_DEN_SELECTOR}[aria-current="page"],
            ${DEALERS_DEN_SELECTOR}[data-active="true"] {
                background-color: var(--active-bg, rgba(88, 101, 242, 0.2)) !important;
                color: var(--active-color, #5865f2) !important;
                font-weight: 600 !important;
            }

            /* Icon normalization */
            ${DEALERS_DEN_SELECTOR} img,
            ${DEALERS_DEN_SELECTOR} svg,
            ${DEALERS_DEN_SELECTOR} i,
            ${DEALERS_DEN_SELECTOR} [class*="icon"] {
                width: 20px !important;
                height: 20px !important;
                flex-shrink: 0 !important;
                filter: none !important;
                opacity: 1 !important;
                color: inherit !important;
            }

            /* Icon on hover/active */
            ${DEALERS_DEN_SELECTOR}:hover img,
            ${DEALERS_DEN_SELECTOR}:hover svg,
            ${DEALERS_DEN_SELECTOR}:hover i,
            ${DEALERS_DEN_SELECTOR}:hover [class*="icon"],
            ${DEALERS_DEN_SELECTOR}.active img,
            ${DEALERS_DEN_SELECTOR}.active svg,
            ${DEALERS_DEN_SELECTOR}.active i,
            ${DEALERS_DEN_SELECTOR}.active [class*="icon"] {
                filter: none !important;
                opacity: 1 !important;
                color: inherit !important;
            }
        `;
        document.head.appendChild(styleEl);
        styleInjected = true;
    }

    function syncClasses(dealersDen, reference) {
        const refClasses = new Set(reference.classList);
        const ddClasses = new Set(dealersDen.classList);

        // Add all reference classes (except blacklisted)
        for (const cls of refClasses) {
            if (!ddClasses.has(cls) && !isBlacklistedClass(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // Remove blacklisted classes
        for (const cls of ddClasses) {
            if (isBlacklistedClass(cls)) {
                dealersDen.classList.remove(cls);
            }
        }

        // Force active classes if reference has them
        const refActiveClasses = Array.from(refClasses).filter(isActiveClass);
        for (const cls of refActiveClasses) {
            if (!dealersDen.classList.contains(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // Force active on current page
        if (location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/')) {
            for (const cls of refActiveClasses) {
                dealersDen.classList.add(cls);
            }
            ACTIVE_CLASS_PATTERNS.forEach(pattern => {
                dealersDen.classList.add(pattern);
            });
            dealersDen.setAttribute('aria-current', 'page');
            dealersDen.setAttribute('data-active', 'true');
        } else {
            dealersDen.removeAttribute('aria-current');
            dealersDen.removeAttribute('data-active');
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

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return false;

        // Inject critical CSS immediately
        injectCriticalStyles();

        const reference = getReferenceElement();
        if (!reference) return false;

        // Sync classes (handles active state via CSS selectors)
        syncClasses(dealersDen, reference);
        syncIconClasses(dealersDen, reference);

        // Apply inline styles as backup
        applyInlineStyles(dealersDen, reference);
        applyIconStyles(dealersDen, reference);

        return true;
    }

    // Aggressive re-normalization to catch router overrides
    function forceNormalize() {
        normalizeDealersDen();
        // Double-check after a tick
        requestAnimationFrame(normalizeDealersDen);
        // Triple-check after router settles
        setTimeout(normalizeDealersDen, 50);
        setTimeout(normalizeDealersDen, 200);
    }

    // Initial
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', forceNormalize);
    } else {
        forceNormalize();
    }

    // Watch for class changes on ALL nav links to sync active state instantly
    const classObserver = new MutationObserver((mutations) => {
        let shouldSync = false;
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                // If any nav link changes class, re-sync
                if (target.matches && target.matches('nav a[href^="/"], aside a[href^="/"]')) {
                    shouldSync = true;
                    break;
                }
            }
        }
        if (shouldSync) {
            forceNormalize();
        }
    });

    function startClassObserver() {
        const refs = document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]');
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

    // Observe DOM changes
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
                        if (node.matches && node.matches('nav a[href^="/"], aside a[href^="/"]')) {
                            shouldCheck = true;
                            classObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
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
            forceNormalize();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'href']
    });

    // Navigation detection - run immediately on URL change
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            lastPathname = location.pathname;
            forceNormalize();
        }
    }).observe(document, { subtree: true, childList: true });

    // Also listen for popstate/hashchange
    window.addEventListener('popstate', forceNormalize);
    window.addEventListener('hashchange', forceNormalize);

    // Periodic aggressive check
    setInterval(forceNormalize, 1000);
})();