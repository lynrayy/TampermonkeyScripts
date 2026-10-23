// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.3
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

        // 1. Copy all classes from reference to Dealers' Den (for CSS hover/focus rules)
        const refClasses = Array.from(reference.classList);
        refClasses.forEach(cls => {
            if (!dealersDen.classList.contains(cls)) {
                dealersDen.classList.add(cls);
            }
        });

        // 2. Remove special classes that might add unique styling
        const classList = Array.from(dealersDen.classList);
        classList.forEach(cls => {
            if (cls.includes('dealers') || cls.includes('den') || cls.includes('highlight') ||
                cls.includes('special') || cls.includes('featured') || cls.includes('promo') ||
                cls.includes('unique') || cls.includes('cta') || cls.includes('primary')) {
                dealersDen.classList.remove(cls);
            }
        });

        // 3. Apply reference inline styles to Dealers' Den
        for (const prop of STYLES_TO_COPY) {
            const value = refStyles[prop];
            if (value && value !== 'initial' && value !== 'inherit' && value !== 'unset') {
                dealersDen.style.setProperty(prop, value, 'important');
            }
        }

        // 4. Normalize the inner icon to match reference icons
        const ddImg = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        const refImg = reference.querySelector('img, svg, i, [class*="icon"]');
        if (ddImg && refImg) {
            // Copy icon classes
            const refImgClasses = Array.from(refImg.classList);
            refImgClasses.forEach(cls => {
                if (!ddImg.classList.contains(cls)) {
                    ddImg.classList.add(cls);
                }
            });

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