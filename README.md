# Catchall

A single-device inbox for notes, links and images, written in plain HTML, CSS and JavaScript.

- No libraries, no `npm install`, no build step, no account, no backend.
- Everything is saved in the browser's own database on the device you use, and is still there after you close and reopen the app.

## Run it in VS Code

Open this folder in VS Code (**File > Open Folder**), then use any one of these:

1. **Live Server (recommended).** VS Code suggests the *Live Server* extension when you open the folder; install it. Then click **Go Live** in the bottom-right status bar, or right-click `index.html` and choose **Open with Live Server**. The page reloads each time you save a file, and your saved items stay.
2. **F5.** Open the **Run and Debug** panel, pick *Open index.html in Chrome* (or *Edge*) and press **F5**. This starts a temporary browser profile, so items you save there may not be kept between runs. Use option 1 or 3 for data you want to keep.
3. **Double-click `index.html`** (or right-click it in VS Code's Explorer and choose *Reveal in File Explorer*, then open it in your browser).

It uses only standard browser features. It was tested in Chromium (the engine behind Chrome and Edge), both opened straight from the folder and served over `http://`. Firefox and Safari were not tested.

## What it does

| You can | How |
| --- | --- |
| Save a **note**, a **link** or an **image** | **+ New** button, then pick Note / Link / Image |
| Open, edit, archive, restore, delete | Click an item. Delete asks "Delete permanently?" first |
| Add tags | Type a tag in the form and press Enter or a comma |
| Search | The search box looks in titles, text, web addresses, image names and tags. Start a word with `#` (for example `#work`) to search tags only |
| Filter | Inbox / Archive, All / Notes / Links / Images, and tag buttons |
| Sort | Recently updated, Newest first, Title A-Z |

Odd input is handled: an empty note is refused with a message, a missing title is filled in (first line of a note, site name of a link, file name of an image), `example.com` becomes `https://example.com`, links that are not `http` or `https` (such as `javascript:`) are refused, tags are tidied (lower case, no `#`, no repeats), big photos are shrunk before saving, and anything typed is shown as text and never run as HTML.

## Keyboard shortcuts

| Key | Where | What it does |
| --- | --- | --- |
| `N` | Inbox, item | New item (opens the kind you are filtering by) |
| `/` | Inbox | Jump to the search box |
| `E` | Item | Edit the item |
| `Esc` | Everywhere | Clear the search, go back from an item, cancel a form |
| `Ctrl` + `Enter` (`Cmd` + `Enter` on a Mac) | Form | Save |
| `Enter` | Title box | Move on to the next box (it does not save) |

The letter keys do nothing while you are typing in a box.

## The files

```
catchall-app/
├── index.html            the page; loads the files below
├── favicon.svg           the tab icon
├── css/
│   └── style.css         all the styling (colours are variables at the top; dark mode included)
├── js/                   loaded in this order
│   ├── helpers.js        small functions: build elements, clean up tags and links, search, dates
│   ├── storage.js        saving and loading items (IndexedDB)
│   ├── images.js         picking, shrinking and showing pictures
│   ├── screen-inbox.js   the home screen: search, filters, list
│   ├── screen-detail.js  the screen for one item
│   ├── screen-form.js    the create / edit screen
│   └── app.js            shared data, switching screens, keyboard shortcuts, start-up
└── .vscode/
    ├── launch.json       what F5 does
    └── extensions.json   suggests Live Server
```

**How it fits together.** `index.html` loads the scripts. `app.js` runs last: it opens the database, loads the items into `state.items`, and calls `render()`. `render()` looks at the address in the browser bar (`#/`, `#/item/<id>`, `#/new`, `#/edit/<id>`) and draws the matching screen into `<main id="app">`. Clicking a link just changes the address, which draws the next screen.

The scripts are plain `<script>` tags rather than ES modules on purpose: modules cannot be loaded when you open `index.html` straight from a folder.

## How the data is stored

Items live in IndexedDB: database `catchall`, store `items`. To see them, press **F12** in the browser, open the **Application** tab, then **IndexedDB > catchall > items**. To start fresh, delete that database (or use **Clear site data**).

Each item looks like this:

```js
{
  id: 'unique text',
  type: 'note',                 // 'note', 'link' or 'image'
  title: 'text',
  content: 'text',              // the note, or a description / caption
  url: 'https://...',           // links only
  image: { blob, name, type, width, height, size },   // images only
  tags: ['work', 'ideas'],
  createdAt: 1760000000000,     // milliseconds
  updatedAt: 1760000000000,
  archived: false
}
```

IndexedDB is used instead of `localStorage` because images are stored as files and `localStorage` only holds text and about 5 MB.

Data belongs to one browser on one device, **and to one address**. Opening the app through Live Server (`http://127.0.0.1:5500`), by double-clicking `index.html` (`file://...`), or in a different browser each use a separate store, so items saved one way will not appear the other way. Live Server also moves to a new port (5501, ...) if 5500 is busy, which looks like an empty app. Pick one way to run it and keep using it. Clearing the site's data in the browser deletes the items, and there is no export yet. If the browser blocks storage (some private windows do), a warning appears and items last only until the tab is closed.

## Try it yourself

1. Create a note with a title, some text and two tags.
2. Create a link: type `example.com` and check it becomes `https://example.com/`.
3. Create an image from any photo.
4. Search for a word from the note, then for `#` and a tag.
5. Open the note, press **Edit**, change it, and save.
6. **Archive** it, find it under **Archive**, then **Restore** it.
7. Try to save an empty note (you should see a message) and a link such as `not a url`.
8. Close the tab (or the whole browser), open the app again, and check everything is still there.

## If something looks wrong

- **Nothing shows but "Loading your items..."**: JavaScript is blocked or a file did not load. Press **F12** and look at the **Console** tab.
- **A yellow/red banner about local storage**: you are in a private window or the browser is blocking storage. Use a normal window.
- **Items gone after pressing F5 in VS Code**: that browser profile is temporary. Use Live Server, or open `index.html` in your normal browser.
- **Live Server button missing**: install the extension (VS Code Extensions panel, search *Live Server*), or use option 2 or 3 above.
