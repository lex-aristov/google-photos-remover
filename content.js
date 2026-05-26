(() => {
  if (window.__gprInstalled) return;
  window.__gprInstalled = true;

  const state = {
    running: false,
    deleted: 0,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(...args) {
    console.log("[GPR]", ...args);
  }

  function sendToPopup(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (_) {}
  }

  function reportProgress() {
    sendToPopup({ type: "progress", deleted: state.deleted });
  }

  // Each tile contains a <div role="checkbox" class="QcpS9c"> for selection.
  function findCheckbox(tile) {
    if (!tile) return null;
    // The checkbox is a direct child or sibling inside the same container.
    // First check inside the tile itself.
    let cb = tile.querySelector('div[role="checkbox"]');
    if (cb) return cb;

    // Check parent and its children (checkbox may be a sibling of the <a>).
    let node = tile;
    for (let i = 0; i < 5 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      cb = node.querySelector('div[role="checkbox"].QcpS9c');
      if (cb) return cb;
    }
    return null;
  }

  // After selecting, a toolbar appears with a delete/trash button.
  function findDeleteButton() {
    // Try aria-label based selectors.
    const selectors = [
      'button[aria-label="Delete"]',
      'button[aria-label="Move to trash"]',
      '[role="button"][aria-label="Delete"]',
      '[role="button"][aria-label="Move to trash"]',
      'button[data-tooltip="Delete"]',
      'button[data-tooltip="Move to trash"]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.offsetParent !== null && !el.disabled) {
          log("Found delete button:", sel);
          return el;
        }
      }
    }

    // Fallback: scan all visible buttons/icons for delete-like text.
    const allBtns = document.querySelectorAll('button, [role="button"]');
    for (const btn of allBtns) {
      const label = (
        btn.getAttribute("aria-label") ||
        btn.getAttribute("data-tooltip") ||
        btn.innerText ||
        ""
      ).toLowerCase();
      if (
        (label.includes("delete") || label.includes("trash")) &&
        !label.includes("empty") &&
        btn.offsetParent !== null &&
        !btn.disabled
      ) {
        log("Found delete button (fallback):", label);
        return btn;
      }
    }
    return null;
  }

  // Confirm "Move to trash" dialog.
  function findConfirmButton() {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"]'
    );
    for (const dialog of dialogs) {
      if (dialog.offsetParent === null) continue;
      const buttons = dialog.querySelectorAll("button");
      for (const btn of buttons) {
        const label = (btn.innerText || btn.textContent || "").trim().toLowerCase();
        if (
          label.includes("move to trash") ||
          label.includes("move to bin") ||
          label === "delete" ||
          label === "got it"
        ) {
          if (btn.offsetParent !== null && !btn.disabled) {
            log("Found confirm button:", label);
            return btn;
          }
        }
      }
    }

    // Broader: any visible button with confirming text.
    const allBtns = document.querySelectorAll("button");
    for (const btn of allBtns) {
      const label = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (
        (label === "move to trash" || label === "move to bin") &&
        btn.offsetParent !== null &&
        !btn.disabled
      ) {
        log("Found confirm button (broad):", label);
        return btn;
      }
    }
    return null;
  }

  async function waitFor(fn, { timeout = 8000, interval = 200 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!state.running) return null;
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  const BATCH_SIZE = 500;

  // Find all visible photo/video tiles in the grid.
  function findAllTiles() {
    const tiles = document.querySelectorAll(
      'a[href*="/photo/"][aria-label^="Photo"], a[href*="/photo/"][aria-label^="Video"]'
    );
    const visible = [];
    for (const tile of tiles) {
      if (tile.offsetParent !== null) visible.push(tile);
    }
    return visible;
  }

  // Select a batch of tiles by clicking their checkboxes.
  async function selectBatch() {
    const tiles = findAllTiles();
    const count = Math.min(tiles.length, BATCH_SIZE);
    if (count === 0) {
      log("No tiles found on page.");
      return 0;
    }

    log(`Selecting ${count} of ${tiles.length} visible tiles.`);
    let selected = 0;

    for (let i = 0; i < count && state.running; i++) {
      const tile = tiles[i];
      const checkbox = findCheckbox(tile);
      if (!checkbox) {
        log("No checkbox for tile", i, tile.getAttribute("aria-label"));
        continue;
      }
      checkbox.click();
      selected++;
      // Small delay between clicks to let the UI keep up.
      if (selected % 10 === 0) await sleep(200);
    }

    log(`Selected ${selected} items.`);
    await sleep(600);
    return selected;
  }

  async function deleteBatch() {
    // 1. Select up to BATCH_SIZE photos.
    const count = await selectBatch();
    if (count === 0) return 0;

    // 2. Wait for the delete button to appear in the toolbar.
    const deleteBtn = await waitFor(findDeleteButton, { timeout: 5000 });
    if (!deleteBtn) {
      log("Delete button not found in toolbar.");
      return 0;
    }
    deleteBtn.click();
    await sleep(600);

    // 3. Confirm the "Move to trash" dialog.
    const confirmBtn = await waitFor(findConfirmButton, { timeout: 5000 });
    if (confirmBtn) {
      confirmBtn.click();
    } else {
      log("No confirm dialog (may not be needed).");
    }

    // 4. Wait for the grid to update (tiles removed).
    await sleep(2000);
    await waitFor(
      () => {
        const remaining = findAllTiles().length;
        return remaining === 0 || remaining < count;
      },
      { timeout: 15000 }
    );

    await sleep(1000);
    return count;
  }

  async function runLoop() {
    log("Starting batch delete loop (batch size:", BATCH_SIZE, ").");
    try {
      while (state.running) {
        const count = await deleteBatch();
        if (count === 0) {
          // Retry once after scrolling / waiting.
          log("No items deleted, retrying once...");
          await sleep(2000);
          const retryCount = await deleteBatch();
          if (retryCount === 0) {
            log("Still no items. Stopping.");
            break;
          }
          state.deleted += retryCount;
        } else {
          state.deleted += count;
        }
        reportProgress();
        log("Total deleted so far:", state.deleted);
      }
    } catch (err) {
      log("Error:", err);
      sendToPopup({ type: "error", message: String(err?.message || err) });
    } finally {
      const wasRunning = state.running;
      state.running = false;
      if (wasRunning) {
        sendToPopup({ type: "done", deleted: state.deleted });
      }
      log("Loop ended. Total deleted:", state.deleted);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.action) return;

    if (msg.action === "start") {
      if (!state.running) {
        state.running = true;
        state.deleted = 0;
        runLoop();
      }
      sendResponse({ ok: true });
    } else if (msg.action === "stop") {
      state.running = false;
      sendResponse({ ok: true });
    } else if (msg.action === "status") {
      sendResponse({ running: state.running, deleted: state.deleted });
    }
    return true;
  });
})();
