/**
 * Desktop Window Manager
 * Handles: drag folders, open/close/minimize/maximize windows,
 * drag windows, resize windows, z-index stacking, taskbar items.
 */

(function () {
  let highestZ = 100;
  const openWindows: Map<string, { minimized: boolean }> = new Map();
  const windowPositions: Map<string, { x: number; y: number; w: string; h: string }> = new Map();

  // ── Helpers ──────────────────────────────────────────────
  function isMobile() {
    return window.innerWidth <= 640;
  }

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function getDesktopBounds() {
    return {
      width: window.innerWidth,
      height: window.innerHeight - 48, // taskbar height
    };
  }

  // ── Focus / Z-index ─────────────────────────────────────
  function bringToFront(windowEl: HTMLElement) {
    highestZ++;
    windowEl.style.zIndex = String(highestZ);
    document.querySelectorAll('.desktop-window').forEach(w => w.classList.remove('active'));
    windowEl.classList.add('active');
    updateTaskbarActiveState(windowEl.dataset.windowId || '');
  }

  // ── Open window ─────────────────────────────────────────
  function openWindow(windowId: string) {
    const windowEl = document.querySelector(`.desktop-window[data-window-id="${windowId}"]`) as HTMLElement;
    if (!windowEl) return;

    const state = openWindows.get(windowId);

    if (state && state.minimized) {
      // Restore from minimized
      windowEl.style.display = 'flex';
      state.minimized = false;
      bringToFront(windowEl);
      updateTaskbar();
      return;
    }

    if (windowEl.style.display === 'flex') {
      // Already open, just focus
      bringToFront(windowEl);
      return;
    }

    // Position window
    if (!isMobile()) {
      const saved = windowPositions.get(windowId);
      if (saved) {
        windowEl.style.left = saved.x + 'px';
        windowEl.style.top = saved.y + 'px';
      } else {
        const bounds = getDesktopBounds();
        const wWidth = windowEl.offsetWidth || 600;
        const wHeight = windowEl.offsetHeight || 450;
        const x = Math.max(40, (bounds.width - wWidth) / 2 + (openWindows.size * 30));
        const y = Math.max(20, (bounds.height - wHeight) / 2 + (openWindows.size * 30));
        windowEl.style.left = x + 'px';
        windowEl.style.top = y + 'px';
      }
    }

    windowEl.style.display = 'flex';
    openWindows.set(windowId, { minimized: false });
    bringToFront(windowEl);
    updateTaskbar();
  }

  // ── Close window ────────────────────────────────────────
  function closeWindow(windowId: string) {
    const windowEl = document.querySelector(`.desktop-window[data-window-id="${windowId}"]`) as HTMLElement;
    if (!windowEl) return;

    windowEl.style.display = 'none';
    windowEl.classList.remove('maximized');
    openWindows.delete(windowId);
    updateTaskbar();
  }

  // ── Minimize window ─────────────────────────────────────
  function minimizeWindow(windowId: string) {
    const windowEl = document.querySelector(`.desktop-window[data-window-id="${windowId}"]`) as HTMLElement;
    if (!windowEl) return;

    windowEl.style.display = 'none';
    const state = openWindows.get(windowId);
    if (state) state.minimized = true;
    else openWindows.set(windowId, { minimized: true });
    updateTaskbar();
  }

  // ── Maximize / restore window ───────────────────────────
  function toggleMaximize(windowId: string) {
    const windowEl = document.querySelector(`.desktop-window[data-window-id="${windowId}"]`) as HTMLElement;
    if (!windowEl) return;

    if (windowEl.classList.contains('maximized')) {
      windowEl.classList.remove('maximized');
      const saved = windowPositions.get(windowId);
      if (saved) {
        windowEl.style.left = saved.x + 'px';
        windowEl.style.top = saved.y + 'px';
        windowEl.style.width = saved.w;
        windowEl.style.height = saved.h;
      }
    } else {
      // Save position before maximize
      windowPositions.set(windowId, {
        x: windowEl.offsetLeft,
        y: windowEl.offsetTop,
        w: windowEl.style.width || windowEl.offsetWidth + 'px',
        h: windowEl.style.height || windowEl.offsetHeight + 'px',
      });
      windowEl.classList.add('maximized');
    }
  }

  // ── Taskbar ─────────────────────────────────────────────
  function updateTaskbar() {
    const container = document.getElementById('taskbar-items');
    if (!container) return;
    container.innerHTML = '';

    openWindows.forEach((state, windowId) => {
      const windowEl = document.querySelector(`.desktop-window[data-window-id="${windowId}"]`) as HTMLElement;
      if (!windowEl) return;

      const title = windowEl.querySelector('.window-title')?.textContent || windowId;
      const folderEl = document.querySelector(`.desktop-folder[data-folder-id="${windowId}"]`);
      const icon = folderEl?.querySelector('.folder-icon')?.textContent || '📄';

      const btn = document.createElement('button');
      btn.className = 'taskbar-item' + (state.minimized ? '' : ' active');
      btn.innerHTML = `<span>${icon}</span><span>${title}</span>`;
      btn.addEventListener('click', () => {
        if (state.minimized) {
          openWindow(windowId);
        } else {
          // If active, minimize. If not active, bring to front.
          const isActive = windowEl.classList.contains('active');
          if (isActive) {
            minimizeWindow(windowId);
          } else {
            bringToFront(windowEl);
          }
        }
      });
      container.appendChild(btn);
    });
  }

  function updateTaskbarActiveState(activeId: string) {
    document.querySelectorAll('.taskbar-item').forEach(item => {
      item.classList.remove('active');
    });
    const items = document.querySelectorAll('.taskbar-item');
    items.forEach(item => {
      if (item.textContent?.includes(activeId)) {
        item.classList.add('active');
      }
    });
    // Simpler: rebuild
    updateTaskbar();
  }

  // ── Drag folders ────────────────────────────────────────
  function initFolderDrag() {
    const folders = document.querySelectorAll('.desktop-folder');

    folders.forEach(folder => {
      const el = folder as HTMLElement;
      let isDragging = false;
      let hasMoved = false;
      let startX = 0, startY = 0;
      let origX = 0, origY = 0;
      let clickTimeout: number | null = null;

      function onPointerDown(e: PointerEvent) {
        if (isMobile()) return; // No drag on mobile
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        origX = el.offsetLeft;
        origY = el.offsetTop;
        el.setPointerCapture(e.pointerId);
        el.style.zIndex = '50';
      }

      function onPointerMove(e: PointerEvent) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }
        const bounds = getDesktopBounds();
        el.style.left = clamp(origX + dx, 0, bounds.width - 80) + 'px';
        el.style.top = clamp(origY + dy, 0, bounds.height - 80) + 'px';
      }

      function onPointerUp(e: PointerEvent) {
        isDragging = false;
        el.releasePointerCapture(e.pointerId);
      }

      el.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);

      // Double click to open
      el.addEventListener('dblclick', (e) => {
        const folderId = el.dataset.folderId;
        if (folderId) openWindow(folderId);
      });

      // Mobile: single tap to open
      el.addEventListener('click', () => {
        if (isMobile() || !hasMoved) {
          // On mobile, single tap opens. On desktop clicks after drag are ignored.
          if (isMobile()) {
            const folderId = el.dataset.folderId;
            if (folderId) openWindow(folderId);
          }
        }
      });

      // Selection
      el.addEventListener('pointerdown', () => {
        document.querySelectorAll('.desktop-folder').forEach(f => f.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  }

  // ── Drag windows (titlebar) ─────────────────────────────
  function initWindowDrag() {
    const windows = document.querySelectorAll('.desktop-window');

    windows.forEach(win => {
      const windowEl = win as HTMLElement;
      const titlebar = windowEl.querySelector('.window-titlebar') as HTMLElement;
      if (!titlebar) return;

      let isDragging = false;
      let startX = 0, startY = 0;
      let origX = 0, origY = 0;

      titlebar.addEventListener('pointerdown', (e: PointerEvent) => {
        if (isMobile()) return;
        if ((e.target as HTMLElement).closest('.window-btn')) return;
        if (windowEl.classList.contains('maximized')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = windowEl.offsetLeft;
        origY = windowEl.offsetTop;
        titlebar.setPointerCapture(e.pointerId);
        bringToFront(windowEl);
      });

      document.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const bounds = getDesktopBounds();
        windowEl.style.left = clamp(origX + dx, -windowEl.offsetWidth + 100, bounds.width - 50) + 'px';
        windowEl.style.top = clamp(origY + dy, 0, bounds.height - 40) + 'px';
      });

      document.addEventListener('pointerup', () => {
        if (isDragging) {
          isDragging = false;
          // Save position
          const windowId = windowEl.dataset.windowId;
          if (windowId) {
            windowPositions.set(windowId, {
              x: windowEl.offsetLeft,
              y: windowEl.offsetTop,
              w: windowEl.style.width,
              h: windowEl.style.height,
            });
          }
        }
      });

      // Click anywhere on window to focus
      windowEl.addEventListener('pointerdown', () => bringToFront(windowEl));
    });
  }

  // ── Window controls ─────────────────────────────────────
  function initWindowControls() {
    document.querySelectorAll('.desktop-window').forEach(win => {
      const windowEl = win as HTMLElement;
      const windowId = windowEl.dataset.windowId || '';

      windowEl.querySelectorAll('.window-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = (btn as HTMLElement).dataset.action;
          switch (action) {
            case 'close': closeWindow(windowId); break;
            case 'minimize': minimizeWindow(windowId); break;
            case 'maximize': toggleMaximize(windowId); break;
          }
        });
      });
    });
  }

  // ── Resize windows ─────────────────────────────────────
  function initWindowResize() {
    document.querySelectorAll('.desktop-window').forEach(win => {
      const windowEl = win as HTMLElement;
      const handle = windowEl.querySelector('.window-resize-handle') as HTMLElement;
      if (!handle) return;

      let isResizing = false;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;

      handle.addEventListener('pointerdown', (e: PointerEvent) => {
        if (isMobile()) return;
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = windowEl.offsetWidth;
        startH = windowEl.offsetHeight;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation();
      });

      document.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isResizing) return;
        const w = Math.max(320, startW + (e.clientX - startX));
        const h = Math.max(200, startH + (e.clientY - startY));
        windowEl.style.width = w + 'px';
        windowEl.style.height = h + 'px';
      });

      document.addEventListener('pointerup', () => {
        isResizing = false;
      });
    });
  }

  // ── Desktop click deselect ──────────────────────────────
  function initDesktopClick() {
    const desktop = document.getElementById('desktop-area');
    if (!desktop) return;

    desktop.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).id === 'desktop-area') {
        document.querySelectorAll('.desktop-folder').forEach(f => f.classList.remove('selected'));
      }
    });
  }

  // ── Mobile folder grid ──────────────────────────────────
  function arrangeFoldersForMobile() {
    if (!isMobile()) return;
    const folders = document.querySelectorAll('.desktop-folder') as NodeListOf<HTMLElement>;
    const cols = 4;
    const cellW = window.innerWidth / cols;
    const cellH = 100;
    const startY = 20;

    folders.forEach((folder, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      folder.style.left = (col * cellW + (cellW - 80) / 2) + 'px';
      folder.style.top = (startY + row * cellH) + 'px';
    });
  }

  // ── Open default windows ────────────────────────────────
  function openDefaults() {
    document.querySelectorAll('.desktop-folder[data-open-default="true"]').forEach(folder => {
      const folderId = (folder as HTMLElement).dataset.folderId;
      if (folderId) {
        setTimeout(() => openWindow(folderId), 300);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────
  function init() {
    arrangeFoldersForMobile();
    initFolderDrag();
    initWindowDrag();
    initWindowControls();
    initWindowResize();
    initDesktopClick();
    openDefaults();

    window.addEventListener('resize', () => {
      arrangeFoldersForMobile();
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
