// Board Export – Trello Power-Up
// List/label/member/due date filtering logic

/**
 * Filter cards based on the current UI selections.
 * A card is included if ALL of the following conditions are met:
 * 1. Card's list is among the selected lists.
 * 2. If archived is off: card.closed === false AND list.closed === false.
 * 3. If label filter is not empty: card has at least one of the selected labels (OR).
 * 4. If member filter is not empty: card has at least one of the selected members (OR).
 * 5. Due date filter matches.
 *
 * @param {Array} cards - All cards from the store
 * @param {Map} listsById - Map of list id -> list object
 * @param {Object} filters - Current filter state
 * @param {Set} filters.selectedListIds - Selected list IDs
 * @param {Set} filters.selectedLabelIds - Selected label IDs (empty = any)
 * @param {Set} filters.selectedMemberIds - Selected member IDs (empty = any)
 * @param {string} filters.dueFilter - 'any'|'has'|'none'|'overdue'|'7days'|'30days'|'complete'
 * @param {boolean} filters.includeArchived - Whether to include archived cards/lists
 * @returns {Array} Filtered and sorted cards
 */
export function filterCards(cards, listsById, filters) {
  const now = new Date();

  const filtered = cards.filter(card => {
    const list = listsById.get(card.idList);
    if (!list) return false;

    // 1. Card's list must be among selected lists
    if (!filters.selectedListIds.has(card.idList)) return false;

    // 2. Archived check
    if (!filters.includeArchived) {
      if (card.closed || list.closed) return false;
    }

    // 3. Label filter (OR logic, empty = any)
    if (filters.selectedLabelIds.size > 0) {
      const hasMatchingLabel = card.idLabels.some(id => filters.selectedLabelIds.has(id));
      if (!hasMatchingLabel) return false;
    }

    // 4. Member filter (OR logic, empty = anyone)
    if (filters.selectedMemberIds.size > 0) {
      const hasMatchingMember = card.idMembers.some(id => filters.selectedMemberIds.has(id));
      if (!hasMatchingMember) return false;
    }

    // 5. Due date filter
    if (!matchesDueFilter(card, filters.dueFilter, now)) return false;

    return true;
  });

  // Sort: by list pos first, then card pos within list
  filtered.sort((a, b) => {
    const listA = listsById.get(a.idList);
    const listB = listsById.get(b.idList);
    const listPosA = listA ? listA.pos : 0;
    const listPosB = listB ? listB.pos : 0;
    if (listPosA !== listPosB) return listPosA - listPosB;
    return a.pos - b.pos;
  });

  return filtered;
}

/**
 * Check if a card matches the due date filter.
 */
function matchesDueFilter(card, dueFilter, now) {
  switch (dueFilter) {
    case 'any':
      return true;

    case 'has':
      return !!card.due;

    case 'none':
      return !card.due;

    case 'overdue': {
      if (!card.due) return false;
      const dueDate = new Date(card.due);
      return dueDate < now && !card.dueComplete;
    }

    case '7days': {
      if (!card.due) return false;
      const dueDate = new Date(card.due);
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return dueDate >= now && dueDate <= in7Days;
    }

    case '30days': {
      if (!card.due) return false;
      const dueDate = new Date(card.due);
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return dueDate >= now && dueDate <= in30Days;
    }

    case 'complete':
      return card.dueComplete === true;

    default:
      return true;
  }
}

/**
 * Get unique lists that have at least one card in the filtered set.
 */
export function getActiveListIds(filteredCards) {
  const ids = new Set();
  filteredCards.forEach(card => ids.add(card.idList));
  return ids;
}
