// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.2
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

    // Hover/focus/active states to normalize
    const INTERACTION_STATES = [':hover', ':focus', ':active', ':focus-visible'];

    function getReferenceElement() {
        for (const selector of REFERENCE_SELECTORS) {
            const el = document.querySelector(selector);
            if (el && el.offsetParent !== null) { // visible element
                return el;
            }
        }
        // Fallback: any visible nav/aside link
        const fallbacks = document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]');
        for (const el of fallbacks) {
            if (el.offsetParent !== null && !el.href.includes('/dealers-den')) {
                return el;
            }
        }
        return null;
    }

    function injectHoverStyles() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        const reference = getReferenceElement();
        if (!dealersDen || !reference) return;

        // Get reference element's classes to match its hover rules
        const refClasses = Array.from(reference.classList).join('.');
        const refTag = reference.tagName.toLowerCase();
        const refSelector = `${refTag}${refClasses ? '.' + refClasses : ''}`;

        // Create style element to override hover/focus/active states
        let styleEl = document.getElementById('bloomly-undistractable-hover');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'bloomly-undistractable-hover';
            document.head.appendChild(styleEl);
        }

        // Build CSS that forces Dealers' Den to use same interaction styles as reference
        // We target the Dealers' Den specifically and reset its interaction states
        // to match the general nav link behavior
        const css = `
            /* Normalize Dealers' Den interaction states to match other menu items */
            ${DEALERS_DEN_SELECTOR}:hover,
            ${DEALERS_DEN_SELECTOR}:focus,
            ${DEALERS_DEN_SELECTOR}:active,
            ${DEALERS_DEN_SELECTOR}:focus-visible {
                /* Reset any special hover styles */
                background-color: inherit !important;
                color: inherit !important;
                border-color: inherit !important;
                box-shadow: inherit !important;
                transform: inherit !important;
                filter: inherit !important;
                opacity: inherit !important;
                text-decoration: inherit !important;
            }

            /* Ensure icon inside also matches on interaction */
            ${DEALERS_DEN_SELECTOR}:hover img,
            ${DEALERS_DEN_SELECTOR}:hover svg,
            ${DEALERS_DEN_SELECTOR}:hover i,
            ${DEALERS_DEN_SELECTOR}:hover [class*="icon"],
            ${DEALERS_DEN_SELECTOR}:focus img,
            ${DEALERS_DEN_SELECTOR}:focus svg,
            ${DEALERS_DEN_SELECTOR}:focus i,
            ${DEALERS_DEN_SELECTOR}:focus [class*="icon"],
            ${DEALERS_DEN_SELECTOR}:active img,
            ${DEALERS_DEN_SELECTOR}:active svg,
            ${DEALERS_DEN_SELECTOR}:active i,
            ${DEALERS_DEN_SELECTOR}:active [class*="icon"] {
                filter: none !important;
                opacity: inherit !important;
                transform: inherit !important;
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

        const refStyles = window.getComputedStyle(reference);
        const ddStyles = window.getComputedStyle(dealersDen);

        // Check if styles already match (avoid unnecessary work)
        let needsUpdate = false;
        for (const prop of STYLES_TO_COPY) {
            if (ddStyles[prop] !== refStyles[prop]) {
                needsUpdate = true;
                break;
            }
        }

        if (!needsUpdate) return false;

        // Apply reference styles to Dealers' Den
        for (const prop of STYLES_TO_COPY) {
            const value = refStyles[prop];
            if (value && value !== 'initial' && value !== 'inherit' && value !== 'unset') {
                dealersDen.style.setProperty(prop, value, 'important');
            }
        }

        // Remove any classes that might be adding special styling
        const classList = Array.from(dealersDen.classList);
        classList.forEach(cls => {
            if (cls.includes('dealers') || cls.includes('den') || cls.includes('highlight') ||
                cls.includes('special') || cls.includes('featured') || cls.includes('promo')) {
                dealersDen.classList.remove(cls);
            }
        });

        // Normalize the inner icon to match reference icons
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (ddImg && refImg) {
            const refImgStyles = window.getComputedStyle(refImg);
            const ddImgStyles = window.getComputedStyle(ddImg);
            for (const prop of ICON_STYLES_TO_COPY) {
                if (ddImgStyles[prop] !== refImgStyles[prop]) {
                    ddImg.style.setProperty(prop, refImgStyles[prop], 'important');
                }
            }
            // Ensure filter is explicitly cleared if reference has none
            if (!refImgStyles.filter || refImgStyles.filter === 'none') {
                ddImg.style.setProperty('filter', 'none', 'important');
            }
        }

        // Inject hover/focus/active styles
        injectHoverStyles();

        return true;
    }

    // Initial normalization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeDealersDen);
    } else {
        normalizeDealersDen();
    }

    // Observe for dynamic changes (SPA navigation, etc.)
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check if Dealers' Den was added or modified
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches(DEALERS_DEN_SELECTOR)) {
                            shouldCheck = true;
                        } else if (node.querySelector && node.querySelector(DEALERS_DEN_SELECTOR)) {
                            shouldCheck = true;
                        }
                    }
                }
                // Check if reference elements were added
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        for (const selector of REFERENCE_SELECTORS) {
                            if (node.matches && node.matches(selector)) {
                                shouldCheck = true;
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
            // Small delay to let styles settle
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

    // Also run on navigation (for SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(normalizeDealersDen, 100);
        }
    }).observe(document, { subtree: true, childList: true });

    // Periodic check as fallback
    setInterval(normalizeDealersDen, 2000);
})();