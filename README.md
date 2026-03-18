# Theme Switch

Minimal Chrome extension that toggles the active tab between `dark` and `light` by changing the tab's `prefers-color-scheme` media query via the Chrome debugger API.

## Load locally

1. Clone this repository locally.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select the folder of this repository: `chrome-ext-theme-switcher`.

## Use

- Click the extension icon in the toolbar to toggle `dark <-> light`.
- The badge shows the current mode for the active tab: `D`, `L`.
- State is stored per tab for the current browser session only.

## Notes

- The extension requests the `debugger` permission. Chrome will show a warning because the extension uses the DevTools protocol.
- Only `http://` and `https://` pages are supported.
- `test-page.html` can be served locally to verify that a page using `@media (prefers-color-scheme: dark)` responds to the switch.
# chrome-ext-theme-switcher
