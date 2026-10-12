'use strict';

function showDetail(id) {
  const item = findItem(id);
  if (!item) {
    showMissing();
    return;
  }

  let askingToDelete = false;
  const actions = h('div', { class: 'actions' });

  function drawActions() {
    const deleteControls = askingToDelete
      ? h('span', { class: 'confirm' },
          h('span', null, 'Delete permanently?'),
          h('button', { type: 'button', class: 'btn', onClick: function () { askingToDelete = false; drawActions(); } }, 'Cancel'),
          h('button', { type: 'button', class: 'btn danger solid', onClick: deleteThisItem }, 'Delete'))
      : h('button', { type: 'button', class: 'btn danger', onClick: function () { askingToDelete = true; drawActions(); } }, 'Delete');

    actions.replaceChildren(
      h('a', { class: 'btn primary', href: '#/edit/' + encodeURIComponent(id) }, 'Edit'),
      h('button', { type: 'button', class: 'btn', onClick: toggleArchived }, item.archived ? 'Restore' : 'Archive'),
      deleteControls);
  }

  async function toggleArchived() {
    try {
      await saveItem({ ...item, archived: !item.archived, updatedAt: Date.now() });
      toast(item.archived ? 'Restored to inbox' : 'Archived');
      render();
    } catch (error) {
      console.error(error);
      toast('Couldn’t update this item. Try again.');
    }
  }

  async function deleteThisItem() {
    try {
      await deleteItem(id);
      state.view.scope = item.archived ? 'archive' : 'inbox';
      toast('Deleted');
      location.replace('#/');
    } catch (error) {
      console.error(error);
      toast('Couldn’t delete this item. Try again.');
    }
  }

  function showItemsWithTag(tag) {
    Object.assign(state.view, { scope: item.archived ? 'archive' : 'inbox', q: '', type: 'all', tag: tag });
    location.hash = '#/';
  }

  drawActions();

  appEl.append(
    h('a', {
      class: 'back',
      href: '#/',
      onClick: function () { state.view.scope = item.archived ? 'archive' : 'inbox'; },
    }, '← ' + (item.archived ? 'Archive' : 'Inbox')),

    h('article', { class: 'detail' },
      h('div', { class: 'meta' },
        h('span', { class: 'kind kind-' + item.type }, KIND_LABELS[item.type]),
        item.archived && h('span', { class: 'badge' }, 'Archived')),

      h('h1', { tabindex: '-1', 'data-autofocus': '' }, item.title),

      item.type === 'link' && item.url && h('div', { class: 'linkbox' },
        h('span', { class: 'url' }, item.url),
        h('a', { class: 'btn primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open link'),
        h('button', { type: 'button', class: 'btn', onClick: function () { copyText(item.url); } }, 'Copy')),

      item.type === 'image' && item.image && h('img', { class: 'detail-img', src: getImageUrl(item), alt: item.title }),
      item.type === 'image' && item.image && h('p', { class: 'imgmeta' },
        item.image.name + ' · ' + dimsText(item.image) + sizeText(item.image.size)),

      item.content && h('div', { class: 'body' }, item.content),

      item.tags.length > 0 && h('div', { class: 'chips' }, item.tags.map(function (tag) {
        return h('button', {
          type: 'button',
          class: 'chip',
          'aria-label': 'Show items tagged ' + tag,
          onClick: function () { showItemsWithTag(tag); },
        }, '#' + tag);
      })),

      h('div', { class: 'dates' },
        h('span', null, 'Created ' + fullDate(item.createdAt)),
        item.updatedAt - item.createdAt > 1000 && h('span', null, 'Updated ' + fullDate(item.updatedAt))),

      actions));
}

function showMissing() {
  appEl.append(
    h('a', { class: 'back', href: '#/' }, '← Inbox'),
    h('div', { class: 'empty' },
      h('h2', { tabindex: '-1', 'data-autofocus': '' }, 'That item no longer exists'),
      h('p', null, 'It may have been deleted, or the link is out of date.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Back to inbox')));
}

function copyText(text) {
  function copied() { toast('Link copied'); }
  function failed() { toast('Couldn’t copy automatically. Select the address and copy it.'); }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(copied, failed);
    } else {
      failed();
    }
  } catch (error) {
    failed();
  }
}
