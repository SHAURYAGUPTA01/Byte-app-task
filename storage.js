'use strict';

/* =====================================================================
   storage.js - saving items in the browser's own database (IndexedDB).

   The data stays on this device and is still there after you close the
   browser. Images are stored as files (blobs), which is why IndexedDB
   is used instead of localStorage (localStorage only holds text and
   about 5 MB).

   If the browser refuses IndexedDB (some private windows do), items are
   kept in memory instead and the app shows a warning.

   To look at the saved data yourself: press F12 in the browser, open
   the Application tab, then IndexedDB > catchall > items.
   ===================================================================== */

const DB_NAME = 'catchall';
const STORE_NAME = 'items';

const Store = {
  db: null,             // the open database
  usingMemory: false,   // true when the database could not be used
  memory: new Map(),    // the fallback: id -> item

  // Open (or create) the database. This never throws: if anything goes
  // wrong the app switches to memory-only mode.
  async open() {
    try {
      if (!window.indexedDB) throw new Error('IndexedDB is not available');

      this.db = await new Promise(function (resolve, reject) {
        const request = window.indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function () {
          // Runs once, the first time: create the "table" that holds the items.
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('Could not open the database')); };
        request.onblocked = function () { reject(new Error('The database is blocked by another tab')); };
      });

      const db = this.db;
      db.onversionchange = function () { db.close(); };

      // Some private windows open the database but refuse to write, so try one write.
      await this.run('readwrite', function (store) {
        store.put({ id: '__test__' });
        store.delete('__test__');
      });
    } catch (error) {
      console.warn('Local database not available, keeping items in memory only:', error);
      this.db = null;
      this.usingMemory = true;
    }
  },

  // Runs one database transaction and waits until it has finished.
  run(mode, work) {
    const db = this.db;
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE_NAME, mode);
      let result;
      const request = work(transaction.objectStore(STORE_NAME));
      if (request && 'onsuccess' in request) {
        request.onsuccess = function () { result = request.result; };
      }
      transaction.oncomplete = function () { resolve(result); };
      transaction.onerror = function () { reject(transaction.error); };
      transaction.onabort = function () { reject(transaction.error || new Error('The save was cancelled')); };
    });
  },

  // All saved items.
  async getAll() {
    if (this.usingMemory) return Array.from(this.memory.values());
    const records = await this.run('readonly', function (store) { return store.getAll(); });
    return records || [];
  },

  // Add a new item, or replace the saved one that has the same id.
  async save(item) {
    if (this.usingMemory) {
      this.memory.set(item.id, item);
      return;
    }
    await this.run('readwrite', function (store) { return store.put(item); });
  },

  // Delete one item for good.
  async remove(id) {
    if (this.usingMemory) {
      this.memory.delete(id);
      return;
    }
    await this.run('readwrite', function (store) { return store.delete(id); });
  },
};


/* The shape of every saved item:

   {
     id:        'unique text',
     type:      'note' | 'link' | 'image',
     title:     'text',
     content:   'note text, or a description / caption',
     url:       'https://...'   (links only, otherwise ''),
     image:     { blob, name, type, width, height, size }   (images only, otherwise null),
     tags:      ['work', 'ideas'],
     createdAt: 1760000000000   (milliseconds, from Date.now()),
     updatedAt: 1760000000000,
     archived:  false
   }

   cleanItem() makes sure whatever comes out of the database has exactly
   this shape, even if a record is old or was edited by hand. */
function cleanItem(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || record.id === '__test__') return null;

  const created = Number(record.createdAt) || Date.now();
  const url = String(record.url || '');

  return {
    id: record.id,
    type: isKind(record.type) ? record.type : 'note',
    title: String(record.title || ''),
    content: String(record.content || ''),
    url: /^https?:\/\//i.test(url) ? url : '',   // only web links are ever shown as links
    image: record.image && record.image.blob ? record.image : null,
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    createdAt: created,
    updatedAt: Number(record.updatedAt) || created,
    archived: Boolean(record.archived),
  };
}
