import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Read the real production script: no copied implementation or browser dependency.
const sourceUrl = ['../site/theme.js', '../public/theme.js'].map(relative => new URL(relative, import.meta.url)).find(existsSync);
const source = readFileSync(sourceUrl, 'utf8');
const KEY = 'fotobox-theme';

class EventTargetFake {
  listeners = new Map();

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  emit(type, event = {}) {
    const payload = { target: this, ...event, type };
    for (const callback of this.listeners.get(type) ?? []) callback(payload);
  }
}

class ElementFake extends EventTargetFake {
  dataset = {};
  attributes = new Map();
  parentNode = null;

  constructor(document) {
    super();
    this.document = document;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { this.document.activeElement = this; }

  contains(target) {
    for (let current = target; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  querySelector(selector) {
    assert.equal(selector, 'summary', 'Unexpected element selector in production script');
    return this.summary;
  }
}

function boot({ dark = false, saved = null, failures = {}, invalidButton = false } = {}) {
  const document = new EventTargetFake();
  document.readyState = 'loading';
  document.documentElement = new ElementFake(document);
  document.activeElement = null;

  const window = new EventTargetFake();
  const media = new EventTargetFake();
  media.matches = dark;

  const values = new Map();
  if (saved !== null) values.set(KEY, saved);
  const storageCalls = [];
  const localStorage = {
    getItem(key) {
      storageCalls.push(['get', key]);
      if (failures.get) throw new Error('Storage access denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      storageCalls.push(['set', key, value]);
      if (failures.set) throw new Error('Quota exceeded');
      values.set(key, String(value));
    },
    removeItem(key) {
      storageCalls.push(['remove', key]);
      if (failures.remove) throw new Error('Storage access denied');
      values.delete(key);
    },
  };

  // Mimic the deployed synchronous head script: meta exists before body controls.
  const metas = [new ElementFake(document)];
  const sources = Array.from({ length: 3 }, () => new ElementFake(document));
  sources.forEach(element => { element.media = '(prefers-color-scheme: dark)'; });
  const pickers = Array.from({ length: 2 }, () => {
    const picker = new ElementFake(document);
    picker.open = false;
    picker.summary = new ElementFake(document);
    picker.summary.parentNode = picker;
    picker.buttons = ['system', 'light', 'dark'].map(mode => {
      const button = new ElementFake(document);
      button.parentNode = picker;
      button.dataset.themeMode = mode;
      return button;
    });
    return picker;
  });
  if (invalidButton) {
    const button = new ElementFake(document);
    button.parentNode = pickers[0];
    button.dataset.themeMode = 'sepia';
    pickers[0].buttons.push(button);
  }

  let bodyMounted = false;
  let readyFired = false;
  const observers = [];
  class MutationObserverFake {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      this.disconnectCalls = 0;
      this.callbackCalls = 0;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = { ...options };
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
      this.disconnectCalls += 1;
    }
    deliver(records) {
      if (!this.connected) return;
      this.callbackCalls += 1;
      this.callback(records, this);
    }
  }
  document.querySelectorAll = selector => {
    switch (selector) {
      case 'meta[name="theme-color"]': return metas;
      case '[data-theme-source]': return bodyMounted ? sources : [];
      case '[data-theme-mode]': return bodyMounted ? pickers.flatMap(picker => picker.buttons) : [];
      case '.theme-picker summary': return bodyMounted ? pickers.map(picker => picker.summary) : [];
      case '.theme-picker': return bodyMounted ? pickers : [];
      case '.theme-picker[open]': return bodyMounted ? pickers.filter(picker => picker.open) : [];
      default: throw new Error(`Unexpected document selector in production script: ${selector}`);
    }
  };

  const context = {
    document,
    window,
    localStorage,
    MutationObserver: MutationObserverFake,
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return media;
    },
  };
  if (failures.access) {
    Object.defineProperty(context, 'localStorage', {
      get() { throw new Error('Storage security policy denied property access'); },
    });
  }
  runInNewContext(source, context, { filename: sourceUrl.pathname, timeout: 1000 });

  return {
    document, window, media, pickers, sources, metas, values, storageCalls, observers,
    root: document.documentElement,
    ready() {
      assert.equal(readyFired, false, 'DOMContentLoaded must only fire once');
      readyFired = true;
      bodyMounted = true;
      document.readyState = 'interactive';
      document.emit('DOMContentLoaded');
      document.readyState = 'complete';
    },
    parseBody() {
      bodyMounted = true;
      observers.forEach(observer => observer.deliver([
        { type: 'childList', target: document.documentElement, addedNodes: sources },
      ]));
    },
    click(mode, pickerIndex = 0) {
      const button = pickers[pickerIndex].buttons.find(item => item.dataset.themeMode === mode);
      assert.ok(button, `Fixture has no ${mode} button`);
      button.emit('click');
      document.emit('click', { target: button });
    },
    systemChange(nextDark) {
      media.matches = nextDark;
      media.emit('change', { matches: nextDark });
    },
    externalStorage(newValue, key = KEY) {
      // The other tab has already committed the mutation when storage fires.
      if (key === null) values.clear();
      else if (newValue === null) values.delete(key);
      else values.set(key, newValue);
      window.emit('storage', { key, newValue, storageArea: localStorage });
    },
  };
}

function assertAppearance(page, preference, effective) {
  assert.equal(page.root.dataset.themePreference, preference);
  assert.equal(page.root.dataset.theme, effective);
  const label = { system: 'Systemeinstellung', light: 'Hell', dark: 'Dunkel' }[preference];
  for (const picker of page.pickers) {
    for (const button of picker.buttons) {
      assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.themeMode === preference));
    }
    assert.equal(picker.summary.getAttribute('aria-label'), `Darstellung: ${label}. Farbschema ändern`);
    assert.equal(picker.summary.title, `Darstellung: ${label}`);
  }
  for (const imageSource of page.sources) {
    assert.equal(imageSource.media, effective === 'dark' ? 'all' : 'not all');
  }
  for (const meta of page.metas) {
    assert.equal(meta.content, effective === 'dark' ? '#11100f' : '#f7f1e8');
  }
}

for (const dark of [false, true]) {
  test(`default follows ${dark ? 'dark' : 'light'} system before and after body parsing`, () => {
    const page = boot({ dark });
    const effective = dark ? 'dark' : 'light';
    assert.equal(page.root.dataset.theme, effective, 'Apply theme in head before body exists');
    assert.equal(page.root.dataset.themePreference, 'system');
    assert.equal(page.metas[0].content, dark ? '#11100f' : '#f7f1e8');
    page.ready();
    assertAppearance(page, 'system', effective);
    assert.deepEqual(page.storageCalls, [['get', KEY]], 'Initialization must not force a manual preference');
  });
}

for (const saved of ['light', 'dark', 'system']) {
  for (const dark of [false, true]) {
    test(`restores ${saved} with ${dark ? 'dark' : 'light'} system`, () => {
      const page = boot({ dark, saved });
      page.ready();
      assertAppearance(page, saved, saved === 'system' ? (dark ? 'dark' : 'light') : saved);
      assert.deepEqual(page.storageCalls, [['get', KEY]]);
    });
  }
}

for (const mode of ['light', 'dark']) {
  test(`manual ${mode} updates controls, pictures, browser color and persisted preference`, () => {
    const page = boot({ dark: mode === 'light' });
    page.ready();
    page.pickers.forEach(picker => { picker.open = true; });
    page.click(mode, 1);
    assertAppearance(page, mode, mode);
    assert.equal(page.values.get(KEY), mode);
    assert.deepEqual(page.storageCalls, [['get', KEY], ['set', KEY, mode]]);
    assert.ok(page.pickers.every(picker => !picker.open));

    const reloaded = boot({ dark: mode === 'light', saved: page.values.get(KEY) });
    reloaded.ready();
    assertAppearance(reloaded, mode, mode);
  });
}

test('System choice removes override and uses the current OS preference immediately', () => {
  const page = boot({ saved: 'dark', dark: true });
  page.ready();
  page.systemChange(false);
  assertAppearance(page, 'dark', 'dark');
  page.click('system');
  assertAppearance(page, 'system', 'light');
  assert.equal(page.values.has(KEY), false);
  assert.deepEqual(page.storageCalls, [['get', KEY], ['remove', KEY]]);
  page.systemChange(true);
  assertAppearance(page, 'system', 'dark');
});

test('System preference reacts to both OS transitions without persisting a manual value', () => {
  const page = boot();
  page.ready();
  page.systemChange(true);
  assertAppearance(page, 'system', 'dark');
  page.systemChange(false);
  assertAppearance(page, 'system', 'light');
  assert.deepEqual(page.storageCalls, [['get', KEY]]);
});

for (const mode of ['light', 'dark']) {
  test(`OS changes preserve manual ${mode} override`, () => {
    const page = boot({ saved: mode });
    page.ready();
    page.systemChange(true);
    assertAppearance(page, mode, mode);
    page.systemChange(false);
    assertAppearance(page, mode, mode);
  });
}

for (const saved of ['', 'sepia', 'DARK', ' light ', 'null', '{"theme":"dark"}']) {
  test(`invalid saved value ${JSON.stringify(saved)} falls back to live system preference`, () => {
    const page = boot({ saved, dark: true });
    page.ready();
    assertAppearance(page, 'system', 'dark');
    page.systemChange(false);
    assertAppearance(page, 'system', 'light');
    assert.deepEqual(page.storageCalls, [['get', KEY]], 'A read must not rewrite unrelated/corrupt storage');
  });
}

test('blocked storage reads fall back to System without losing the controls', () => {
  const page = boot({ saved: 'light', dark: true, failures: { get: true } });
  page.ready();
  assertAppearance(page, 'system', 'dark');
  page.click('light');
  assertAppearance(page, 'light', 'light');
});

test('quota failure does not prevent manual selection or its OS override', () => {
  const page = boot({ dark: true, failures: { set: true } });
  page.ready();
  page.click('light');
  assertAppearance(page, 'light', 'light');
  assert.equal(page.values.has(KEY), false, 'Failed writes cannot promise persistence after reload');
  page.systemChange(false);
  page.systemChange(true);
  assertAppearance(page, 'light', 'light');
});

test('failed removeItem still returns this page to System and listens for OS changes', () => {
  const page = boot({ saved: 'dark', failures: { remove: true } });
  page.ready();
  page.click('system');
  assertAppearance(page, 'system', 'light');
  assert.equal(page.values.get(KEY), 'dark', 'Storage failure leaves the old stored preference intact');
  page.systemChange(true);
  assertAppearance(page, 'system', 'dark');
});

test('all storage operations may fail without preventing local theme choices', () => {
  const page = boot({ failures: { get: true, set: true, remove: true } });
  page.ready();
  page.click('dark');
  assertAppearance(page, 'dark', 'dark');
  page.click('light');
  assertAppearance(page, 'light', 'light');
  page.click('system');
  assertAppearance(page, 'system', 'light');
});

test('security exception when accessing localStorage itself does not break theme controls', () => {
  const page = boot({ dark: true, failures: { access: true } });
  page.ready();
  assertAppearance(page, 'system', 'dark');
  page.click('light');
  assertAppearance(page, 'light', 'light');
  page.click('system');
  assertAppearance(page, 'system', 'dark');
});

test('unknown button values cannot persist or apply an unsupported theme', () => {
  const page = boot({ saved: 'dark', invalidButton: true });
  page.ready();
  page.click('sepia');
  assertAppearance(page, 'dark', 'dark');
  assert.deepEqual(page.storageCalls, [['get', KEY]]);
});

test('another tab can set either explicit theme without generating a storage write loop', () => {
  const page = boot({ dark: true });
  page.ready();
  page.externalStorage('light');
  assertAppearance(page, 'light', 'light');
  page.externalStorage('dark');
  assertAppearance(page, 'dark', 'dark');
  assert.deepEqual(page.storageCalls, [['get', KEY]]);
});

for (const value of [null, 'system', 'invalid']) {
  test(`external storage value ${JSON.stringify(value)} restores System mode`, () => {
    const page = boot({ saved: 'light', dark: true });
    page.ready();
    page.externalStorage(value);
    assertAppearance(page, 'system', 'dark');
    page.systemChange(false);
    assertAppearance(page, 'system', 'light');
  });
}

test('localStorage.clear in another tab restores System; unrelated keys do not change preference', () => {
  const page = boot({ saved: 'dark' });
  page.ready();
  page.externalStorage('light', 'another-setting');
  assertAppearance(page, 'dark', 'dark');
  page.externalStorage(null, null);
  assertAppearance(page, 'system', 'light');
});

test('OS and cross-tab changes before DOMContentLoaded apply to controls when parsed', () => {
  const page = boot();
  page.systemChange(true);
  page.externalStorage('light');
  assert.equal(page.root.dataset.theme, 'light');
  page.ready();
  assertAppearance(page, 'light', 'light');
});

for (const mode of ['light', 'dark']) {
  test(`parser mutations apply saved ${mode} to new picture sources before DOMContentLoaded`, () => {
    const page = boot({ saved: mode, dark: mode === 'light' });
    assert.ok(page.observers.some(observer => observer.connected));
    page.parseBody();
    assert.equal(page.document.readyState, 'loading');
    assertAppearance(page, mode, mode);
    page.ready();
    assertAppearance(page, mode, mode);
  });
}

test('parser observer watches insertions without watching its own attribute writes, then disconnects', () => {
  const page = boot({ saved: 'dark' });
  assert.equal(page.observers.length, 1);
  const observer = page.observers[0];
  assert.equal(observer.target, page.root);
  assert.equal(observer.options.childList, true);
  assert.equal(observer.options.subtree, true);
  assert.notEqual(observer.options.attributes, true, 'Attribute observation could cause apply() feedback');
  page.parseBody();
  assert.equal(observer.callbackCalls, 1);
  page.ready();
  assert.equal(observer.connected, false);
  assert.equal(observer.disconnectCalls, 1);
  page.parseBody();
  assert.equal(observer.callbackCalls, 1, 'No observer callbacks after DOMContentLoaded');
});

test('click outside closes open menus; an inside click keeps that menu open', () => {
  const page = boot();
  page.ready();
  page.pickers.forEach(picker => { picker.open = true; });
  page.document.emit('click', { target: page.pickers[0].summary });
  assert.equal(page.pickers[0].open, true);
  assert.equal(page.pickers[1].open, false);
  page.document.emit('click', { target: new ElementFake(page.document) });
  assert.equal(page.pickers[0].open, false);
});

test('Escape closes the open menu and returns focus to its summary', () => {
  const page = boot();
  page.ready();
  page.pickers[0].open = true;
  page.document.emit('keydown', { key: 'Enter' });
  assert.equal(page.pickers[0].open, true);
  page.document.emit('keydown', { key: 'Escape' });
  assert.equal(page.pickers[0].open, false);
  assert.equal(page.document.activeElement, page.pickers[0].summary);
});
