"use strict";

/**
 * @typedef {"dark" | "light"} ThemeMode
 */

const DEBUGGER_VERSION = "1.3";
const STORAGE_KEY = "themeModesByTabId";
const MODE_SEQUENCE = ["dark", "light"];
const ICON_SIZES = [16, 32];
const ICON_STYLE_BY_MODE = {
  dark: {
    kind: "solid",
    fill: "#111111",
    stroke: "#f9fafb"
  },
  light: {
    kind: "solid",
    fill: "#ffffff",
    stroke: "#111111"
  },
  neutral: {
    kind: "quartered",
    dark: "#111111",
    light: "#ffffff",
    stroke: "#111111"
  }
};

const attachedTabs = new Set();
const intentionalDetachTabs = new Set();

chrome.runtime.onInstalled.addListener(async () => {
  await setIndicator();
});

chrome.runtime.onStartup.addListener(async () => {
  await setIndicator();
});

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
    await setIndicator(tab.id, nextMode);
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
    await setIndicator(tabId, mode);
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
  await clearIndicator(tabId);
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
async function setIndicator(tabId, mode) {
  const iconStyle = mode ? ICON_STYLE_BY_MODE[mode] : ICON_STYLE_BY_MODE.neutral;
  const imageData = buildIconImageData(iconStyle);

  await chrome.action.setIcon(
    tabId
      ? {
          tabId,
          imageData
        }
      : {
          imageData
        }
  );

  if (tabId) {
    await chrome.action.setBadgeText({ tabId, text: "" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

/**
 * @param {number} tabId
 */
async function clearIndicator(tabId) {
  await setIndicator(tabId);
}

/**
 * @param {number} tabId
 */
async function clearTabState(tabId) {
  await clearStoredMode(tabId);
  await clearIndicator(tabId);
  await detachDebugger(tabId);
}

/**
 * @param {{ kind: string, stroke: string, fill?: string, dark?: string, light?: string }} style
 */
function buildIconImageData(style) {
  return Object.fromEntries(
    ICON_SIZES.map((size) => [size, drawIcon(size, style)])
  );
}

/**
 * @param {number} size
 * @param {{ kind: string, stroke: string, fill?: string, dark?: string, light?: string }} style
 */
function drawIcon(size, style) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Theme Switch: failed to get icon canvas context");
  }

  context.clearRect(0, 0, size, size);

  context.lineWidth = Math.max(1.5, size * 0.09);
  const radius = size / 2 - context.lineWidth / 2 - 0.25;
  const center = size / 2;

  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();

  if (style.kind === "quartered") {
    const startAngle = 0;
    const colors = [style.dark, style.light, style.dark, style.light];

    for (let index = 0; index < colors.length; index += 1) {
      context.beginPath();
      context.moveTo(center, center);
      context.arc(
        center,
        center,
        radius,
        startAngle + index * (Math.PI / 2),
        startAngle + (index + 1) * (Math.PI / 2)
      );
      context.closePath();
      context.fillStyle = colors[index];
      context.fill();
    }
  } else {
    context.fillStyle = style.fill;
    context.fillRect(0, 0, size, size);
  }
  context.restore();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = style.stroke;
  context.stroke();

  return context.getImageData(0, 0, size, size);
}

/**
 * @param {string | undefined} url
 */
function isSupportedUrl(url) {
  return typeof url === "string" && /^(https?:)\/\//.test(url);
}
