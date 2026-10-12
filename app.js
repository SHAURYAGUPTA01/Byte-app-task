'use strict';

/* =====================================================================
   app.js - the "brain" of the app. It is loaded last.

   - state:         the saved items and what the inbox is currently showing
   - render():      draws the screen that matches the address (#/...)
   - handleKeys():  the keyboard shortcuts
   - start():       opens the database, loads the items, shows the first screen

   The screens live in screen-inbox.js, screen-detail.js and screen-form.js.

   How the address picks the screen:
     #/                inbox
     #/item/<id>       one item
     #/new             new item  (#/new/note, #/new/link and #/new/image also work)
     #/edit/<id>       edit an item
   ===================================================================== */


// ---------- Shared data -------------------------------------------------------

const state = {
  items: [],               // every saved item (loaded from the database at start-up)
  view: {                  // what the inbox is showing
    scope: 'inbox',        // 'inbox' or 'archive'
    q: '',                 // text in the search box
    type: 'all',           // 'all', 'note', 'link' or 'image'
    tag: null,             // a tag to filter by, or null
    sort: 'updated',       // 'updated', 'created' or 'title'
    showAllTags: false,    // true after "Show all tags" is pressed
  },
};

const appEl = $('#app');   // the element every screen is drawn into
let leaveHandlers = [];    // clean-up jobs to run when the current screen is replaced

function findItem(id) {
  return state.items.find(function (item) { return item.id === id; });
}

// Reads every item from the database into state.items.
async function loadItems() {
  const records = await Store.getAll();
  state.items = records.map(cleanItem).filter(Boolean);
}

// Saves an item to the database, then updates the list in memory.
async function saveItem(item) {
  await Store.save(item);
  const index = state.items.findIndex(function (other) { return other.id === item.id; });
  if (index >= 0) state.items[index] = item;
  else state.items.push(item);
}

// Deletes an item from the database and from the list in memory.
async function deleteItem(id) {
  await Store.remove(id);
  state.items = state.items.filter(function (item) { return item.id !== id; });
  forgetImageUrl(id);
}


// ---------- Small messages ------------------------------------------------------

let toastTimer;

// Shows a short message at the bottom of the screen for a few seconds.
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { element.classList.remove('show'); }, 4000);
}

// A warning at the top of the page when the browser won't let us save.
function showStorageBanner() {
  if (!Store.usingMemory) return;
  $('#banner').replaceChildren(h('div', { class: 'banner', role: 'alert' },
    'This browser is blocking local storage, so Catchall can only keep items until you close this tab. ' +
    'Open it in a regular (non-private) window to save for good.'));
}


// ---------- Switching screens ---------------------------------------------------

// A screen can ask to be told when it is replaced (to remove listeners it added).
function onLeaveScreen(callback) {
  leaveHandlers.push(callback);
}

// Reads the address in the browser bar and returns { name: 'inbox' | 'item' | 'new' | 'edit', ... }
function parseRoute() {
  let parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    parts = parts.map(decodeURIComponent);
  } catch (error) {
    parts = [];   // a broken address such as #/item/%E0 shows the inbox instead of failing
  }

  if (parts[0] === 'new') return { name: 'new', type: parts[1] };
  if (parts[0] === 'item' && parts[1]) return { name: 'item', id: parts[1] };
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] };
  return { name: 'inbox' };
}

// Where the "+ New" button and the N key go: it opens the kind you are filtering by.
function newItemHash() {
  return '#/new' + (isKind(state.view.type) ? '/' + state.view.type : '');
}

// Draws the screen for the current address.
function render() {
  leaveHandlers.forEach(function (callback) { callback(); });
  leaveHandlers = [];
  appEl.replaceChildren();

  const route = parseRoute();
  try {
    if (route.name === 'item') showDetail(route.id);
    else if (route.name === 'edit') showForm('edit', route.id);
    else if (route.name === 'new') showForm('new', null, route.type);
    else showInbox();
  } catch (error) {
    console.error(error);
    appEl.replaceChildren(h('div', { class: 'empty' },
      h('h2', null, 'Something went wrong'),
      h('p', null, 'Reload the page. Your saved items are not affected.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Back to inbox')));
  }

  const first = $('[data-autofocus]', appEl);   // the screen can mark where the cursor should start
  if (first) first.focus({ preventScroll: true });
}


// ---------- Keyboard shortcuts --------------------------------------------------

/*  N             new item              (inbox and item screens)
    /             jump to the search box (inbox)
    E             edit the item         (item screen)
    Esc           go back / cancel / clear the search
    Ctrl+Enter    save the form         (also Cmd+Enter on a Mac)

    The letter keys are ignored while you are typing in a box,
    and when Ctrl, Alt or Cmd is held (so browser shortcuts still work). */
function handleKeys(event) {
  if (event.isComposing) return;   // the person is still choosing characters (e.g. Japanese input)

  const route = parseRoute();
  const onForm = route.name === 'new' || route.name === 'edit';

  // Ctrl/Cmd + Enter saves the form from anywhere on it.
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    const form = $('#item-form');
    if (form) {
      event.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
    return;
  }

  if (event.key === 'Escape') {
    if (onForm) {
      const cancel = $('#cancel-btn') || $('a.back');   // (no Cancel button on the "item no longer exists" screen)
      if (cancel) cancel.click();
    } else if (route.name === 'item') {
      const back = $('a.back');
      if (back) back.click();
    } else {
      const search = $('#q');
      if (search && document.activeElement === search) {
        if (search.value) {
          search.value = '';
          search.dispatchEvent(new Event('input'));   // run the same code as typing would
        } else {
          search.blur();
        }
      }
    }
    return;
  }

  // The remaining shortcuts are single letters, so never while typing.
  const target = event.target;
  const isTyping = Boolean(target) && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

  if ((event.key === 'n' || event.key === 'N') && !onForm) {
    event.preventDefault();
    location.hash = newItemHash();
  } else if (event.key === '/' && route.name === 'inbox') {
    const search = $('#q');
    if (search) {
      event.preventDefault();   // so the "/" is not typed into the box
      search.focus();
      search.select();
    }
  } else if ((event.key === 'e' || event.key === 'E') && route.name === 'item') {
    const edit = $('a[href^="#/edit/"]');   // the Edit button (not "Open link", which is also blue)
    if (edit) edit.click();
  }
}


// ---------- Start ---------------------------------------------------------------

async function start() {
  await Store.open();

  try {
    await loadItems();
  } catch (error) {
    console.error(error);
    Store.usingMemory = true;
    state.items = [];
  }

  showStorageBanner();

  window.addEventListener('hashchange', function () {
    window.scrollTo(0, 0);
    render();
  });
  document.addEventListener('keydown', handleKeys);

  render();
}

start();
