'use strict';

/* =====================================================================
   screen-form.js - the screen for creating a new item or editing one.

   The form has a few small building blocks (a tag box, an image picker,
   an error message line), then showForm() puts them together.

   Uses: h(), $(), normalizeTag(), normalizeUrl(), deriveTitle() ... from helpers.js
         readImageFile() from images.js
         appEl, state, findItem(), saveItem(), toast(), onLeaveScreen() from app.js
         showMissing() from screen-detail.js
   ===================================================================== */


// ---------- Building blocks ---------------------------------------------------

// A small red message under a field. show('some text') displays it, show('') hides it.
function createErrorLine(id, inputToMark) {
  const element = h('p', { class: 'error', id: id, hidden: true });
  return {
    element: element,
    show: function (message) {
      element.textContent = message || '';
      element.hidden = !message;
      if (inputToMark) {
        if (message) inputToMark.setAttribute('aria-invalid', 'true');
        else inputToMark.removeAttribute('aria-invalid');
      }
    },
  };
}

// The tag box: type a tag and press Enter (or a comma) to turn it into a chip.
function createTagInput(startingTags) {
  let tags = startingTags.slice();

  const input = h('input', {
    type: 'text',
    id: 'f-tags',
    autocomplete: 'off',
    maxlength: 80,
    list: 'tag-suggestions',
    placeholder: 'Add a tag, then press Enter',
    'aria-describedby': 'tags-hint',
  });
  const chips = h('span', { class: 'contents' });
  const suggestions = h('datalist', { id: 'tag-suggestions' },
    countTags(state.items).map(function (entry) { return h('option', { value: entry[0] }); }));
  const wrapper = h('div', { class: 'taginput', onClick: function () { input.focus(); } }, chips, input, suggestions);

  function drawChips() {
    chips.replaceChildren(...tags.map(function (tag) {
      return h('span', { class: 'chip' }, '#' + tag,
        h('button', {
          type: 'button',
          'aria-label': 'Remove tag ' + tag,
          onClick: function (event) {
            event.stopPropagation();
            tags = tags.filter(function (other) { return other !== tag; });
            drawChips();
            input.focus();
          },
        }, '×'));
    }));
  }

  // Turns "work, ideas" into two tags (ignoring empty and repeated ones).
  function addTags(text) {
    for (const part of String(text).split(',')) {
      const tag = normalizeTag(part);
      if (tag && !tags.includes(tag) && tags.length < LIMITS.tagsPerItem) tags.push(tag);
    }
    drawChips();
  }

  input.addEventListener('input', function () {
    if (input.value.includes(',')) {          // a comma finishes a tag
      const parts = input.value.split(',');
      const rest = parts.pop();
      addTags(parts.join(','));
      input.value = rest;
    }
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && input.value.trim()) {
      event.preventDefault();                 // Enter adds the tag instead of saving the form
      addTags(input.value);
      input.value = '';
    } else if (event.key === 'Backspace' && !input.value && tags.length > 0) {
      tags.pop();                             // Backspace on an empty box removes the last tag
      drawChips();
    }
  });

  drawChips();

  return {
    element: wrapper,
    // The final list of tags (also includes text typed but not yet confirmed with Enter).
    get: function () {
      if (input.value.trim()) {
        addTags(input.value);
        input.value = '';
      }
      return tags.slice();
    },
    // The same list without changing anything (used to notice unsaved changes).
    peek: function () {
      const pending = normalizeTag(input.value);
      return pending ? tags.concat(pending) : tags.slice();
    },
  };
}

// The image part of the form: choose / drop / paste a picture and preview it.
// "draft" is the form's working copy; the chosen picture is stored in draft.image.
function createImagePicker(draft) {
  let previewUrl = '';
  const error = createErrorLine('e-image');

  const fileInput = h('input', {
    type: 'file',
    id: 'f-file',
    accept: 'image/*',
    hidden: true,
    onChange: function (event) {
      const file = event.target.files[0];
      event.target.value = '';                // lets the same file be chosen again later
      if (file) attach(file);
    },
  });

  const preview = h('div', { class: 'preview', hidden: true });

  const dropZone = h('div', {
    class: 'drop',
    onDragover: function (event) { event.preventDefault(); dropZone.classList.add('over'); },
    onDragleave: function () { dropZone.classList.remove('over'); },
    onDrop: function (event) {
      event.preventDefault();
      dropZone.classList.remove('over');
      const file = Array.from(event.dataTransfer.files).find(function (f) { return f.type.startsWith('image/'); });
      if (file) attach(file);
      else error.show('That file isn’t an image.');
    },
  },
    h('button', { type: 'button', class: 'btn', id: 'pick-image', onClick: function () { fileInput.click(); } }, 'Choose image'),
    h('p', { class: 'hint' }, 'or drop an image here, or paste one with Ctrl/Cmd+V.'),
    fileInput);

  // Shows (or hides) the preview of draft.image.
  function refresh() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }
    const image = draft.image;
    preview.hidden = !image;
    if (!image) {
      preview.replaceChildren();
      return;
    }
    previewUrl = URL.createObjectURL(image.blob);
    preview.replaceChildren(
      h('img', { src: previewUrl, alt: 'Selected image preview' }),
      h('div', { class: 'info' }, image.name, h('br'), dimsText(image) + sizeText(image.size)),
      h('button', { type: 'button', class: 'btn', onClick: function () { draft.image = null; refresh(); } }, 'Remove'));
  }

  // Checks a picked file, shrinks it if it is big, and remembers it.
  async function attach(file) {
    error.show('');
    if (!file.type.startsWith('image/')) {
      error.show('That file isn’t an image.');
      return;
    }
    if (file.size > LIMITS.imageMaxBytes) {
      error.show('That image is over 30 MB. Choose a smaller one.');
      return;
    }
    try {
      draft.image = await readImageFile(file);
      refresh();
    } catch (problem) {
      console.warn(problem);
      error.show('That image couldn’t be read. Try a PNG, JPEG, GIF or WebP file.');
    }
  }

  return {
    field: h('div', { class: 'field' }, h('span', { class: 'label' }, 'Image'), dropZone, preview, error.element),
    attach: attach,
    refresh: refresh,
    showError: error.show,
    destroy: function () { if (previewUrl) URL.revokeObjectURL(previewUrl); },
  };
}

// Which kind of item a new form starts as: the one in the address (#/new/link),
// otherwise the type you are filtering the inbox by, otherwise a note.
function startingType(typeFromAddress) {
  if (isKind(typeFromAddress)) return typeFromAddress;
  if (isKind(state.view.type)) return state.view.type;
  return 'note';
}

// The words on the form change with the kind of item.
const FORM_WORDS = {
  note:  { title: 'Title (optional)', label: 'Note', placeholder: 'Write your note…' },
  link:  { title: 'Title (optional, defaults to the site name)', label: 'Description (optional)', placeholder: 'Why you saved it, or what to remember…' },
  image: { title: 'Title (optional, defaults to the file name)', label: 'Caption (optional)', placeholder: 'What is this image?' },
};


// ---------- The form screen ---------------------------------------------------

// mode is 'new' or 'edit'. id is the item being edited (edit only).
// presetType is 'note', 'link' or 'image' when the address says so (new only).
function showForm(mode, id, presetType) {
  const existing = mode === 'edit' ? findItem(id) : null;
  if (mode === 'edit' && !existing) {
    showMissing();
    return;
  }

  // The form's working copy of the choices that aren't plain text boxes.
  const draft = {
    type: existing ? existing.type : startingType(presetType),
    image: existing ? existing.image : null,
  };
  let isSaving = false;           // stops a double click from saving twice
  let askedToDiscard = false;     // true after Cancel was pressed once with unsaved changes

  // ----- The fields -----

  const titleLabel = h('label', { for: 'f-title' });
  const titleInput = h('input', {
    type: 'text',
    id: 'f-title',
    class: 'input',
    maxlength: LIMITS.title,
    autocomplete: 'off',
    value: existing ? existing.title : '',
    onKeydown: function (event) {
      // Enter in the title moves on to the next box. Without this the browser
      // would save the form, which is surprising when you have only typed a title.
      // (Ctrl/Cmd+Enter still saves; that is handled in app.js.)
      if (event.key === 'Enter' && !event.isComposing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        (draft.type === 'link' ? urlInput : contentInput).focus();
      }
    },
  });

  const contentLabel = h('label', { for: 'f-content' });
  const contentInput = h('textarea', {
    id: 'f-content',
    class: 'input',
    rows: 8,
    maxlength: LIMITS.content,
    value: existing ? existing.content : '',
    'aria-describedby': 'e-content',
  });
  const contentError = createErrorLine('e-content', contentInput);

  const urlInput = h('input', {
    type: 'text',
    id: 'f-url',
    class: 'input',
    inputmode: 'url',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'https://example.com/article',
    value: existing ? existing.url : '',
    'aria-describedby': 'e-url',
  });
  const urlError = createErrorLine('e-url', urlInput);
  const urlField = h('div', { class: 'field' }, h('label', { for: 'f-url' }, 'Web address'), urlInput, urlError.element);

  const imagePicker = createImagePicker(draft);
  const tagInput = createTagInput(existing ? existing.tags : []);

  // Note / Link / Image choice (only when creating; a saved item keeps its type)
  let typePicker = null;
  if (mode === 'new') {
    typePicker = h('fieldset', { class: 'seg typepick' }, h('legend', { class: 'sr' }, 'Type'),
      KIND_LIST.map(function (kind) {
        return h('label', { class: 'seg-opt' },
          h('input', {
            type: 'radio',
            name: 'type',
            value: kind,
            class: 'sr',
            checked: draft.type === kind,
            onChange: function () { setType(kind); },
          }),
          h('span', null, KIND_LABELS[kind]));
      }));
  }

  // Switches the form between note / link / image: shows the right fields and words.
  function setType(kind) {
    draft.type = kind;
    if (typePicker) typePicker.querySelector('input[value="' + kind + '"]').checked = true;

    urlField.hidden = kind !== 'link';
    imagePicker.field.hidden = kind !== 'image';
    titleLabel.textContent = FORM_WORDS[kind].title;
    contentLabel.textContent = FORM_WORDS[kind].label;
    contentInput.placeholder = FORM_WORDS[kind].placeholder;
    contentInput.rows = kind === 'note' ? 10 : 4;

    contentError.show('');
    urlError.show('');
    imagePicker.showError('');
  }

  // Pasting a picture (Ctrl/Cmd+V) anywhere on the form attaches it.
  function onPaste(event) {
    const files = (event.clipboardData && event.clipboardData.files) || [];
    const file = Array.from(files).find(function (f) { return f.type.startsWith('image/'); });
    if (!file) return;
    if (draft.type !== 'image' && mode === 'edit') return;   // don't turn a saved note into an image
    event.preventDefault();
    if (draft.type !== 'image') setType('image');
    imagePicker.attach(file);
  }
  document.addEventListener('paste', onPaste);
  onLeaveScreen(function () {
    document.removeEventListener('paste', onPaste);
    imagePicker.destroy();
  });

  // ----- Saving -----

  async function onSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    contentError.show('');
    urlError.show('');
    imagePicker.showError('');

    const kind = draft.type;
    const title = titleInput.value.trim().slice(0, LIMITS.title);
    const content = contentInput.value.trim();
    let url = '';

    // Check the input. Each problem shows a message next to the field and stops here.
    if (kind === 'link') {
      const result = normalizeUrl(urlInput.value);
      if (result.error) {
        urlError.show(result.error);
        urlInput.focus();
        return;
      }
      url = result.url;
    }
    if (kind === 'image' && !draft.image) {
      imagePicker.showError('Choose an image to save.');
      return;
    }
    if (kind === 'note' && !title && !content) {
      contentError.show('Write something or add a title to save this note.');
      contentInput.focus();
      return;
    }

    // Build the item.
    const image = kind === 'image' ? draft.image : null;
    const finalTitle = title || deriveTitle({ type: kind, content: content, url: url, image: image });
    const now = Date.now();
    const tags = tagInput.get();

    const item = existing
      ? { ...existing, title: finalTitle, content: content, url: url, image: image, tags: tags, updatedAt: now }
      : { id: makeId(), type: kind, title: finalTitle, content: content, url: url, image: image, tags: tags, createdAt: now, updatedAt: now, archived: false };

    // Save it, then show it.
    isSaving = true;
    saveButton.disabled = true;
    try {
      await saveItem(item);
      // replace() swaps the form out of the browser history, so Back goes to the
      // inbox instead of returning to an empty form.
      location.replace('#/item/' + encodeURIComponent(item.id));
    } catch (error) {
      console.error(error);
      isSaving = false;
      saveButton.disabled = false;
      toast('Couldn’t save. This device may be out of storage or blocking local storage.');
    }
  }

  // ----- Cancelling -----

  // A short text that changes whenever the person changes something on the form.
  function snapshot() {
    return JSON.stringify([
      draft.type,
      titleInput.value,
      contentInput.value,
      urlInput.value,
      tagInput.peek(),
      draft.image ? draft.image.name + draft.image.size : '',
    ]);
  }

  function leaveForm() {
    location.replace(existing ? '#/item/' + encodeURIComponent(existing.id) : '#/');
  }

  // First press with unsaved changes asks "Discard changes?", the second press leaves.
  function onCancel() {
    if (snapshot() !== startingSnapshot && !askedToDiscard) {
      askedToDiscard = true;
      cancelButton.textContent = 'Discard changes?';
      cancelButton.classList.add('danger');
      return;
    }
    leaveForm();
  }

  // ----- Put the form together -----

  const saveButton = h('button', { type: 'submit', id: 'save-btn', class: 'btn primary' }, existing ? 'Save changes' : 'Save');
  const cancelButton = h('button', { type: 'button', id: 'cancel-btn', class: 'btn', onClick: onCancel }, 'Cancel');

  const form = h('form', { id: 'item-form', class: 'form', novalidate: true, onSubmit: onSubmit },
    h('h1', { tabindex: '-1' }, existing ? 'Edit ' + KIND_LABELS[existing.type].toLowerCase() : 'New item'),
    typePicker,
    h('div', { class: 'field' }, titleLabel, titleInput),
    urlField,
    imagePicker.field,
    h('div', { class: 'field' }, contentLabel, contentInput, contentError.element),
    h('div', { class: 'field' },
      h('label', { for: 'f-tags' }, 'Tags'),
      tagInput.element,
      h('p', { class: 'hint', id: 'tags-hint' }, 'Press Enter or type a comma to add each tag.')),
    h('div', { class: 'form-actions' }, saveButton, cancelButton));

  appEl.append(
    h('a', { class: 'back', href: existing ? '#/item/' + encodeURIComponent(existing.id) : '#/' },
      '← ' + (existing ? 'Back to item' : 'Back to inbox')),
    form);

  titleInput.setAttribute('data-autofocus', '');   // the cursor starts in the title box
  setType(draft.type);
  imagePicker.refresh();
  const startingSnapshot = snapshot();
}
