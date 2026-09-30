// Board Export – Trello Power-Up
// Export modal UI controller (Phase 2 & 3: Auth, Data fetching, and UI Rendering)

import { APP_KEY, APP_NAME, APP_AUTHOR } from './config.js';
import { fetchBoardData, getStore } from './api.js';
import { COLUMNS } from './columns.js';

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
  columns: document.getElementById('columns-container')
};

const toggleArchived = document.getElementById('include-archived');

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
  black: '#8590A2', black_light: '#DFE1E6', black_dark: '#091E42'
};
const defaultColor = '#DFE1E6';

// State
let globalStore = null;

// Helpers
function showScreen(screenName) {
  Object.values(screens).forEach(s => {
    s.style.display = 'none';
  });
  if (screens[screenName]) {
    screens[screenName].style.display = 'block';
  }
  t.sizeTo('#app').catch(() => {});
}

// Phase 3 UI Rendering
function renderUI() {
  const store = getStore();
  
  // Render Lists
  containers.lists.innerHTML = '';
  const sortedLists = Array.from(store.listsById.values()).sort((a, b) => a.pos - b.pos);
  sortedLists.forEach(list => {
    const label = document.createElement('label');
    label.className = 'checkbox-item list-checkbox';
    // Hide archived lists by default
    if (list.closed && !toggleArchived.checked) {
      label.style.display = 'none';
    }
    // Default to selected if it is open
    const checkedStr = !list.closed ? 'checked' : '';
    const archivedTag = list.closed ? '<span class="archived-tag">(archived)</span>' : '';
    
    label.innerHTML = `
      <input type="checkbox" value="${list.id}" class="filter-list" ${checkedStr}>
      <span class="label-text" title="${list.name}">${list.name}</span>
      ${archivedTag}
    `;
    containers.lists.appendChild(label);
  });

  // Render Labels
  containers.labels.innerHTML = '';
  const sortedLabels = Array.from(store.labelsById.values()); // Order as returned by API
  sortedLabels.forEach(labelItem => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    
    const hex = colorMap[labelItem.color] || defaultColor;
    const nameStr = labelItem.name || (labelItem.color ? labelItem.color.replace(/_/g, ' ') : 'No name');
    
    label.innerHTML = `
      <input type="checkbox" value="${labelItem.id}" class="filter-label">
      <span class="label-dot" style="background-color: ${hex};"></span>
      <span class="label-text" title="${nameStr}">${nameStr}</span>
    `;
    containers.labels.appendChild(label);
  });

  // Render Members
  containers.members.innerHTML = '';
  const sortedMembers = Array.from(store.membersById.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  sortedMembers.forEach(member => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    
    label.innerHTML = `
      <input type="checkbox" value="${member.id}" class="filter-member">
      <span class="label-text" title="${member.fullName} (@${member.username})">${member.fullName}</span>
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
}

function setupUIEvents() {
  // Archived Toggle
  toggleArchived.addEventListener('change', (e) => {
    const showArchived = e.target.checked;
    const listItems = containers.lists.querySelectorAll('.list-checkbox');
    const store = getStore();
    
    listItems.forEach(item => {
      const checkbox = item.querySelector('input');
      const listData = store.listsById.get(checkbox.value);
      if (listData && listData.closed) {
        item.style.display = showArchived ? 'flex' : 'none';
        if (!showArchived) checkbox.checked = false; // uncheck if hidden
      }
    });
    // Triggers Phase 4 Preview update later
  });

  // Helper for bulk checking
  const setCheckboxes = (containerId, selector, state) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const checkboxes = container.querySelectorAll(selector);
    checkboxes.forEach(cb => {
      // Only check visible ones
      if (state && cb.closest('.checkbox-item').style.display !== 'none') {
         cb.checked = true;
      } else if (!state) {
         cb.checked = false;
      }
    });
  };

  document.getElementById('lists-all').addEventListener('click', (e) => { e.preventDefault(); setCheckboxes('lists-container', 'input[type="checkbox"]', true); });
  document.getElementById('lists-none').addEventListener('click', (e) => { e.preventDefault(); setCheckboxes('lists-container', 'input[type="checkbox"]', false); });
  
  document.getElementById('cols-default').addEventListener('click', (e) => { 
    e.preventDefault(); 
    const checkboxes = containers.columns.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      const colDef = COLUMNS.find(c => c.key === cb.value);
      cb.checked = colDef ? colDef.default : false;
    });
  });
  
  document.getElementById('cols-all').addEventListener('click', (e) => { e.preventDefault(); setCheckboxes('columns-container', 'input[type="checkbox"]', true); });
}

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

// Event Listeners
btnAuthorize.addEventListener('click', async () => {
  const restApi = t.getRestApi();
  try {
    await restApi.authorize({ scope: 'read', expiration: 'never' });
    await loadData();
  } catch (err) {
    console.warn('[Board Export] User cancelled authorization or it failed.');
  }
});

btnRetry.addEventListener('click', () => {
  checkAuthAndLoad();
});

// Initialization
t.render(function () {
  if (!globalStore && screens.loading.style.display === 'none' && screens.auth.style.display === 'none' && screens.error.style.display === 'none') {
    checkAuthAndLoad();
  } else {
      t.sizeTo('#app').catch(() => {});
  }
});

