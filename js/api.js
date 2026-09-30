// Board Export – Trello Power-Up
// Trello REST API calls: auth, data fetching, pagination, rate limiting

import { APP_KEY } from './config.js';

// Global state for normalized data
const store = {
  board: null,
  listsById: new Map(),
  labelsById: new Map(),
  membersById: new Map(),
  checklistsByCard: new Map(), // cardId -> array of checklists
  commentsByCard: new Map(),   // cardId -> array of comments
  cards: [], // Array of all cards
  commentsLoaded: false
};

// Retry helper for 429 Too Many Requests
async function fetchWithRetry(url, token, options = {}, retries = 3) {
  const delays = [1000, 2000, 4000];
  
  for (let i = 0; i <= retries; i++) {
    try {
      const separator = url.includes('?') ? '&' : '?';
      const fullUrl = `${url}${separator}key=${APP_KEY}&token=${token}`;
      
      const response = await fetch(fullUrl, options);
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 429 && i < retries) {
        console.warn(`[Board Export] Rate limited. Retrying in ${delays[i]}ms...`);
        await new Promise(resolve => setTimeout(resolve, delays[i]));
        continue;
      }
      
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (i === retries || error.message === 'UNAUTHORIZED') {
        throw error;
      }
      // If network error, retry
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
}

// Concurrency limiter for Promise.all
async function withConcurrencyLimit(limit, tasks) {
  const results = [];
  const executing = [];
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    
    if (limit <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  
  return Promise.all(results);
}

// Fetch all cards with pagination
async function fetchAllCards(boardId, token) {
  let allCards = [];
  let before = null;
  let hasMore = true;
  
  while (hasMore) {
    let url = `https://api.trello.com/1/boards/${boardId}/cards/all?limit=1000&fields=name,desc,idList,idLabels,idMembers,start,due,dueComplete,closed,dateLastActivity,shortUrl,url,shortLink,idShort,pos&attachments=true&attachment_fields=name,url,date`;
    if (before) {
      url += `&before=${before}`;
    }
    
    const cards = await fetchWithRetry(url, token);
    allCards = allCards.concat(cards);
    
    if (cards.length === 1000) {
      // API returns cards sorted by id descending, so the last one is the oldest
      before = cards[cards.length - 1].id;
    } else {
      hasMore = false;
    }
  }
  
  return allCards;
}

// Fetch comments (actions) with pagination
async function fetchAllComments(boardId, token) {
  let allComments = [];
  let before = null;
  let hasMore = true;
  
  while (hasMore) {
    let url = `https://api.trello.com/1/boards/${boardId}/actions?filter=commentCard&limit=1000&fields=data,date,idMemberCreator&memberCreator_fields=fullName`;
    if (before) {
      url += `&before=${before}`;
    }
    
    const actions = await fetchWithRetry(url, token);
    allComments = allComments.concat(actions);
    
    if (actions.length === 1000) {
      before = actions[actions.length - 1].id;
    } else {
      hasMore = false;
    }
  }
  
  return allComments;
}

export async function fetchBoardData(t) {
  const restApi = t.getRestApi();
  const token = await restApi.getToken();
  const boardContext = await t.board('id');
  const boardId = boardContext.id;
  
  // Fetch initial data concurrently (limit 5)
  const fetchTasks = [
    () => fetchWithRetry(`https://api.trello.com/1/boards/${boardId}?fields=name,url&labels=all&label_fields=name,color&members=all&member_fields=fullName,username`, token),
    () => fetchWithRetry(`https://api.trello.com/1/boards/${boardId}/lists?filter=all&fields=name,closed,pos`, token),
    () => fetchAllCards(boardId, token),
    () => fetchWithRetry(`https://api.trello.com/1/boards/${boardId}/checklists?checkItems=all&checkItem_fields=name,state,pos,due,idMember&fields=name,idCard,pos`, token)
  ];
  
  const [boardData, lists, cards, checklists] = await withConcurrencyLimit(5, fetchTasks);
  
  // Normalize Data
  store.board = { id: boardData.id, name: boardData.name, url: boardData.url };
  
  store.labelsById.clear();
  boardData.labels.forEach(label => store.labelsById.set(label.id, label));
  
  store.membersById.clear();
  boardData.members.forEach(member => store.membersById.set(member.id, member));
  
  store.listsById.clear();
  lists.forEach(list => store.listsById.set(list.id, list));
  
  store.cards = cards;
  
  store.checklistsByCard.clear();
  checklists.forEach(cl => {
    if (!store.checklistsByCard.has(cl.idCard)) {
      store.checklistsByCard.set(cl.idCard, []);
    }
    store.checklistsByCard.get(cl.idCard).push(cl);
  });
  
  console.log(`[Board Export] Data loaded: ${lists.length} lists, ${cards.length} cards, ${checklists.length} checklists.`);
  
  return store;
}

export async function loadCommentsIfNecessary(t) {
  if (store.commentsLoaded) return store.commentsByCard;
  
  const restApi = t.getRestApi();
  const token = await restApi.getToken();
  
  const comments = await fetchAllComments(store.board.id, token);
  
  store.commentsByCard.clear();
  comments.forEach(comment => {
    const cardId = comment.data.card.id;
    if (!store.commentsByCard.has(cardId)) {
      store.commentsByCard.set(cardId, []);
    }
    store.commentsByCard.get(cardId).push(comment);
  });
  
  store.commentsLoaded = true;
  console.log(`[Board Export] Comments loaded: ${comments.length} comments.`);
  
  return store.commentsByCard;
}

export function getStore() {
  return store;
}
