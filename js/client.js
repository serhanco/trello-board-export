// Board Export – Trello Power-Up
// Power-Up connector: initializes board-button capability

import { APP_KEY, APP_NAME, APP_AUTHOR } from './config.js';

/* global TrelloPowerUp */

TrelloPowerUp.initialize(
  {
    'board-buttons': function (t) {
      return [
        {
          icon: {
            dark: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/img/icon.svg'),
            light: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/img/icon.svg'),
          },
          text: 'Export to Excel',
          callback: function (t) {
            return t.modal({
              url: './export.html',
              title: 'Board Export',
              fullscreen: false,
              height: 780,
            });
          },
        },
      ];
    },
  },
  {
    appKey: APP_KEY,
    appName: APP_NAME,
    appAuthor: APP_AUTHOR,
  }
);
