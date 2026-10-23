// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      2.5
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

    const DEALERS_DEN_SELECTOR = 'a[href="/dealers-den"], a.den-link';

    const INACTIVE_CLASSES = [
        'w-full', 'flex', 'items-center', 'gap-3', 'px-4', 'py-2.5',
        'rounded-2xl', 'text-sm', 'font-semibold', 'transition-all',
        'text-white/65', 'hover:bg-brand-card/50', 'hover:text-white'
    ];

    const ACTIVE_CLASSES = [
        'router-link-active', 'router-link-exact-active',
        'w-full', 'flex', 'items-center', 'gap-3', 'px-4', 'py-2.5',
        'rounded-2xl', 'text-sm', 'font-semibold', 'transition-all',
        'bg-brand-card', 'text-white'
    ];

    const BLACKLISTED_CLASSES = [
        'dealers', 'den', 'highlight', 'special', 'featured', 'promo',
        'unique', 'cta', 'primary', 'accent', 'brand', 'custom'
    ];

    function isDealersDenActive() {
        return location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/');
    }

    function normalizeDealersDen() {
        const dealersDen = document.querySelector(DEALERS_DEN_SELECTOR);
        if (!dealersDen) return false;

        // Remove blacklisted classes
        for (const cls of dealersDen.classList) {
            if (BLACKLISTED_CLASSES.some(b => cls.toLowerCase().includes(b))) {
                dealersDen.classList.remove(cls);
            }
        }

        // Remove router-active classes
        for (const cls of dealersDen.classList) {
            if (cls.includes('router-link-') || cls === 'active' || cls === 'current' || cls === 'selected') {
                dealersDen.classList.remove(cls);
            }
        }

        // Apply correct class set
        const classes = isDealersDenActive() ? ACTIVE_CLASSES : INACTIVE_CLASSES;
        for (const cls of classes) {
            if (!dealersDen.classList.contains(cls)) {
                dealersDen.classList.add(cls);
            }
        }

        // Normalize icon: remove den-icon class, clear filter
        const icon = dealersDen.querySelector('img, svg, i, [class*="icon"]');
        if (icon) {
            if (icon.classList.contains('den-icon')) {
                icon.classList.remove('den-icon');
            }
            icon.style.setProperty('filter', 'none', 'important');
            icon.style.setProperty('opacity', '1', 'important');
        }

        return true;
    }

    function tryNormalize() {
        if (!normalizeDealersDen()) {
            setTimeout(tryNormalize, 100);
        }
    }

    // Initial
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryNormalize);
    } else {
        tryNormalize();
    }

    // Re-run on navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            tryNormalize();
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('popstate', tryNormalize);
    window.addEventListener('hashchange', tryNormalize);
})();