// Collapsible layer panel. The title and the event list link stay visible
// when collapsed, so the list remains reachable; everything else folds away.
// Narrow screens start collapsed, wide screens expanded, unless the user
// has chosen otherwise before.

const STORAGE_KEY = 'world-info.panelCollapsed';
const NARROW_QUERY = '(max-width: 720px)';

export function initialCollapsed(stored, narrow) {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return narrow;
}

export function setUpPanel() {
  const panel = document.getElementById('panel');
  const toggle = document.getElementById('panel-toggle');
  const body = document.getElementById('panel-body');

  const apply = (collapsed) => {
    panel.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Expand panel' : 'Collapse panel';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    // Folded content must not be reachable with Tab or screen readers.
    body.inert = collapsed;
  };

  apply(initialCollapsed(readStored(), window.matchMedia(NARROW_QUERY).matches));

  toggle.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('collapsed');
    apply(collapsed);
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* storage may be unavailable */ }
  });
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
