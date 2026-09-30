// Board Export – Trello Power-Up
// Column definitions: key, header, default state, width, getter function

// Trello Colors to HEX map (used for label display)
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

/**
 * Format a date for preview display (local timezone).
 * @param {string} dateStr - ISO date string
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
function formatDate(dateStr, includeTime = true) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (!includeTime) return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * Column definitions array.
 * Each column has: key, header, default (selected by default), width (Excel), getter function.
 * The getter receives (card, store) and returns a string for preview display.
 */
export const COLUMNS = [
  {
    key: 'list',
    header: 'List',
    default: false,
    width: 25,
    getter: (card, store) => {
      const list = store.listsById.get(card.idList);
      if (!list) return '';
      return list.closed ? `${list.name} (archived)` : list.name;
    }
  },
  {
    key: 'card',
    header: 'Card',
    default: true,
    width: 40,
    getter: (card) => card.name || ''
  },
  {
    key: 'description',
    header: 'Description',
    default: true,
    width: 60,
    getter: (card) => card.desc || ''
  },
  {
    key: 'labels',
    header: 'Labels',
    default: false,
    width: 25,
    getter: (card, store) => {
      return card.idLabels
        .map(id => {
          const label = store.labelsById.get(id);
          if (!label) return '';
          return label.name || (label.color ? label.color.replace(/_/g, ' ') : '');
        })
        .filter(Boolean)
        .join(', ');
    }
  },
  {
    key: 'members',
    header: 'Members',
    default: false,
    width: 25,
    getter: (card, store) => {
      return card.idMembers
        .map(id => {
          const member = store.membersById.get(id);
          return member ? member.fullName : '';
        })
        .filter(Boolean)
        .join(', ');
    }
  },
  {
    key: 'start',
    header: 'Start date',
    default: false,
    width: 18,
    getter: (card) => formatDate(card.start, false)
  },
  {
    key: 'due',
    header: 'Due date',
    default: false,
    width: 18,
    getter: (card) => formatDate(card.due, true)
  },
  {
    key: 'dueComplete',
    header: 'Due complete',
    default: false,
    width: 15,
    getter: (card) => {
      if (!card.due) return '';
      return card.dueComplete ? 'Yes' : 'No';
    }
  },
  {
    key: 'status',
    header: 'Status',
    default: false,
    width: 15,
    getter: (card, store) => {
      const list = store.listsById.get(card.idList);
      if (card.closed || (list && list.closed)) return 'Archived';
      return 'Active';
    }
  },
  {
    key: 'checklistProgress',
    header: 'Checklist progress',
    default: false,
    width: 15,
    getter: (card, store) => {
      const checklists = store.checklistsByCard.get(card.id);
      if (!checklists || checklists.length === 0) return '';
      let total = 0;
      let complete = 0;
      checklists.forEach(cl => {
        if (cl.checkItems) {
          total += cl.checkItems.length;
          complete += cl.checkItems.filter(item => item.state === 'complete').length;
        }
      });
      return total > 0 ? `${complete}/${total}` : '';
    }
  },
  {
    key: 'checklistItems',
    header: 'Checklist items',
    default: false,
    width: 50,
    getter: (card, store) => {
      const checklists = store.checklistsByCard.get(card.id);
      if (!checklists || checklists.length === 0) return '';
      const lines = [];
      const sorted = [...checklists].sort((a, b) => a.pos - b.pos);
      sorted.forEach(cl => {
        if (sorted.length > 1) {
          lines.push(`${cl.name}:`);
        }
        const items = [...(cl.checkItems || [])].sort((a, b) => a.pos - b.pos);
        items.forEach(item => {
          const icon = item.state === 'complete' ? '☑' : '☐';
          lines.push(`${icon} ${item.name}`);
        });
      });
      return lines.join('\n');
    }
  },
  {
    key: 'comments',
    header: 'Comments',
    default: false,
    width: 60,
    getter: (card, store) => {
      const comments = store.commentsByCard.get(card.id);
      if (!comments || comments.length === 0) return '';
      // Sort newest first
      const sorted = [...comments].sort((a, b) => new Date(b.date) - new Date(a.date));
      return sorted
        .map(c => {
          const date = formatDate(c.date, true);
          const author = c.memberCreator ? c.memberCreator.fullName : 'Unknown';
          const text = c.data && c.data.text ? c.data.text : '';
          return `${date} – ${author}: ${text}`;
        })
        .join('\n');
    }
  },
  {
    key: 'attachments',
    header: 'Attachments',
    default: false,
    width: 50,
    getter: (card) => {
      if (!card.attachments || card.attachments.length === 0) return '';
      return card.attachments
        .map(att => `${att.name} – ${att.url}`)
        .join('\n');
    }
  },
  {
    key: 'lastActivity',
    header: 'Last activity',
    default: true,
    width: 18,
    getter: (card) => formatDate(card.dateLastActivity, true)
  },
  {
    key: 'link',
    header: 'Link',
    default: true,
    width: 32,
    getter: (card) => card.shortUrl || ''
  },
  {
    key: 'cardId',
    header: 'Card ID',
    default: false,
    width: 28,
    getter: (card) => card.id || ''
  },
];
