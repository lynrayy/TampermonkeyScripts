// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.9
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
    const NAV_LINK_SELECTORS = 'nav a[href^="/"], aside a[href^="/"]';

    const ACTIVE_CLASS_PATTERNS = [
        'active', 'current', 'selected', 'router-link-active',
        'router-link-exact-active', 'nuxt-link-active', 'nuxt-link-exact-active',
        'is-active', 'v-active', 'nav-item-active', 'menu-item-active'
    ];

    const BLACKLISTED_CLASS_PATTERNS = [
        'dealers', 'den', 'highlight', 'special', 'featured', 'promo',
        'unique', 'cta', 'primary', 'accent', 'brand', 'custom'
    ];

    // All CSS properties to copy for pixel-perfect match
    const ALL_STYLE_PROPS = [
        'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight', 'letterSpacing', 'textTransform', 'textDecoration', 'textDecorationColor', 'textDecorationLine', 'textDecorationStyle', 'textDecorationThickness', 'textUnderlineOffset', 'wordSpacing', 'color', 'direction', 'unicodeBidi', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize', 'hyphens', 'textAlign', 'textAlignLast', 'textIndent', 'textJustify', 'textShadow', 'textOverflow',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'backgroundColor', 'backgroundImage', 'backgroundRepeat', 'backgroundPosition', 'backgroundSize', 'backgroundAttachment', 'backgroundOrigin', 'backgroundClip',
        'gap', 'alignItems', 'justifyContent', 'alignContent', 'alignSelf', 'justifyItems', 'justifySelf', 'placeItems', 'placeContent', 'placeSelf',
        'display', 'flexDirection', 'flexWrap', 'flexFlow', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'order',
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'boxSizing',
        'transition', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
        'boxShadow', 'opacity', 'filter', 'transform', 'transformOrigin', 'willChange',
        'cursor', 'pointerEvents', 'userSelect'
    ];

    const ICON_STYLE_PROPS = [
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderRadius', 'opacity', 'filter', 'color', 'backgroundColor', 'background',
        'boxShadow', 'transform', 'transition', 'flexShrink', 'flexGrow', 'flexBasis',
        'display', 'verticalAlign', 'objectFit', 'objectPosition'
    ];

    let cachedActiveStyles = null;
    let cachedActiveClasses = null;
    let cachedIconStyles = null;
    let cachedIconClasses = null;

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

    function getAllNavLinks() {
        return document.querySelectorAll(NAV_LINK_SELECTORS);
    }

    function findActiveReference(excludeSelector = null) {
        const links = getAllNavLinks();
        for (const el of links) {
            if (excludeSelector && el.matches(excludeSelector)) continue;
            if (el.offsetParent !== null && isActiveElement(el)) {
                return el;
            }
        }
        return null;
    }

    function findAnyVisibleReference(excludeSelector = null) {
        const links = getAllNavLinks();
        for (const el of links) {
            if (excludeSelector && el.matches(excludeSelector)) continue;
            if (el.offsetParent !== null) return el;
        }
        return null;
    }

    function captureActiveProfile() {
        const activeEl = findActiveReference(DEALERS_DEN_SELECTOR);
        if (!activeEl) return false;

        const refStyles = getComputedStyle(activeEl);
        cachedActiveStyles = {};
        for (const prop of ALL_STYLE_PROPS) {
            const val = refStyles[prop];
            if (val && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                cachedActiveStyles[prop] = val;
            }
        }
        cachedActiveClasses = Array.from(activeEl.classList).filter(c => !isBlacklistedClass(c));

        // Capture icon
        const activeIcon = activeEl.querySelector('img, svg, i, [class*="icon"]');
        if (activeIcon) {
            const iconStyles = getComputedStyle(activeIcon);
            cachedIconStyles = {};
            for (const prop of ICON_STYLE_PROPS) {
                const val = iconStyles[prop];
                if (val && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                    cachedIconStyles[prop] = val;
                }
            }
            cachedIconClasses = Array.from(activeIcon.classList).filter(c => !isBlacklistedClass(c));
        }
        return true;
    }

    function applyStyles(target, styles) {
        for (const [prop, val] of Object.entries(styles)) {
            target.style.setProperty(prop, val, 'important');
        }
    }

    function syncClasses(target, classes) {
        // Remove blacklisted
        for (const cls of target.classList) {
            if (isBlacklistedClass(cls)) target.classList.remove(cls);
        }
        // Add target classes
        for (const cls of classes) {
            if (!target.classList.contains(cls)) target.classList.add(cls);
        }
    }

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return;

        const isDealersDenActive = location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/');

        // Always try to capture active profile from current page (for future use)
        if (!isDealersDenActive) {
            captureActiveProfile();
        }

        // Get a reference for base (non-active) styles
        const baseRef = findAnyVisibleReference(DEALERS_DEN_SELECTOR);
        if (baseRef) {
            // Sync base classes
            const baseClasses = Array.from(baseRef.classList).filter(c => !isBlacklistedClass(c));
            syncClasses(dealersDen, baseClasses);

            // Copy base styles
            const baseStyles = getComputedStyle(baseRef);
            for (const prop of ALL_STYLE_PROPS) {
                const val = baseStyles[prop];
                if (val && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                    dealersDen.style.setProperty(prop, val, 'important');
                }
            }

            // Sync base icon
            const baseIcon = baseRef.querySelector('img, svg, i, [class*="icon"]');
            const ddIcon = dealersDen.querySelector('img, svg, i, [class*="icon"]');
            if (baseIcon && ddIcon) {
                syncClasses(ddIcon, Array.from(baseIcon.classList).filter(c => !isBlacklistedClass(c)));
                const baseIconStyles = getComputedStyle(baseIcon);
                for (const prop of ICON_STYLE_PROPS) {
                    const val = baseIconStyles[prop];
                    if (val && val !== 'initial' && val !== 'inherit' && val !== 'unset') {
                        ddIcon.style.setProperty(prop, val, 'important');
                    }
                }
            }
        }

        // If Dealers' Den should be active, apply cached active profile
        if (isDealersDenActive) {
            if (cachedActiveStyles) {
                applyStyles(dealersDen, cachedActiveStyles);
            }
            if (cachedActiveClasses) {
                for (const cls of cachedActiveClasses) {
                    if (!dealersDen.classList.contains(cls)) dealersDen.classList.add(cls);
                }
            }
            dealersDen.setAttribute('aria-current', 'page');

            // Apply cached active icon styles
            const ddIcon = dealersDen.querySelector('img, svg, i, [class*="icon"]');
            if (ddIcon && cachedIconStyles) {
                applyStyles(ddIcon, cachedIconStyles);
            }
            if (ddIcon && cachedIconClasses) {
                for (const cls of cachedIconClasses) {
                    if (!ddIcon.classList.contains(cls)) ddIcon.classList.add(cls);
                }
            }
        } else {
            dealersDen.removeAttribute('aria-current');
        }

        // Ensure icon filter is clean
        const ddIcon = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        if (ddIcon) {
            ddIcon.style.setProperty('filter', 'none', 'important');
            ddIcon.style.setProperty('opacity', '1', 'important');
        }

        injectCSS();
    }

    function injectCSS() {
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