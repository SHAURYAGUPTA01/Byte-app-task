'use strict';

const DB_NAME = 'ByteOP';
const STORE_NAME = 'items';

const Store = {
  db: null,
  usingMemory: false,
  memory: new Map(),

  async open() {
    try {
      if (!window.indexedDB) throw new Error('IndexedDB is not available');

      this.db = await new Promise(function (resolve, reject) {
        const request = window.indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function () {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('Could not open the database')); };
        request.onblocked = function () { reject(new Error('The database is blocked by another tab')); };
      });

      const db = this.db;
      db.onversionchange = function () { db.close(); };

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

  async save(item) {
    if (this.usingMemory) {
      this.memory.set(item.id, item);
      return;
    }
    await this.run('readwrite', function (store) { return store.put(item); });
  },

  async remove(id) {
    if (this.usingMemory) {
      this.memory.delete(id);
      return;
    }
    await this.run('readwrite', function (store) { return store.delete(id); });
  },
};

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
    url: /^https?:\/\//i.test(url) ? url : '',
    image: record.image && record.image.blob ? record.image : null,
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    createdAt: created,
    updatedAt: Number(record.updatedAt) || created,
    archived: Boolean(record.archived),
  };
}
