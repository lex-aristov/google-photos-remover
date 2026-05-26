const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

const PHOTOS_URL = "https://photos.google.com/";

function setStatus(text) {
  statusEl.textContent = text;
}

function setRunning(running) {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isPhotosTab(tab) {
  return tab && tab.url && tab.url.startsWith(PHOTOS_URL);
}

async function sendMessage(action) {
  const tab = await getActiveTab();
  if (!isPhotosTab(tab)) {
    setStatus("Open photos.google.com in this tab.");
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch (e) {
    setStatus("Reload the Photos tab and try again.");
    return null;
  }
}

startBtn.addEventListener("click", async () => {
  const res = await sendMessage("start");
  if (res && res.ok) {
    setRunning(true);
    setStatus("Deleting…");
  }
});

stopBtn.addEventListener("click", async () => {
  const res = await sendMessage("stop");
  if (res && res.ok) {
    setRunning(false);
    setStatus("Stopped.");
  }
});

// Listen for progress updates from content script.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "progress") {
    setStatus(`Deleted: ${msg.deleted}`);
  } else if (msg && msg.type === "done") {
    setRunning(false);
    setStatus(`Finished. Deleted: ${msg.deleted}`);
  } else if (msg && msg.type === "error") {
    setRunning(false);
    setStatus(`Error: ${msg.message}`);
  }
});

// On open, sync state with content script.
(async () => {
  const tab = await getActiveTab();
  if (!isPhotosTab(tab)) {
    setStatus("Open photos.google.com first.");
    startBtn.disabled = true;
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: "status" });
    if (res && res.running) {
      setRunning(true);
      setStatus(`Deleting… (${res.deleted})`);
    }
  } catch (e) {
    // Content script not yet injected — fine.
  }
})();
