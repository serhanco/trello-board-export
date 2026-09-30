// Board Export – Trello Power-Up
// Export modal UI controller (Phase 4: Filters + Live Preview)

import { APP_KEY, APP_NAME, APP_AUTHOR } from './config.js';
import { fetchBoardData, getStore, loadCommentsIfNecessary } from './api.js';
import { COLUMNS } from './columns.js';
import { filterCards, getActiveListIds } from './filters.js';
import { generateExcel } from './excel.js';

/* global TrelloPowerUp */

const t = TrelloPowerUp.iframe({
  appKey: APP_KEY,
  appName: APP_NAME,
  appAuthor: APP_AUTHOR,
});

// DOM Elements
const screens = {
  auth: document.getElementById('auth-screen'),
  loading: document.getElementById('loading-screen'),
  error: document.getElementById('error-screen'),
  main: document.getElementById('main-screen'),
};

const btnAuthorize = document.getElementById('btn-authorize');
const btnRetry = document.getElementById('btn-retry');
const errorMessage = document.getElementById('error-message');

const containers = {
  lists: document.getElementById('lists-container'),
  labels: document.getElementById('labels-container'),
  members: document.getElementById('members-container'),
  columns: document.getElementById('columns-container'),
};

const toggleArchived = document.getElementById('include-archived');
const dueSelect = document.getElementById('due-select');
const previewTitle = document.getElementById('preview-title');
const previewContainer = document.getElementById('preview-container');
const btnDownload = document.getElementById('btn-download');

// Trello Colors to HEX map
const colorMap = {
  green: '#4BCE97', green_light: '#BAF3DB', green_dark: '#216E4E',
  yellow: '#F5CD47', yellow_light: '#F8E6A0', yellow_dark: '#7F5F01',
  orange: '#FEA362', orange_light: '#FFC5A2', orange_dark: '#A54800',
  red: '#F87168', red_light: '#FFD5D2', red_dark: '#AE2A19',
  purple: '#9F8FEF', purple_light: '#DFD8FD', purple_dark: '#5E4DB2',
  blue: '#579DFF', blue_light: '#CCE0FF', blue_dark: '#0C66E4',
  sky: '#6CC3E0', sky_light: '#C6EDFB', sky_dark: '#206A83',
  lime: '#94C748', lime_light: '#D3F1A7', lime_dark: '#4C6B1F',
  pink: '#E774BB', pink_light: '#FDD0EC', pink_dark: '#943D73',
  black: '#8590A2', black_light: '#DFE1E6', black_dark: '#091E42',
};
const defaultColor = '#DFE1E6';

// State
let globalStore = null;
let debounceTimer = null;

// ─── Helpers ───

function showScreen(screenName) {
  Object.values(screens).forEach(s => (s.style.display = 'none'));
  if (screens[screenName]) {
    screens[screenName].style.display = 'block';
  }
  t.sizeTo('#app').catch(() => {});
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Read Current Filter State from DOM ───

function readFilters() {
  const selectedListIds = new Set();
  containers.lists.querySelectorAll('input:checked').forEach(cb => selectedListIds.add(cb.value));

  const selectedLabelIds = new Set();
  containers.labels.querySelectorAll('input:checked').forEach(cb => selectedLabelIds.add(cb.value));

  const selectedMemberIds = new Set();
  containers.members.querySelectorAll('input:checked').forEach(cb => selectedMemberIds.add(cb.value));

  return {
    selectedListIds,
    selectedLabelIds,
    selectedMemberIds,
    dueFilter: dueSelect.value,
    includeArchived: toggleArchived.checked,
  };
}

function readSelectedColumns() {
  const selected = [];
  containers.columns.querySelectorAll('input:checked').forEach(cb => {
    const col = COLUMNS.find(c => c.key === cb.value);
    if (col) selected.push(col);
  });
  return selected;
}

// ─── Preview Rendering ───

function renderPreview() {
  const store = getStore();
  if (!store) return;

  const filters = readFilters();
  const selectedCols = readSelectedColumns();
  const filteredCards = filterCards(store.cards, store.listsById, filters);
  const activeListIds = getActiveListIds(filteredCards);

  // Update title
  previewTitle.textContent = `Preview · ${filteredCards.length} cards in ${activeListIds.size} lists`;

  // Validation states
  if (selectedCols.length === 0) {
    previewContainer.innerHTML = '<p class="preview-empty">Select at least one column.</p>';
    btnDownload.disabled = true;
    return;
  }

  if (filteredCards.length === 0) {
    previewContainer.innerHTML = '<p class="preview-empty">No cards match the current filters.</p>';
    btnDownload.disabled = true;
    return;
  }

  btnDownload.disabled = false;

  // Build table
  const maxPreview = 6;
  const previewCards = filteredCards.slice(0, maxPreview);
  const remaining = filteredCards.length - previewCards.length;

  let html = '<table class="preview-table"><thead><tr>';
  selectedCols.forEach(col => {
    html += `<th>${escapeHtml(col.header)}</th>`;
  });
  html += '</tr></thead><tbody>';

  previewCards.forEach(card => {
    html += '<tr>';
    selectedCols.forEach(col => {
      let value = col.getter(card, store);
      // Truncate long text for preview
      if (value && value.length > 120) {
        value = value.substring(0, 120) + '…';
      }
      // Handle link column specially
      if (col.key === 'link' && value) {
        html += `<td><a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></td>`;
      } else {
        html += `<td>${escapeHtml(value)}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';

  if (remaining > 0) {
    html += `<p class="preview-more">…and ${remaining} more cards.</p>`;
  }

  previewContainer.innerHTML = html;
  t.sizeTo('#app').catch(() => {});
}

// Debounced preview update (150ms)
function schedulePreviewUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderPreview, 150);
}

// ─── UI Rendering (Phase 3) ───

function renderUI() {
  const store = getStore();

  // Render Lists
  containers.lists.innerHTML = '';
  const sortedLists = Array.from(store.listsById.values()).sort((a, b) => a.pos - b.pos);
  sortedLists.forEach(list => {
    const label = document.createElement('label');
    label.className = 'checkbox-item list-checkbox';
    if (list.closed && !toggleArchived.checked) {
      label.style.display = 'none';
    }
    const checkedStr = !list.closed ? 'checked' : '';
    const archivedTag = list.closed ? '<span class="archived-tag">(archived)</span>' : '';
    label.innerHTML = `
      <input type="checkbox" value="${list.id}" class="filter-list" ${checkedStr}>
      <span class="label-text" title="${escapeHtml(list.name)}">${escapeHtml(list.name)}</span>
      ${archivedTag}
    `;
    containers.lists.appendChild(label);
  });

  // Render Labels
  containers.labels.innerHTML = '';
  Array.from(store.labelsById.values()).forEach(labelItem => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    const hex = colorMap[labelItem.color] || defaultColor;
    const nameStr = labelItem.name || (labelItem.color ? labelItem.color.replace(/_/g, ' ') : 'No name');
    label.innerHTML = `
      <input type="checkbox" value="${labelItem.id}" class="filter-label">
      <span class="label-dot" style="background-color: ${hex};"></span>
      <span class="label-text" title="${escapeHtml(nameStr)}">${escapeHtml(nameStr)}</span>
    `;
    containers.labels.appendChild(label);
  });

  // Render Members
  containers.members.innerHTML = '';
  Array.from(store.membersById.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .forEach(member => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      label.innerHTML = `
        <input type="checkbox" value="${member.id}" class="filter-member">
        <span class="label-text" title="${escapeHtml(member.fullName)} (@${escapeHtml(member.username)})">${escapeHtml(member.fullName)}</span>
      `;
      containers.members.appendChild(label);
    });

  // Render Columns
  containers.columns.innerHTML = '';
  COLUMNS.forEach(col => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    const checkedStr = col.default ? 'checked' : '';
    label.innerHTML = `
      <input type="checkbox" value="${col.key}" class="filter-column" ${checkedStr}>
      <span class="label-text" title="${col.header}">${col.header}</span>
    `;
    containers.columns.appendChild(label);
  });

  setupUIEvents();
  renderPreview();
}

// ─── UI Events ───

function setupUIEvents() {
  // Archived toggle
  toggleArchived.addEventListener('change', () => {
    const showArchived = toggleArchived.checked;
    const store = getStore();
    containers.lists.querySelectorAll('.list-checkbox').forEach(item => {
      const checkbox = item.querySelector('input');
      const listData = store.listsById.get(checkbox.value);
      if (listData && listData.closed) {
        item.style.display = showArchived ? 'flex' : 'none';
        if (!showArchived) checkbox.checked = false;
      }
    });
    schedulePreviewUpdate();
  });

  // Due date change
  dueSelect.addEventListener('change', schedulePreviewUpdate);

  // Bulk helpers
  const setCheckboxes = (container, selector, state) => {
    container.querySelectorAll(selector).forEach(cb => {
      if (state && cb.closest('.checkbox-item').style.display !== 'none') {
        cb.checked = true;
      } else if (!state) {
        cb.checked = false;
      }
    });
    schedulePreviewUpdate();
  };

  document.getElementById('lists-all').addEventListener('click', e => { e.preventDefault(); setCheckboxes(containers.lists, 'input[type="checkbox"]', true); });
  document.getElementById('lists-none').addEventListener('click', e => { e.preventDefault(); setCheckboxes(containers.lists, 'input[type="checkbox"]', false); });

  document.getElementById('cols-default').addEventListener('click', e => {
    e.preventDefault();
    containers.columns.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const colDef = COLUMNS.find(c => c.key === cb.value);
      cb.checked = colDef ? colDef.default : false;
    });
    schedulePreviewUpdate();
  });
  document.getElementById('cols-all').addEventListener('click', e => { e.preventDefault(); setCheckboxes(containers.columns, 'input[type="checkbox"]', true); });

  // Listen to ALL checkbox changes and select changes inside #main-screen for live preview
  document.getElementById('main-screen').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') {
      // If 'comments' column is being checked, lazy-load comments
      if (e.target.classList.contains('filter-column') && e.target.value === 'comments' && e.target.checked) {
        loadCommentsIfNecessary(t).then(() => schedulePreviewUpdate());
        return;
      }
      schedulePreviewUpdate();
    }
  });
}

// ─── Data Loading ───

async function loadData() {
  showScreen('loading');
  try {
    globalStore = await fetchBoardData(t);
    renderUI();
    showScreen('main');
  } catch (error) {
    console.error('[Board Export] Error loading data:', error);
    if (error.message === 'UNAUTHORIZED') {
      showScreen('auth');
    } else {
      errorMessage.textContent = 'Failed to load board data. Please try again.';
      showScreen('error');
    }
  }
}

async function checkAuthAndLoad() {
  const restApi = t.getRestApi();
  const isAuth = await restApi.isAuthorized();
  if (isAuth) {
    await loadData();
  } else {
    showScreen('auth');
  }
}

// ─── Event Listeners ───

btnAuthorize.addEventListener('click', async () => {
  const restApi = t.getRestApi();
  try {
    await restApi.authorize({ scope: 'read', expiration: 'never' });
    await loadData();
  } catch (err) {
    console.warn('[Board Export] User cancelled authorization or it failed.');
  }
});

btnRetry.addEventListener('click', () => checkAuthAndLoad());

btnDownload.addEventListener('click', async () => {
  const originalText = btnDownload.textContent;
  btnDownload.disabled = true;
  btnDownload.textContent = 'Generating…';
  
  try {
    const store = getStore();
    const filters = readFilters();
    const selectedCols = readSelectedColumns();
    const options = {
      sheetPerList: document.getElementById('sheet-per-list').checked,
      sheetChecklistItems: document.getElementById('sheet-checklist-items').checked
    };
    
    await generateExcel(store, filters, selectedCols, options);
  } catch (err) {
    console.error('[Board Export] Error generating Excel:', err);
    alert('An error occurred while generating the Excel file. Please try again.');
  } finally {
    // Re-evaluate if it should be enabled based on preview state
    const filteredCards = filterCards(getStore().cards, getStore().listsById, readFilters());
    btnDownload.disabled = (filteredCards.length === 0 || readSelectedColumns().length === 0);
    btnDownload.textContent = originalText;
  }
});

// ─── Initialization ───

t.render(function () {
  if (!globalStore && screens.loading.style.display === 'none' && screens.auth.style.display === 'none' && screens.error.style.display === 'none') {
    checkAuthAndLoad();
  } else {
    t.sizeTo('#app').catch(() => {});
  }
});

// Export for Phase 5 (excel.js will need these)
export { readFilters, readSelectedColumns, t };
