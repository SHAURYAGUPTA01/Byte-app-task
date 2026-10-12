'use strict';

const KIND_LIST = ['note', 'link', 'image'];
const KIND_LABELS = { note: 'Note', link: 'Link', image: 'Image' };

function isKind(value) {
  return KIND_LIST.includes(value);
}

const LIMITS = {
  title: 200,                     
  content: 50000,                   
  tagLength: 30,                    
  tagsPerItem: 20,                 
  imageMaxBytes: 30 * 1024 * 1024, 
  imageKeepBytes: 2 * 1024 * 1024, 
  imageKeepSide: 2000,            
  imageShrinkTo: 1600,              
};

function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  let value;

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

function $(selector, root = document) {
  return root.querySelector(selector);
}

function makeId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (error) {
  }
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}


function normalizeTag(text) {
  return String(text)
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, LIMITS.tagLength)
    .trim();
}

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


function normalizeUrl(text) {
  let address = String(text).trim();
  if (!address) return { error: 'Enter a web address.' };

  if (/^(javascript|data|vbscript|file|blob|mailto|tel|sms|about):/i.test(address)) {
    return { error: 'Only web links (http or https) can be saved.' };
  }

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

  const host = parsed.hostname;
  const looksLikeHost = host.includes('.') || host === 'localhost' || host.includes(':') || hasScheme;
  if (!host || !looksLikeHost) {
    return { error: 'That doesn’t look like a valid web address.' };
  }

  return { url: parsed.href };
}
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (error) {
    return url;
  }
}
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

function shorten(text, max = 160) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}

function foldText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
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

function fullDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function sizeText(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function dimsText(image) {
  return image.width && image.height ? image.width + '×' + image.height + ' · ' : '';
}
