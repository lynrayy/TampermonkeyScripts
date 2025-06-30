// ==UserScript==
// @name         Постоянная замена :авто на :30 (Medesk)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Умный цикл: ищет и меняет :авто на :30 даже при медленной загрузке или всплывающих меню 🔁🧠
// @author       ChatGPT, Lynrayy
// @match        *://app.medesk.net/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const runAttempt = () => {
        let changed = false;

        document.querySelectorAll('.duration-placeholder').forEach(placeholder => {
            const valueEl = placeholder.querySelector('.js-duration-value');
            if (valueEl && valueEl.textContent.trim() === ': авто') {
                const dropdown = placeholder.querySelector('.dropdown-menu');
                const toggle = placeholder.querySelector('.dropdown-toggle');

                // Если меню ещё не раскрыто — раскроем
                if (!dropdown || dropdown.offsetParent === null) {
                    if (toggle) {
                        toggle.click();
                        console.log('[Tampermonkey] Открываю меню для замены');
                        return; // подождём до следующего прохода
                    }
                }

                // Меняем на :30
                const option30 = dropdown?.querySelector('a.js-duration-action[duration="30"]');
                if (option30) {
                    option30.click();
                    changed = true;
                    console.log('[Tampermonkey] Успешно заменено на :30');
                }
            }
        });

        return changed;
    };

    const runLoop = () => {
        let attempts = 0;
        const maxFastAttempts = 20;

        const fastCheck = setInterval(() => {
            attempts++;
            const changed = runAttempt();

            if (changed || attempts >= maxFastAttempts) {
                clearInterval(fastCheck);
                console.log('[Tampermonkey] Переход в фоновый режим повторной проверки');

                // Фоновая проверка каждые 5 сек — до конца сессии
                setInterval(() => {
                    runAttempt();
                }, 300);
            }
        }, 200);
    };

    // Запуск после полной загрузки
    window.addEventListener('load', () => {
        setTimeout(runLoop, 1500); // ждём анимацию Medesk
    });
})();
