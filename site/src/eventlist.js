// A searchable list of all events currently loaded by the layers, shown over
// the globe. It reuses the events the layers already hold; nothing is fetched.

import { formatAge, formatTime } from './format.js';

// Ships and aircraft can add thousands of rows; more than this many rows make
// the list slow without helping anyone, so the user is asked to narrow it down.
export const MAX_ROWS = 500;

export function collectRows(layers) {
  return layers
    .filter((layer) => !layer.source.unavailable)
    .flatMap((layer) => layer.events.map((event) => ({ layer: layer.source, event })))
    .sort((a, b) => b.event.time - a.event.time);
}

export function filterRows(rows, { query = '', layerId = '' } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(({ layer, event }) => {
    if (layerId && layer.id !== layerId) return false;
    const text = `${event.title} ${event.detail} ${layer.label}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// "www.dwd.de" becomes "dwd.de": short enough for the table, and it tells the
// reader where the link leads.
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

export class EventList {
  constructor({ getLayers }) {
    this.getLayers = getLayers;
    this.view = document.getElementById('events-view');
    this.count = document.getElementById('events-count');
    this.search = document.getElementById('events-search');
    this.layerSelect = document.getElementById('events-layer');
    this.body = document.getElementById('events-body');
    this.note = document.getElementById('events-note');

    document.getElementById('show-events').addEventListener('click', () => this.open());
    document.getElementById('close-events').addEventListener('click', () => this.close());
    this.search.addEventListener('input', () => this.render());
    this.layerSelect.addEventListener('change', () => this.render());
    this.body.addEventListener('click', (domEvent) => this.openRowSource(domEvent));
    document.addEventListener('keydown', (domEvent) => {
      if (domEvent.key === 'Escape' && !this.view.hidden) this.close();
    });
  }

  get isOpen() {
    return !this.view.hidden;
  }

  // Opens the list; with a layer id it starts filtered to that layer and
  // with an empty search, so all events of the layer are visible.
  open(layerId) {
    this.view.hidden = false;
    if (layerId) {
      this.search.value = '';
      this.render();
      this.layerSelect.value = layerId;
    }
    this.render();
    this.search.focus();
  }

  close() {
    this.view.hidden = true;
    document.getElementById('show-events').focus();
  }

  // A click anywhere on a row opens its source, like the link in the last
  // column. Clicks on the link itself are left to the browser, and so is a
  // click that ends a text selection.
  openRowSource(domEvent) {
    if (domEvent.target.closest('a')) return;
    if (window.getSelection()?.toString()) return;
    const link = domEvent.target.closest('tr')?.querySelector('a[href]');
    if (link) window.open(link.href, '_blank', 'noopener');
  }

  // Called after layers refresh, so an open list does not go stale.
  refresh() {
    if (this.isOpen) this.render();
  }

  render() {
    const rows = collectRows(this.getLayers());
    this.renderLayerOptions(rows);
    const matches = filterRows(rows, { query: this.search.value, layerId: this.layerSelect.value });
    const shown = matches.slice(0, MAX_ROWS);
    const now = Date.now();

    this.body.replaceChildren(...shown.map(({ layer, event }) => this.renderRow(layer, event, now)));
    this.count.textContent = matches.length === rows.length
      ? `${rows.length.toLocaleString('en')}`
      : `${matches.length.toLocaleString('en')} of ${rows.length.toLocaleString('en')}`;
    this.note.hidden = matches.length <= MAX_ROWS;
    this.note.textContent = `Showing the newest ${MAX_ROWS} events. Search or pick a layer to see others.`;
  }

  // Options follow the order of the layer panel. Layers without data
  // (missing API key) are left out; empty layers stay, so opening the list
  // from such a layer shows that it has no events right now.
  renderLayerOptions(rows) {
    const selected = this.layerSelect.value;
    const available = this.getLayers().filter((layer) => !layer.source.unavailable);
    const counts = new Map(available.map((layer) => [layer.source, 0]));
    for (const { layer } of rows) counts.set(layer, counts.get(layer) + 1);
    const options = [...counts.entries()].map(([layer, count]) => {
      const option = document.createElement('option');
      option.value = layer.id;
      option.textContent = `${layer.label} (${count})`;
      return option;
    });
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All layers';
    this.layerSelect.replaceChildren(all, ...options);
    this.layerSelect.value = [...counts.keys()].some((layer) => layer.id === selected) ? selected : '';
  }

  // All text is set with textContent: titles and details come from external
  // APIs and must never be interpreted as HTML.
  renderRow(layer, event, now) {
    const row = document.createElement('tr');

    const time = document.createElement('td');
    time.className = 'time';
    time.textContent = formatAge(event.time, now);
    time.title = formatTime(event.time);

    const layerCell = document.createElement('td');
    layerCell.className = 'layer';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `#${(event.color ?? layer.color).toString(16).padStart(6, '0')}`;
    layerCell.append(swatch, document.createTextNode(layer.label));

    const eventCell = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = event.title;
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = event.detail;
    eventCell.append(title, detail);

    const linkCell = document.createElement('td');
    linkCell.className = 'link';
    if (event.url) {
      const link = document.createElement('a');
      link.href = event.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = event.url;
      // Narrow screens show the short label instead of the host (see styles.css).
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = linkLabel(event.url);
      const short = document.createElement('span');
      short.className = 'short';
      short.textContent = 'Open';
      link.append(host, short, ' →');
      linkCell.append(link);
    } else {
      linkCell.textContent = '–';
    }

    row.append(time, layerCell, eventCell, linkCell);
    return row;
  }
}
