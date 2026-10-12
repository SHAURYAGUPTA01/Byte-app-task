'use strict';

/* =====================================================================
   helpers.js - small functions that each do one job.

   Nothing in this file touches the database or draws a screen, so it is
   the easiest file to read first. Every other file uses these functions.
   ===================================================================== */


// ---------- Settings ------------------------------------------------------

const KIND_LIST = ['note', 'link', 'image'];
const KIND_LABELS = { note: 'Note', link: 'Link', image: 'Image' };

// True only for 'note', 'link' or 'image' (so a made-up address like #/new/oops is ignored).
function isKind(value) {
  return KIND_LIST.includes(value);
}

const LIMITS = {
  title: 200,                       // characters in a title
  content: 50000,                   // characters in a note
  tagLength: 30,                    // characters in one tag
  tagsPerItem: 20,                  // tags on one item
  imageMaxBytes: 30 * 1024 * 1024,  // images over 30 MB are refused
  imageKeepBytes: 2 * 1024 * 1024,  // images up to 2 MB ...
  imageKeepSide: 2000,              // ... and up to 2000 px are saved as they are
  imageShrinkTo: 1600,              // bigger images are shrunk to 1600 px
};


// ---------- Building page elements ------------------------------------------

/* h('p', { class: 'hint' }, 'Hello')   gives   <p class="hint">Hello</p>

   - tag:      the element name, such as 'div' or 'button'
   - attrs:    { class, value, id, ... }. A name that starts with "on" adds an
               event listener (onClick listens for "click"). Empty values are skipped.
   - children: text, other elements, or arrays of them.

   Text is added as text, never as HTML, so whatever a person types
   can't change the page. */
function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  let value; // applied last, because a <select> needs its <option>s first

  if (attrs) {
    for (const [name, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (name === 'class') {
        element.className = v;
      } else if (name === 'value') {
        value = v;
      } else if (name.length > 2 && name.startsWith('on')) {
        element.addEventListener(name.slice(2).toLowerCase(), v);
      } else {
        element.setAttribute(name, v === true ? '' : v);
      }
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }

  if (value !== undefined) element.value = value;
  return element;
}

// $('#app') is a short way to write document.querySelector('#app').
function $(selector, root = document) {
  return root.querySelector(selector);
}


// ---------- Ids -------------------------------------------------------------

// A unique id for each saved item.
function makeId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (error) {
    // very old browsers: use the fallback below
  }
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}


// ---------- Tags ------------------------------------------------------------

// "  #To   Do " becomes "to do"
function normalizeTag(text) {
  return String(text)
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, LIMITS.tagLength)
    .trim();
}

// How many items use each tag, most used first: [['work', 3], ['home', 1]]
function countTags(items) {
  const counts = new Map();
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort(function (a, b) {
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
}


// ---------- Web addresses ---------------------------------------------------

// Turns what someone typed into a safe web address.
// Returns { url: 'https://...' } or { error: 'message to show' }.
function normalizeUrl(text) {
  let address = String(text).trim();
  if (!address) return { error: 'Enter a web address.' };

  // Never save addresses that run code or open other apps.
  if (/^(javascript|data|vbscript|file|blob|mailto|tel|sms|about):/i.test(address)) {
    return { error: 'Only web links (http or https) can be saved.' };
  }

  // "example.com/page" has no scheme, so add https://
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address);
  if (!hasScheme) address = 'https://' + address.replace(/^\/\//, '');

  let parsed;
  try {
    parsed = new URL(address);
  } catch (error) {
    return { error: 'That doesn’t look like a valid web address.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only web links (http or https) can be saved.' };
  }

  // "justaword" is not a web address, but "localhost:3000" and "http://intranet/" are.
  const host = parsed.hostname;
  const looksLikeHost = host.includes('.') || host === 'localhost' || host.includes(':') || hasScheme;
  if (!host || !looksLikeHost) {
    return { error: 'That doesn’t look like a valid web address.' };
  }

  return { url: parsed.href };
}

// "https://www.example.com/a/b" becomes "example.com"
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (error) {
    return url;
  }
}


// ---------- Titles and text -------------------------------------------------

// A title for items saved without one: the first line of a note,
// the site name of a link, or the file name of an image.
function deriveTitle(item) {
  if (item.type === 'link') return hostLabel(item.url);

  if (item.type === 'image') {
    const fileName = (item.image && item.image.name) || '';
    return fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled image';
  }

  const firstLine = item.content.split(/\r?\n/).map(function (line) { return line.trim(); }).find(Boolean) || '';
  if (!firstLine) return 'Untitled note';
  return firstLine.length > 80 ? firstLine.slice(0, 77).trimEnd() + '…' : firstLine;
}

// A short preview of longer text, on one line.
function shorten(text, max = 160) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}


// ---------- Searching -------------------------------------------------------

// Lower-case and drop accents so "cafe" finds "Café".
function foldText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Every word typed in the search box must be found in the item.
// A word that starts with # (like #work) is matched against the tags only.
function itemMatchesSearch(item, query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const everything = foldText([
    item.title,
    item.content,
    item.url,
    item.image && item.image.name,
    item.tags.join(' '),
  ].filter(Boolean).join('\n'));

  return words.every(function (word) {
    if (word.length > 1 && word[0] === '#') {
      const start = word.slice(1);
      return item.tags.some(function (tag) { return foldText(tag).startsWith(start); });
    }
    return everything.includes(word);
  });
}


// ---------- Dates and sizes -------------------------------------------------

// "Just now", "5 min ago", "Yesterday", "12 Oct"
function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min ago';

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' h ago';

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';

  const date = new Date(timestamp);
  const isThisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, isThisYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// "Sun, 11 Oct 2026, 10:56 pm"
function fullDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// 1536 becomes "2 KB"
function sizeText(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// "300×200 · " (or nothing, if the image size is unknown)
function dimsText(image) {
  return image.width && image.height ? image.width + '×' + image.height + ' · ' : '';
}
