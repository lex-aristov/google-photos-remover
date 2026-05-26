# Google Photos Remover

A Chrome extension that bulk-deletes photos from your Google Photos library.

I created this because I didn't trust the existing extensions on the Chrome Web
Store — they ask for broad permissions and you can't see what they do with your
data. This one is ~200 lines of JavaScript, fully open-source, with zero
dependencies. Read every line before you install it.

**GitHub:** https://github.com/AlexxIT/google-photos-remover

> **Warning:** This permanently removes items (they go to Trash, which empties
> after 60 days). Use at your own risk. Test on a throwaway/secondary account
> first.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. (Optional) Add PNG icons in `icons/` — see [icons/README.md](icons/README.md).

## Usage

1. Open https://photos.google.com and wait for the grid to load.
2. Click the extension icon in the toolbar.
3. Click **Start**. The popup shows a running count.
4. Click **Stop** at any time to halt.

The extension only runs on `https://photos.google.com/*`.

## How it works

- A content script (`content.js`) is injected into Google Photos pages.
- On **Start**, it repeatedly deletes in batches of **500**:
  1. Selects up to 500 visible photo/video tiles by clicking their checkboxes.
  2. Clicks the toolbar **Delete** button.
  3. Confirms the **Move to trash** dialog.
  4. Waits for the grid to update, then repeats with the next batch.

## Caveats

- Google Photos' DOM changes from time to time. If deletion stops working, the
  CSS selectors in `content.js` (`SELECTORS`) may need updating.
- The script is best-effort — network hiccups or unexpected dialogs may stop it.
- Items removed go to **Trash**; empty it manually if you want them gone now.
