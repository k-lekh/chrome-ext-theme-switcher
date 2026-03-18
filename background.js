"use strict";

/**
 * @typedef {"dark" | "light"} ThemeMode
 */

const DEBUGGER_VERSION = "1.3";
const STORAGE_KEY = "themeModesByTabId";
const MODE_SEQUENCE = ["dark", "light"];
const BADGE_TEXT_BY_MODE = {
  dark: "D",
  light: "L"
};
const BADGE_COLOR_BY_MODE = {
  dark: "#111827",
  light: "#6b7280"
};

const attachedTabs = new Set();
const intentionalDetachTabs = new Set();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isSupportedUrl(tab.url)) {
    console.debug("Theme Switch: unsupported tab", tab?.url);
    return;
  }

  const currentMode = await getStoredMode(tab.id);
  const nextMode = getNextMode(currentMode);

  try {
    await applyModeToTab(tab.id, nextMode);
    await setStoredMode(tab.id, nextMode);
    await updateBadge(tab.id, nextMode);
  } catch (error) {
    console.debug("Theme Switch: failed to switch mode", error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  const mode = await getStoredMode(tabId);

  if (!mode) {
    return;
  }

  if (!isSupportedUrl(tab.url)) {
    await clearTabState(tabId);
    return;
  }

  try {
    await applyModeToTab(tabId, mode);
    await updateBadge(tabId, mode);
  } catch (error) {
    console.debug("Theme Switch: failed to reapply mode", error);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearTabState(tabId);
});

chrome.debugger.onDetach.addListener(async (source) => {
  const tabId = source.tabId;

  if (!tabId) {
    return;
  }

  attachedTabs.delete(tabId);

  if (intentionalDetachTabs.has(tabId)) {
    intentionalDetachTabs.delete(tabId);
    return;
  }

  await clearStoredMode(tabId);
  await clearBadge(tabId);
});

/**
 * @param {number} tabId
 * @param {ThemeMode} mode
 */
async function applyModeToTab(tabId, mode) {
  await ensureDebuggerAttached(tabId);
  try {
    await sendCommand(tabId, "Emulation.setEmulatedMedia", {
      features: [
        {
          name: "prefers-color-scheme",
          value: mode
        }
      ]
    });
  } catch (error) {
    await detachDebugger(tabId);
    throw error;
  }
}

/**
 * @param {number} tabId
 */
async function ensureDebuggerAttached(tabId) {
  if (attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    attachedTabs.add(tabId);
    return;
  } catch (attachError) {
    try {
      await sendCommand(tabId, "Runtime.enable");
      attachedTabs.add(tabId);
      return;
    } catch (sendError) {
      throw attachError;
    }
  }
}

/**
 * @param {number} tabId
 */
async function detachDebugger(tabId) {
  try {
    intentionalDetachTabs.add(tabId);
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    console.debug("Theme Switch: detach skipped", error);
  } finally {
    intentionalDetachTabs.delete(tabId);
    attachedTabs.delete(tabId);
  }
}

/**
 * @param {number} tabId
 * @param {string} method
 * @param {Record<string, unknown>=} commandParams
 */
async function sendCommand(tabId, method, commandParams) {
  return chrome.debugger.sendCommand({ tabId }, method, commandParams);
}

/**
 * @param {ThemeMode | null} currentMode
 * @returns {ThemeMode}
 */
function getNextMode(currentMode) {
  if (!currentMode || !MODE_SEQUENCE.includes(currentMode)) {
    return MODE_SEQUENCE[0];
  }

  const currentIndex = MODE_SEQUENCE.indexOf(currentMode);
  return MODE_SEQUENCE[(currentIndex + 1) % MODE_SEQUENCE.length];
}

/**
 * @param {number} tabId
 * @returns {Promise<ThemeMode | null>}
 */
async function getStoredMode(tabId) {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const modesByTabId = data[STORAGE_KEY] || {};
  return modesByTabId[String(tabId)] || null;
}

/**
 * @param {number} tabId
 * @param {ThemeMode} mode
 */
async function setStoredMode(tabId, mode) {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const modesByTabId = data[STORAGE_KEY] || {};
  modesByTabId[String(tabId)] = mode;
  await chrome.storage.session.set({ [STORAGE_KEY]: modesByTabId });
}

/**
 * @param {number} tabId
 */
async function clearStoredMode(tabId) {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const modesByTabId = data[STORAGE_KEY] || {};

  if (!(String(tabId) in modesByTabId)) {
    return;
  }

  delete modesByTabId[String(tabId)];
  await chrome.storage.session.set({ [STORAGE_KEY]: modesByTabId });
}

/**
 * @param {number} tabId
 * @param {ThemeMode} mode
 */
async function updateBadge(tabId, mode) {
  await chrome.action.setBadgeText({
    tabId,
    text: BADGE_TEXT_BY_MODE[mode]
  });

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: BADGE_COLOR_BY_MODE[mode]
  });
}

/**
 * @param {number} tabId
 */
async function clearBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: "" });
}

/**
 * @param {number} tabId
 */
async function clearTabState(tabId) {
  await clearStoredMode(tabId);
  await clearBadge(tabId);
  await detachDebugger(tabId);
}

/**
 * @param {string | undefined} url
 */
function isSupportedUrl(url) {
  return typeof url === "string" && /^(https?:)\/\//.test(url);
}
