import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Image,
  Linking,
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const KEY = 'inbox-items-v1';
const TYPES = ['note', 'link', 'image'];
const ICON = { note: '📝', link: '🔗', image: '🖼️' };
const TOP = Platform.select({
  ios: 54,
  android: StatusBar.currentHeight || 24,
  default: 12,
});

const typeName = (t) => ICON[t] + ' ' + t[0].toUpperCase() + t.slice(1);
const fmt = (d) => new Date(d).toLocaleString();
const hashtags = (tags) => tags.map((t) => '#' + t).join(' ');
const parseTags = (s) =>
  [
    ...new Set(
      s
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, '').toLowerCase().slice(0, 30))
        .filter(Boolean)
    ),
  ].slice(0, 10);

const Chip = ({ label, on, onPress }) => (
  <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}>
    <Text style={on ? s.chipTextOn : s.chipText}>{label}</Text>
  </TouchableOpacity>
);

const Btn = ({ label, onPress, color = '#2563eb' }) => (
  <TouchableOpacity
    style={[s.btn, { backgroundColor: color }]}
    onPress={onPress}>
    <Text style={s.btnText}>{label}</Text>
  </TouchableOpacity>
);
const Pic = ({ uri, big }) => {
  const [bad, setBad] = useState('');
  const box = big ? s.photo : s.thumb;
  return bad === uri ? (
    <View style={[box, s.center]}>
      <Text style={s.missing}>Image missing</Text>
    </View>
  ) : (
    <Image
      source={{ uri }}
      style={[box, { resizeMode: big ? 'contain' : 'cover' }]}
      onError={() => setBad(uri)}
    />
  );
};

function Form({ item, onSave, onCancel }) {
  const [type, setType] = useState(item ? item.type : 'note');
  const [title, setTitle] = useState(item ? item.title : '');
  const [content, setContent] = useState(item ? item.content : '');
  const [tags, setTags] = useState(item ? item.tags.join(' ') : '');
  const [error, setError] = useState('');

  const pick = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      if (!r.canceled) {
        setContent(r.assets[0].uri);
        setError('');
      }
    } catch (e) {
      setError(
        'Could not open your photos. Check the photo permission and try again.'
      );
    }
  };

  const save = () => {
    let body = content.trim();
    let name = title.trim();
    if (type === 'link') {
      if (body && !/^[a-z][a-z0-9+.-]*:\/\//i.test(body))
        body = 'https://' + body;
      if (!/^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i.test(body)) {
        setError('Enter a valid web link, like https://example.com');
        return;
      }
      name = name || body.replace(/^https?:\/\//i, '');
    } else if (type === 'image') {
      if (!body) {
        setError('Choose an image to save.');
        return;
      }
      name = name || 'Untitled image';
    } else {
      if (!body && !name) {
        setError('Add a title or some text to save this note.');
        return;
      }
      name = name || body.split('\n')[0].slice(0, 60);
    }
    onSave({ type, title: name, content: body, tags: parseTags(tags) });
  };

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={s.link}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.barTitle}>
          {item ? 'Edit' : 'New'} {type}
        </Text>
        <TouchableOpacity onPress={save}>
          <Text style={s.link}>Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={s.pad}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {item ? null : (
          <View style={s.wrap}>
            {TYPES.map((t) => (
              <Chip
                key={t}
                label={typeName(t)}
                on={type === t}
                onPress={() => {
                  if (t === 'image' || type === 'image') setContent('');
                  setType(t);
                  setError('');
                }}
              />
            ))}
          </View>
        )}
        <TextInput
          style={s.input}
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />
        {type === 'image' ? (
          <>
            <Btn
              label={content ? 'Choose a different image' : 'Choose image'}
              onPress={pick}
            />
            {content ? <Pic uri={content} big /> : null}
          </>
        ) : (
          <TextInput
            key={type}
            style={[s.input, type === 'note' && s.area]}
            placeholder={
              type === 'link' ? 'https://example.com' : 'Write your note'
            }
            value={content}
            onChangeText={setContent}
            multiline={type === 'note'}
            autoCapitalize={type === 'link' ? 'none' : 'sentences'}
            autoCorrect={type !== 'link'}
            keyboardType={type === 'link' ? 'url' : 'default'}
          />
        )}
        <TextInput
          style={s.input}
          placeholder="Tags, separated by spaces or commas"
          value={tags}
          onChangeText={setTags}
          autoCapitalize="none"
        />
      </ScrollView>
    </View>
  );
}

function Detail({ item, onBack, onEdit, onArchive, onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit}>
          <Text style={s.link}>Edit</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.muted}>
          {typeName(item.type)}
          {item.archived ? ' (archived)' : ''}
        </Text>
        <Text style={s.h1}>{item.title}</Text>
        {item.type === 'image' ? (
          <Pic uri={item.content} big />
        ) : (
          <Text selectable style={s.body}>
            {item.content}
          </Text>
        )}
        {item.type === 'link' ? (
          <Btn
            label="Open link"
            onPress={() => Linking.openURL(item.content).catch(() => {})}
          />
        ) : null}
        {item.tags.length > 0 ? (
          <Text style={s.tag}>{hashtags(item.tags)}</Text>
        ) : null}
        <Text style={s.muted}>Created {fmt(item.createdAt)}</Text>
        <Text style={s.muted}>Updated {fmt(item.updatedAt)}</Text>
        <Btn
          label={item.archived ? 'Restore' : 'Archive'}
          color="#6b7280"
          onPress={onArchive}
        />
        <Btn
          label={sure ? 'Tap again to delete' : 'Delete'}
          color="#dc2626"
          onPress={() => (sure ? onDelete() : setSure(true))}
        />
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [screen, setScreen] = useState('home');
  const [id, setId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        const d = JSON.parse(v);
        if (Array.isArray(d)) setItems(d);
      })
      .catch(() => {})
      .then(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify(items))
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [items, loaded]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      setScreen(screen === 'form' && id ? 'detail' : 'home');
      return true;
    });
    return () => sub.remove();
  }, [screen, id]);

  const item = items.find((i) => i.id === id);
  const inboxCount = items.filter((i) => !i.archived).length;
  const inView = items.filter((i) => i.archived === archived);
  const tags = [...new Set(inView.flatMap((i) => i.tags))].sort();
  const activeTag = tags.includes(tag) ? tag : '';
  const q = query.trim().toLowerCase();
  const shown = inView.filter(
    (i) =>
      (filter === 'all' || i.type === filter) &&
      (!activeTag || i.tags.includes(activeTag)) &&
      (!q ||
        (
          i.title +
          ' ' +
          (i.type === 'image' ? '' : i.content) +
          ' ' +
          i.tags.join(' ')
        )
          .toLowerCase()
          .includes(q))
  );

  const save = (data) => {
    const now = new Date().toISOString();
    if (item) {
      setItems((p) =>
        p.map((i) => (i.id === item.id ? { ...i, ...data, updatedAt: now } : i))
      );
    } else {
      const newId =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      setItems((p) => [
        { ...data, id: newId, createdAt: now, updatedAt: now, archived: false },
        ...p,
      ]);
    }
    setScreen(item ? 'detail' : 'home');
  };
  const toggleArchive = (i) =>
    setItems((p) =>
      p.map((x) =>
        x.id === i
          ? { ...x, archived: !x.archived, updatedAt: new Date().toISOString() }
          : x
      )
    );
  const remove = (i) => setItems((p) => p.filter((x) => x.id !== i));

  if (!loaded)
    return (
      <View style={s.screen}>
        <Text style={s.empty}>Loading…</Text>
      </View>
    );

  if (screen === 'form') {
    return (
      <Form
        item={item}
        onSave={save}
        onCancel={() => setScreen(item ? 'detail' : 'home')}
      />
    );
  }

  if (screen === 'detail' && item) {
    return (
      <Detail
        item={item}
        onBack={() => setScreen('home')}
        onEdit={() => setScreen('form')}
        onArchive={() => {
          toggleArchive(item.id);
          setScreen('home');
        }}
        onDelete={() => {
          remove(item.id);
          setScreen('home');
        }}
      />
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.h1}>{archived ? 'Archive' : 'Inbox'}</Text>
        <TouchableOpacity
          onPress={() => {
            setId(null);
            setScreen('form');
          }}>
          <Text style={s.link}>+ New</Text>
        </TouchableOpacity>
      </View>
      {failed ? (
        <Text style={s.warn}>
          Could not save to this device. Free up storage and try again.
        </Text>
      ) : null}
      <TextInput
        style={s.search}
        placeholder="Search titles, text and tags"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      <View style={s.wrap}>
        <Chip
          label={'Inbox (' + inboxCount + ')'}
          on={!archived}
          onPress={() => setArchived(false)}
        />
        <Chip
          label={'Archived (' + (items.length - inboxCount) + ')'}
          on={archived}
          onPress={() => setArchived(true)}
        />
      </View>
      <View style={s.wrap}>
        {['all', ...TYPES].map((t) => (
          <Chip
            key={t}
            label={t === 'all' ? 'All' : typeName(t)}
            on={filter === t}
            onPress={() => setFilter(t)}
          />
        ))}
      </View>
      {tags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tagRow}
          contentContainerStyle={s.tagContent}>
          {tags.map((t) => (
            <Chip
              key={t}
              label={'#' + t}
              on={activeTag === t}
              onPress={() => setTag(activeTag === t ? '' : t)}
            />
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <Text style={s.empty}>
            {items.length === 0
              ? 'Nothing saved yet.\nTap “+ New” to save a note, link or image.'
              : 'No items match here. Try another search or filter.'}
          </Text>
        }
        renderItem={({ item: it }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              setId(it.id);
              setScreen('detail');
            }}>
            {it.type === 'image' ? (
              <Pic uri={it.content} />
            ) : (
              <Text style={s.icon}>{ICON[it.type]}</Text>
            )}
            <View style={s.grow}>
              <Text style={s.title} numberOfLines={1}>
                {it.title}
              </Text>
              {it.type === 'image' ? null : (
                <Text style={s.muted} numberOfLines={2}>
                  {it.content}
                </Text>
              )}
              <Text style={s.tag} numberOfLines={1}>
                {it.tags.length > 0 ? hashtags(it.tags) + '  ' : ''}
                {new Date(it.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity onPress={() => toggleArchive(it.id)}>
              <Text style={s.action}>
                {it.archived ? 'Restore' : 'Archive'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7', paddingTop: TOP },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  h1: { fontSize: 26, fontWeight: '700', color: '#111827' },
  barTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  link: { fontSize: 17, fontWeight: '600', color: '#2563eb' },
  warn: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tagRow: { flexGrow: 0, flexShrink: 0 },
  tagContent: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  chipOn: { backgroundColor: '#2563eb' },
  chipText: { color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  list: { paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
  },
  grow: { flex: 1 },
  icon: { fontSize: 28, width: 48, textAlign: 'center' },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e5e7eb' },
  photo: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  muted: { color: '#6b7280', marginTop: 2 },
  tag: { color: '#2563eb', marginTop: 4 },
  action: { color: '#2563eb', fontWeight: '600', padding: 6 },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 48,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  pad: { padding: 16, paddingBottom: 100, gap: 12 },
  body: { fontSize: 16, lineHeight: 24, color: '#111827' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  area: { minHeight: 160, textAlignVertical: 'top' },
  error: { color: '#dc2626', fontWeight: '600' },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
});
