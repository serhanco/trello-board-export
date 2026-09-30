// Board Export – Trello Power-Up
// Column definitions: key, header, default state, width, getter function
// Implementation: Phase 4 (Getters will be added in Phase 4)

export const COLUMNS = [
  { key: 'list', header: 'List', default: false },
  { key: 'card', header: 'Card', default: true },
  { key: 'description', header: 'Description', default: true },
  { key: 'labels', header: 'Labels', default: false },
  { key: 'members', header: 'Members', default: false },
  { key: 'start', header: 'Start date', default: false },
  { key: 'due', header: 'Due date', default: false },
  { key: 'dueComplete', header: 'Due complete', default: false },
  { key: 'status', header: 'Status', default: false },
  { key: 'checklistProgress', header: 'Checklist progress', default: false },
  { key: 'checklistItems', header: 'Checklist items', default: false },
  { key: 'comments', header: 'Comments', default: false },
  { key: 'attachments', header: 'Attachments', default: false },
  { key: 'lastActivity', header: 'Last activity', default: true },
  { key: 'link', header: 'Link', default: true },
  { key: 'cardId', header: 'Card ID', default: false },
];
