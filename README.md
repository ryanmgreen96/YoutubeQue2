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
- Select the movie icon in the lower-left icon bar to switch between the normal links and the create workspace. In create mode, use **+** to add a page and the **+** beside the tabs to choose a blank or film tab. Hold a tab to change its type. Film tabs accept a public HTTP(S) MP4 URL, play the film, and save timestamp bookmarks with a frame thumbnail when browser cross-origin access allows it; otherwise the timestamp is saved. Changing the MP4 URL clears that tab's bookmarks. Created pages, tabs, and bookmarks are saved in browser storage and display stable IDs for referring to them. Reloading returns to the normal link sidebar.
- The red cross icon opens the Audio page. Add MP3 files to `audio/` and push them to the `main` branch; the page discovers them from GitHub when it loads. Use **+** to add an item with a title, optional MP3, and optional script. Click an item's title to play it; right-click to edit its title, MP3, or script. Hold right-click for two seconds to delete the item. Audio items and scripts are saved in the browser, and **Refresh MP3s** reloads the folder listing.
- Click the small circle at the top-center of the viewer to see Moon rise, transit, and set positions, plus sunrise and sunset for Maple Ridge. Use the date field or arrows to choose a day; times use the `America/Vancouver` timezone. Calculations use the [Astronomy Engine](https://github.com/cosinekitty/astronomy) browser library from jsDelivr, so no API key or server is needed; the library is loaded from the CDN when the page opens.
