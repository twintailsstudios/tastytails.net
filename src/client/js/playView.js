/**
 * @fileoverview playView.js - Main Gameplay View UI Controller
 *
 * @description
 * Client-side script module executing UI layout management, split-pane resizers,
 * focus tracking between Phaser canvas and roleplay chat, socket emission debouncing
 * for Anatomy Forge settings, and modal window event bindings.
 */

(function () {
  'use strict';

  // --- Focus Handling ---
  window.chatFocused = true;

  document.addEventListener('DOMContentLoaded', () => {
    const phaserApp = document.getElementById('phaserApp');
    const chatInput = document.getElementById('textarea');

    if (phaserApp) {
      phaserApp.setAttribute('tabindex', '0');
      phaserApp.addEventListener('click', () => {
        window.chatFocused = false;
        if (chatInput) chatInput.blur();
        phaserApp.focus();
      });
      phaserApp.addEventListener('focus', () => {
        window.chatFocused = false;
        if (chatInput) chatInput.blur();
      });
    }

    if (chatInput) {
      chatInput.addEventListener('focus', () => {
        window.chatFocused = true;
      });
      chatInput.addEventListener('click', () => {
        window.chatFocused = true;
      });
    }
  });

  // --- Navigation Toggle ---
  window.toggleNav = function () {
    document.body.classList.toggle('nav-visible');
    const chevron = document.querySelector('#navToggle .chevron-icon');
    if (chevron) {
      if (document.body.classList.contains('nav-visible')) {
        chevron.style.transform = 'rotate(180deg)';
      } else {
        chevron.style.transform = 'rotate(0deg)';
      }
    }
  };

  // --- Anatomy Forge Socket Emission & Debouncing ---
  let anatomySaveTimer = null;
  let pendingAnatomyData = null;

  window.flushAnatomyChanges = function () {
    if (anatomySaveTimer && pendingAnatomyData && window.gameSocket) {
      clearTimeout(anatomySaveTimer);
      window.gameSocket.emit('updateVoreSettings', { anatomyData: pendingAnatomyData });
      anatomySaveTimer = null;
      pendingAnatomyData = null;
    }
  };

  window.saveAnatomyChanges = function (showToastMsg = true, immediate = false) {
    if (typeof AnatomyForge === 'undefined') return;
    const targetSocket = window.gameSocket;

    if (targetSocket) {
      pendingAnatomyData = document.getElementById('anatomyData')
        ? document.getElementById('anatomyData').value
        : AnatomyForge.serialize();

      if (immediate) {
        window.flushAnatomyChanges();
        if (showToastMsg) {
          if (typeof showToast === 'function') showToast('Anatomy Saved!', 'success');
          else console.log('Anatomy Saved');
        }
        return;
      }

      clearTimeout(anatomySaveTimer);
      anatomySaveTimer = setTimeout(() => {
        if (pendingAnatomyData) {
          targetSocket.emit('updateVoreSettings', { anatomyData: pendingAnatomyData });
          pendingAnatomyData = null;
          anatomySaveTimer = null;
          if (showToastMsg) {
            if (typeof showToast === 'function') showToast('Anatomy Saved!', 'success');
            else console.log('Anatomy Saved');
          }
        }
      }, 300);
    } else {
      console.warn('saveAnatomyChanges: No socket connection available.');
    }
  };

  window.addEventListener('beforeunload', () => {
    window.flushAnatomyChanges();
  });

  // --- Anatomy Forge Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    const playerInfo = window.localPlayerInfo || (window.tastytailsData ? window.tastytailsData.charList : null);

    if (typeof AnatomyForge !== 'undefined' && playerInfo) {
      if (!document.getElementById('anatomyData')) {
        const inp = document.createElement('input');
        inp.type = 'hidden';
        inp.id = 'anatomyData';
        inp.name = 'anatomyData';
        document.body.appendChild(inp);
      }

      const initialData = playerInfo.anatomyData || null;
      AnatomyForge.init('anatomy-forge-container', initialData, playerInfo.voreTypes, window.saveAnatomyChanges);

      if (typeof window.createVoreList === 'function' && playerInfo.voreTypes) {
        window.createVoreList(playerInfo.voreTypes);
      }

      const voreTabBtn = document.getElementById('voreTab');
      if (voreTabBtn) {
        voreTabBtn.addEventListener('click', () => {
          const latestInfo = window.localPlayerInfo || (window.tastytailsData ? window.tastytailsData.charList : null);
          if (typeof window.createVoreList === 'function' && latestInfo && latestInfo.voreTypes) {
            window.createVoreList(latestInfo.voreTypes);
          }
          setTimeout(() => {
            if (typeof AnatomyForge !== 'undefined' && AnatomyForge.resetView) AnatomyForge.resetView();
          }, 100);
        });
      }
    }
  });

  // --- Split-Pane Resizers ---
  document.addEventListener('DOMContentLoaded', () => {
    // --- Phase 1: Horizontal Resizing ---
    const resizer = document.getElementById('resize-handler');
    const leftSide = document.getElementById('phaserApp');
    const container = document.getElementById('game-wrapper');

    if (resizer && leftSide && container) {
      let x = 0;
      let leftWidth = 0;
      let containerWidth = 0;
      let rAFPending = false;

      const mouseDownHandler = function (e) {
        x = e.clientX;
        leftWidth = leftSide.getBoundingClientRect().width;
        containerWidth = container.getBoundingClientRect().width;
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        document.body.classList.add('resizing');
      };

      const mouseMoveHandler = function (e) {
        if (rAFPending) return;
        rAFPending = true;

        requestAnimationFrame(() => {
          const dx = e.clientX - x;
          const newLeftWidth = ((leftWidth + dx) * 100) / (containerWidth || 1);
          if (newLeftWidth >= 20 && newLeftWidth <= 80) {
            leftSide.style.flex = `0 0 ${newLeftWidth}%`;
            window.dispatchEvent(new Event('resize'));
          }
          rAFPending = false;
        });
      };

      const mouseUpHandler = function (e) {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        document.body.classList.remove('resizing');

        // Hardened final snap calculation
        if (e && containerWidth) {
          const dx = e.clientX - x;
          const finalWidthPct = Math.min(Math.max(((leftWidth + dx) * 100) / containerWidth, 20), 80);
          leftSide.style.flex = `0 0 ${finalWidthPct}%`;
        }
        window.dispatchEvent(new Event('resize'));
      };

      resizer.addEventListener('mousedown', mouseDownHandler);
    }

    // --- Phase 2: Vertical Resizing ---
    const vResizer = document.getElementById('vertical-resize-handler');
    const topPanel = document.getElementById('menu');
    const sidePanel = document.getElementById('sidePanel');

    if (vResizer && topPanel && sidePanel) {
      let y = 0;
      let topHeight = 0;
      let sidePanelHeight = 0;
      let vrAFPending = false;

      const vMouseDownHandler = function (e) {
        y = e.clientY;
        topHeight = topPanel.getBoundingClientRect().height;
        sidePanelHeight = sidePanel.getBoundingClientRect().height;

        document.addEventListener('mousemove', vMouseMoveHandler);
        document.addEventListener('mouseup', vMouseUpHandler);
        document.body.classList.add('resizing-v');
      };

      const vMouseMoveHandler = function (e) {
        if (vrAFPending) return;
        vrAFPending = true;

        requestAnimationFrame(() => {
          const dy = e.clientY - y;
          const newTopHeightPct = ((topHeight + dy) * 100) / (sidePanelHeight || 1);
          if (newTopHeightPct >= 10 && newTopHeightPct <= 90) {
            topPanel.style.flex = `0 0 ${newTopHeightPct}%`;
            window.dispatchEvent(new Event('resize'));
          }
          vrAFPending = false;
        });
      };

      const vMouseUpHandler = function (e) {
        document.removeEventListener('mousemove', vMouseMoveHandler);
        document.removeEventListener('mouseup', vMouseUpHandler);
        document.body.classList.remove('resizing-v');

        if (e && sidePanelHeight) {
          const dy = e.clientY - y;
          const finalHeightPct = Math.min(Math.max(((topHeight + dy) * 100) / sidePanelHeight, 10), 90);
          topPanel.style.flex = `0 0 ${finalHeightPct}%`;
        }
        window.dispatchEvent(new Event('resize'));
      };

      vResizer.addEventListener('mousedown', vMouseDownHandler);
    }
  });
})();
