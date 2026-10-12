# YoutubeQue2

A simple queue app and browser extension for YouTube videos and saved links.

## Files

- `index.html`, `styles.css`, `app.js`: web app
- `manifest.json`, `background.js`, `contentScript.js`: extension files

## Quick setup

1. Push this repository to GitHub.
2. Enable GitHub Pages (Settings -> Pages, source: `main` branch, `/root`).
3. Load the extension as unpacked in your browser.

## Usage

- Click the extension button to save the current YouTube video or the current page into the saved-for-later list.
- Right-click a video and choose the queue action.
- The web app reads URL parameters and adds items to local storage.
- In the web app, hold an icon in the top bar to open its controls. Use the arrows to reorder it, choose another row to move it, or enter an icon URL/domain and select **Save icon**.
- Hold one of the feature buttons in the lower-left icon bar (Library, Gym, Journal, Carbs, Music, or Audio) to change its emoji/label or move it up and down. These settings are saved in the browser.
- The red cross icon opens the Audio page. Add MP3 files to `audio/` and push them to the `main` branch; the page discovers them from GitHub when it loads. Use **+** to add an item with a title and optional script. Click an item's title to play it; right-click to edit its title, MP3, or script. Hold right-click for two seconds to delete the item. Audio items and scripts are saved in the browser, and **Refresh MP3s** reloads the folder listing.
