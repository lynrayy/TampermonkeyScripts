// ==UserScript==
// @name         Дублирование приёма с заменой на :30
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Кнопка 🎬 дублирует приём на следующую неделю и сразу выставляет интервал :30
// @author       ChatGPT, Lynrayy
// @match        *://app.medesk.net/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function waitForElement(selector, root = document, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let elapsed = 0;
      const check = () => {
        const el = root.querySelector(selector);
        if (el) return resolve(el);
        elapsed += interval;
        if (elapsed >= timeout) return reject(new Error('Timeout: ' + selector));
        setTimeout(check, interval);
      };
      check();
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function simulateClick(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function ask(msg) {
    if (!confirm(msg)) throw new Error('Остановлено пользователем: ' + msg);
  }

  async function forceSetDurationTo30(modal) {
    const placeholders = modal.querySelectorAll('.duration-placeholder');
    for (const placeholder of placeholders) {
      const valueEl = placeholder.querySelector('.js-duration-value');
      if (valueEl && valueEl.textContent.trim() === ': авто') {
        const toggle = placeholder.querySelector('.dropdown-toggle');
        simulateClick(toggle);
        await delay(300);

        const option30 = placeholder.querySelector('a.js-duration-action[duration="30"]');
        if (option30) {
          simulateClick(option30);
          console.log('[AutoDuration] Установлено :30');
        } else {
          console.warn('[AutoDuration] Не найдена опция :30');
        }
      }
    }
  }

  function injectButtons() {
    document.querySelectorAll('.event-appointment').forEach(card => {
      if (card.querySelector('.dupe-button')) return;

      const btn = document.createElement('button');
      btn.textContent = '🎬';
      btn.className = 'dupe-button';
      Object.assign(btn.style, {
        position: 'absolute',
        top: '2px',
        right: '2px',
        zIndex: 1000,
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '4px',
        cursor: 'pointer',
        padding: '2px 4px'
      });

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        try {
          ask('Начать дублирование этой записи?');

          const originalCard = e.target.closest('.event-appointment');
          const slotRow = originalCard?.closest('tr.slot');
          if (!slotRow) return alert('Не найдена строка с таймслотом');

          const hour = slotRow.getAttribute('hour');
          const minute = slotRow.getAttribute('minute');
          if (!hour || !minute) return alert('Не удалось определить часы и минуты');
          const targetTime = `${hour}:${minute.padStart(2, '0')}`;

          simulateClick(originalCard);
          await delay(800);

          const cloneBtn = await waitForElement('.js-clone');
          simulateClick(cloneBtn);
          await delay(1000);

          const modal = document.querySelector('.modal.in');
          if (!modal) return alert('Не найдено всплывающее окно');

          const datepicker = modal.querySelector('.datepicker-days');
          if (!datepicker) return alert('Не найден мини-календарь в модальном окне');

          const activeCell = datepicker.querySelector('td.active.day');
          if (!activeCell) return alert('Не найдена активная дата');

          const cellIndex = Array.from(activeCell.parentElement.children).indexOf(activeCell);
          let nextDate = null;

          if (activeCell.parentElement?.nextElementSibling) {
            nextDate = activeCell.parentElement.nextElementSibling.children[cellIndex];
          } else {
            const tbodyList = datepicker.querySelectorAll('tbody');
            if (tbodyList.length > 1) {
              const firstRow = tbodyList[1].querySelector('tr');
              nextDate = firstRow?.children[cellIndex];
            }
          }

          if (!nextDate) return alert('Не найдена дата через неделю');
          simulateClick(nextDate);

          await delay(500); // немного подождём для надёжности
          await forceSetDurationTo30(modal);
          await delay(500);

          const targetRow = modal.querySelector(`tr.slot[hour="${parseInt(hour)}"][minute="${parseInt(minute)}"]`);
          if (!targetRow) return alert(`❌ Не удалось найти строку времени: ${targetTime}`);

          const targetCell = targetRow.querySelector('td.day-column[dayindex="1"]');
          if (!targetCell) return alert(`❌ Не найдена ячейка dayindex=1 для времени ${targetTime}`);

          simulateClick(targetCell);
          await delay(800);

          const copyBtn = modal.querySelector('.modal-footer .js-warn');
          if (!copyBtn) return alert('❌ Не найдена кнопка "Дублировать приём"');
          simulateClick(copyBtn);

        } catch (err) {
          alert('🚫 Ошибка: ' + err.message);
        }
      });

      card.style.position = 'relative';
      card.appendChild(btn);
    });
  }

  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(injectButtons, 1500);
})();
