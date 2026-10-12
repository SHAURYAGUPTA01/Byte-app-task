'use strict';

const TAGS_SHOWN_AT_FIRST = 12;
function showInbox() {
  const view = state.view;
  const searchBox = h('input', {
    type: 'search',
    id: 'q',
    class: 'input',
    value: view.q,
    autocomplete: 'off',
    placeholder: 'Search titles, text, links, #tags',
    'aria-label': 'Search saved items',
    onInput: function (event) {
      view.q = event.target.value;
      refresh();
    },
  });

  const scopeButtons = {};
  const scopeToggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' });
  for (const scope of ['inbox', 'archive']) {
    scopeButtons[scope] = h('button', {
      type: 'button',
      onClick: function () {
        view.scope = scope;
        view.tag = null;
        refresh();
      },
    });
    scopeToggle.append(scopeButtons[scope]);
  }

  const typeButtons = {};
  const typeRow = h('div', { class: 'controls', role: 'group', 'aria-label': 'Filter by type' });
  const typeChoices = [['all', 'All'], ['note', 'Notes'], ['link', 'Links'], ['image', 'Images']];
  for (const [type, label] of typeChoices) {
    typeButtons[type] = h('button', {
      type: 'button',
      class: 'pill',
      onClick: function () {
        view.type = type;
        refresh();
      },
    }, label);
    typeRow.append(typeButtons[type]);
  }

  const sortSelect = h('select', {
    id: 'sort',
    class: 'input',
    'aria-label': 'Sort order',
    value: view.sort,
    onChange: function (event) {
      view.sort = event.target.value;
      refresh();
    },
  },
    h('option', { value: 'updated' }, 'Recently updated'),
    h('option', { value: 'created' }, 'Newest first'),
    h('option', { value: 'title' }, 'Title A–Z'));

  const tagBar = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by tag' });
  const summary = h('div', { class: 'summary' });
  const list = h('div', { class: 'list' });
  const fab = h('a', { class: 'fab', href: newItemHash(), 'aria-label': 'New item' }, '+ New');

  const header = h('header', { class: 'top' },
    h('div', { class: 'brand-row' },
      h('h1', { class: 'brand' }, 'Byte OP'),
      h('span', { class: 'brand-sub' }, 'Stored on this device only')),
    searchBox,
    h('div', { class: 'controls' }, scopeToggle, sortSelect),
    typeRow);

  const keysHint = h('p', { class: 'keys' },
    'Keys: ', h('kbd', null, 'N'), ' new · ', h('kbd', null, '/'), ' search · ', h('kbd', null, 'Esc'), ' back');

  appEl.append(header, h('div', { class: 'tagwrap' }, tagBar), summary, list, keysHint, fab);

  function clearFilters() {
    view.q = '';
    view.type = 'all';
    view.tag = null;
    searchBox.value = '';
    refresh();
  }

  function refresh() {
    const inboxItems = state.items.filter(function (item) { return !item.archived; });
    const archivedItems = state.items.filter(function (item) { return item.archived; });
    const scopeItems = view.scope === 'archive' ? archivedItems : inboxItems;

    scopeButtons.inbox.replaceChildren('Inbox', h('span', { class: 'count' }, inboxItems.length));
    scopeButtons.archive.replaceChildren('Archive', h('span', { class: 'count' }, archivedItems.length));
    for (const scope of ['inbox', 'archive']) {
      scopeButtons[scope].setAttribute('aria-pressed', String(view.scope === scope));
    }
    for (const type of Object.keys(typeButtons)) {
      typeButtons[type].setAttribute('aria-pressed', String(view.type === type));
    }
    fab.setAttribute('href', newItemHash());

    const tags = countTags(scopeItems);
    if (view.tag && !tags.some(function (entry) { return entry[0] === view.tag; })) view.tag = null;

    let visibleTags = tags;
    if (!view.showAllTags && tags.length > TAGS_SHOWN_AT_FIRST) {
      visibleTags = tags.slice(0, TAGS_SHOWN_AT_FIRST);
      const selected = tags.find(function (entry) { return entry[0] === view.tag; });
      if (selected && !visibleTags.includes(selected)) visibleTags.push(selected);
    }
    const tagButtons = visibleTags.map(function (entry) {
      const tag = entry[0];
      return h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(view.tag === tag),
        onClick: function () {
          view.tag = view.tag === tag ? null : tag;
          refresh();
        },
      }, '#' + tag, h('span', { class: 'n' }, entry[1]));
    });
    if (tags.length > TAGS_SHOWN_AT_FIRST) {
      tagButtons.push(h('button', {
        type: 'button',
        class: 'linkbtn',
        onClick: function () {
          view.showAllTags = !view.showAllTags;
          refresh();
        },
      }, view.showAllTags ? 'Show fewer tags' : 'Show all ' + tags.length + ' tags'));
    }
    tagBar.replaceChildren(...tagButtons);
    tagBar.hidden = tags.length === 0;

    // Apply the type filter, the tag filter and the search text, then sort.
    const shown = scopeItems
      .filter(function (item) {
        return (view.type === 'all' || item.type === view.type)
          && (!view.tag || item.tags.includes(view.tag))
          && itemMatchesSearch(item, view.q);
      })
      .sort(sorters[view.sort] || sorters.updated);

    const isFiltering = Boolean(view.q.trim() || view.type !== 'all' || view.tag);
    const summaryParts = [
      h('span', null, isFiltering
        ? shown.length + ' of ' + scopeItems.length
        : scopeItems.length + (scopeItems.length === 1 ? ' item' : ' items')),
    ];
    if (isFiltering) {
      summaryParts.push(h('button', { type: 'button', class: 'linkbtn', onClick: clearFilters }, 'Clear filters'));
    }
    summary.replaceChildren(...summaryParts);
    summary.hidden = scopeItems.length === 0;

    if (shown.length > 0) {
      list.replaceChildren(...shown.map(makeCard));
    } else if (scopeItems.length === 0 && view.scope === 'inbox') {
      list.replaceChildren(emptyInboxMessage());
    } else if (scopeItems.length === 0) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('h2', null, 'The archive is empty'),
        h('p', null, 'Archived items wait here until you restore or delete them.')));
    } else {
      list.replaceChildren(h('div', { class: 'empty' },
        h('h2', null, 'No matches'),
        h('p', null, 'Nothing here fits the current search and filters.'),
        h('button', { type: 'button', class: 'btn', onClick: clearFilters }, 'Clear filters')));
    }
  }

  refresh();
}

const sorters = {
  updated: function (a, b) { return b.updatedAt - a.updatedAt; },
  created: function (a, b) { return b.createdAt - a.createdAt; },
  title: function (a, b) { return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }); },
};

function emptyInboxMessage() {
  const hasArchived = state.items.length > 0;
  return h('div', { class: 'empty' },
    h('h2', null, hasArchived ? 'Your inbox is clear' : 'Nothing saved yet'),
    h('p', null, hasArchived
      ? 'Everything is archived. Open the Archive tab to restore an item, or save something new.'
      : 'Save a note, a link or an image. Everything stays on this device and is still here when you come back.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn primary', href: '#/new/note' }, 'New note'),
      h('a', { class: 'btn', href: '#/new/link' }, 'Save a link'),
      h('a', { class: 'btn', href: '#/new/image' }, 'Add an image')));
}

function makeCard(item) {
  const thumbnail = item.type === 'image' && item.image
    ? h('img', { class: 'thumb', src: getImageUrl(item), alt: '', loading: 'lazy' })
    : null;
  const preview = item.content ? shorten(item.content) : '';

  return h('a', { class: 'card' + (thumbnail ? ' has-thumb' : ''), href: '#/item/' + encodeURIComponent(item.id) },
    thumbnail,
    h('div', { class: 'card-main' },
      h('div', { class: 'meta' },
        h('span', { class: 'kind kind-' + item.type }, KIND_LABELS[item.type]),
        h('span', { 'aria-hidden': 'true' }, '·'),
        h('span', { title: fullDate(item.updatedAt) }, timeAgo(item.updatedAt))),
      h('h2', { class: 'card-title' }, item.title),
      item.type === 'link' && h('span', { class: 'card-url' }, hostLabel(item.url)),
      preview && h('p', { class: 'card-sub' }, preview),
      item.tags.length > 0 && h('div', { class: 'chips' }, item.tags.map(function (tag) {
        return h('span', { class: 'chip' }, '#' + tag);
      }))));
}
