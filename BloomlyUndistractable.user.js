// ==UserScript==
// @name         Bloomly Undistractable
// @namespace    http://tampermonkey.net/
// @version      1.6
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

    const css = `
        /* Reset Dealers' Den to match other menu items */
        a[href="/dealers-den"] {
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

        /* Hover state */
        a[href="/dealers-den"]:hover {
            background-color: var(--hover-bg, rgba(255,255,255,0.1)) !important;
        }

        /* Focus state */
        a[href="/dealers-den"]:focus-visible {
            outline: 2px solid var(--focus-color, #5865f2) !important;
            outline-offset: 2px !important;
        }

        /* Active/Current state - router typically sets aria-current="page" */
        a[href="/dealers-den"][aria-current="page"],
        a[href="/dealers-den"].active,
        a[href="/dealers-den"].current,
        a[href="/dealers-den"].selected,
        a[href="/dealers-den"].router-link-active,
        a[href="/dealers-den"].router-link-exact-active,
        a[href="/dealers-den"].nuxt-link-active,
        a[href="/dealers-den"].nuxt-link-exact-active,
        a[href="/dealers-den"].is-active {
            background-color: var(--active-bg, rgba(88, 101, 242, 0.2)) !important;
            color: var(--active-color, #5865f2) !important;
            font-weight: 600 !important;
        }

        /* Icon normalization */
        a[href="/dealers-den"] img,
        a[href="/dealers-den"] svg,
        a[href="/dealers-den"] i,
        a[href="/dealers-den"] [class*="icon"] {
            width: 20px !important;
            height: 20px !important;
            flex-shrink: 0 !important;
            filter: none !important;
            opacity: 1 !important;
            color: inherit !important;
        }
    `;

    // Inject styles immediately
    const style = document.createElement('style');
    style.id = 'bloomly-undistractable';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    // Ensure aria-current is set on current page (for SPA routers)
    function setActiveAttribute() {
        const link = document.querySelector('a[href="/dealers-den"]');
        if (link) {
            const isActive = location.pathname === '/dealers-den' || location.pathname.startsWith('/dealers-den/');
            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        }
    }

    // Run on load and navigation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setActiveAttribute);
    } else {
        setActiveAttribute();
    }

    // Listen for SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setActiveAttribute();
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('popstate', setActiveAttribute);
    window.addEventListener('hashchange', setActiveAttribute);
})();