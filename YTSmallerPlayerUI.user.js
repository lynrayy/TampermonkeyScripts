// ==UserScript==
// @name         YouTube Smaller Player Controls
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Уменьшает нижнюю панель управления YouTube (ytp-chrome-bottom) с помощью CSS-трансформации
// @author       Lynrayy, ChatGPT
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/s/desktop/fe2f1a22/img/favicon_144x144.png
// @grant        none
// @updateURL    https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/main/YTSmallerPlayerUI.user.js
// @downloadURL  https://github.com/lynrayy/TampermonkeyScripts/raw/refs/heads/main/YTSmallerPlayerUI.user.js
// ==/UserScript==

(function() {
    'use strict';
    const style = document.createElement("style");
    style.innerHTML = `
        .ytp-chrome-bottom {
            transform: scale(0.7) !important;  /* уменьшаем размер панели */
            transform-origin: bottom left !important; /* фиксируем позицию снизу */
        }
    `;
    document.head.appendChild(style);
})();
