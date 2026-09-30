// Board Export – Trello Power-Up
// Export modal UI controller (Phase 2: Auth and Data fetching)

import { APP_KEY, APP_NAME, APP_AUTHOR } from './config.js';
import { fetchBoardData } from './api.js';

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
  // Tell Trello to resize the iframe whenever the DOM changes
  t.sizeTo('#app').catch(() => {});
}

async function loadData() {
  showScreen('loading');
  try {
    globalStore = await fetchBoardData(t);
    showScreen('main');
    // Phase 3 and 4 will initialize the UI here
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
    // Trello requires authorize to be called in response to a user action
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
  // We don't want to reload data on every render cycle unless needed
  if (!globalStore && screens.loading.style.display === 'none' && screens.auth.style.display === 'none' && screens.error.style.display === 'none') {
    checkAuthAndLoad();
  } else {
      t.sizeTo('#app').catch(() => {});
  }
});
