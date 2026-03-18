> Written by Codex

# Theme Switcher

Minimal Chrome extension that toggles the active tab between `dark` and `light` by changing the tab's `prefers-color-scheme` media query via the Chrome debugger API.

## Load locally

1. Clone this repository locally.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this folder: `chrome-theme-switch`.

## Use

- Click the extension icon in the toolbar to toggle `dark <-> light`.
- The extension icon changes with the active tab: black circle for `dark`, white circle for `light`, neutral gray circle when no mode is stored for the tab.
- State is stored per tab for the current browser session only.

## Notes

- The extension requests the `debugger` permission. Chrome will show a warning because the extension uses the DevTools protocol.
- Only `http://` and `https://` pages are supported.
- `test-page.html` can be served locally to verify that a page using `@media (prefers-color-scheme: dark)` responds to the switch.
