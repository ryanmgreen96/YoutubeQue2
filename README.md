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
