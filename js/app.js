'use strict';

const state = {
  items: [],             
  view: {                 
    scope: 'inbox',       
    q: '',              
    type: 'all',          
    tag: null,            
    sort: 'updated',       
    showAllTags: false,  
  },
};

const appEl = $('#app');  
let leaveHandlers = [];   

function findItem(id) {
  return state.items.find(function (item) { return item.id === id; });
}

async function loadItems() {
  const records = await Store.getAll();
  state.items = records.map(cleanItem).filter(Boolean);
}

async function saveItem(item) {
  await Store.save(item);
  const index = state.items.findIndex(function (other) { return other.id === item.id; });
  if (index >= 0) state.items[index] = item;
  else state.items.push(item);
}

async function deleteItem(id) {
  await Store.remove(id);
  state.items = state.items.filter(function (item) { return item.id !== id; });
  forgetImageUrl(id);
}

let toastTimer;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { element.classList.remove('show'); }, 4000);
}

function showStorageBanner() {
  if (!Store.usingMemory) return;
  $('#banner').replaceChildren(h('div', { class: 'banner', role: 'alert' },
    'This browser is blocking local storage, so Byte OP can only keep items until you close this tab. ' +
    'Open it in a regular (non-private) window to save for good.'));
}

function onLeaveScreen(callback) {
  leaveHandlers.push(callback);
}
function parseRoute() {
  let parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    parts = parts.map(decodeURIComponent);
  } catch (error) {
    parts = [];
  }

  if (parts[0] === 'new') return { name: 'new', type: parts[1] };
  if (parts[0] === 'item' && parts[1]) return { name: 'item', id: parts[1] };
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] };
  return { name: 'inbox' };
}

function newItemHash() {
  return '#/new' + (isKind(state.view.type) ? '/' + state.view.type : '');
}

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

  const first = $('[data-autofocus]', appEl);  
  if (first) first.focus({ preventScroll: true });
}

function handleKeys(event) {
  if (event.isComposing) return;

  const route = parseRoute();
  const onForm = route.name === 'new' || route.name === 'edit';

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
      const cancel = $('#cancel-btn') || $('a.back'); 
      if (cancel) cancel.click();
    } else if (route.name === 'item') {
      const back = $('a.back');
      if (back) back.click();
    } else {
      const search = $('#q');
      if (search && document.activeElement === search) {
        if (search.value) {
          search.value = '';
          search.dispatchEvent(new Event('input')); 
        } else {
          search.blur();
        }
      }
    }
    return;
  }
  const target = event.target;
  const isTyping = Boolean(target) && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

  if ((event.key === 'n' || event.key === 'N') && !onForm) {
    event.preventDefault();
    location.hash = newItemHash();
  } else if (event.key === '/' && route.name === 'inbox') {
    const search = $('#q');
    if (search) {
      event.preventDefault();  
      search.focus();
      search.select();
    }
  } else if ((event.key === 'e' || event.key === 'E') && route.name === 'item') {
    const edit = $('a[href^="#/edit/"]');
    if (edit) edit.click();
  }
}
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
