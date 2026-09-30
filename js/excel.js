// Board Export – Trello Power-Up
// ExcelJS workbook generation (Phase 5)

import { filterCards } from './filters.js';

/* global ExcelJS */

/**
 * Validates and ensures the sheet name complies with Excel rules.
 * - Removes \ / ? * [ ] :
 * - Removes leading/trailing single quotes
 * - Max 31 chars
 * - Must be unique (case-insensitive)
 *
 * @param {string} name - Raw sheet name
 * @param {Set} existingNamesLower - Set of existing lowercased names
 * @returns {string} Valid, unique sheet name
 */
function getValidSheetName(name, existingNamesLower) {
  let cleanName = name.replace(/[\\/?*[\]:]/g, '');
  cleanName = cleanName.replace(/^'+|'+$/g, '');
  cleanName = cleanName.trim();
  
  if (!cleanName) cleanName = 'Sheet';
  if (cleanName.length > 31) cleanName = cleanName.substring(0, 31).trim();
  
  let finalName = cleanName;
  let counter = 2;
  
  while (existingNamesLower.has(finalName.toLowerCase())) {
    const suffix = ` (${counter})`;
    const allowedLength = 31 - suffix.length;
    finalName = cleanName.substring(0, allowedLength).trim() + suffix;
    counter++;
  }
  
  existingNamesLower.add(finalName.toLowerCase());
  return finalName;
}

/**
 * Sanitizes cell value to prevent Excel formula injection
 * and truncates it to Excel's 32,767 character limit.
 */
function sanitizeCell(value) {
  if (value == null) return '';
  let str = String(value);
  
  // Prevent formula injection
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str; // Prefix with single quote so Excel treats it as text
  }
  
  // Truncate if exceeds Excel limit
  const limit = 32000;
  if (str.length > limit) {
    str = str.substring(0, limit) + ' …[truncated]';
  }
  
  return str;
}

/**
 * Applies standard formatting to a worksheet.
 */
function formatWorksheet(worksheet, columns) {
  // Set header row formatting
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0C66E4' } // Trello blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    
    // Set column width based on definition
    const colDef = columns[colNumber - 1];
    if (colDef && colDef.width) {
      worksheet.getColumn(colNumber).width = colDef.width;
    }
  });
  
  // Freeze top row and enable auto filter
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };
}

/**
 * Generates and downloads the Excel file.
 */
export async function generateExcel(store, filters, selectedCols, options) {
  const filteredCards = filterCards(store.cards, store.listsById, filters);
  if (filteredCards.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Board Export Power-Up';
  workbook.created = new Date();
  
  const existingSheetNames = new Set();
  
  const sheetPerList = options.sheetPerList;
  const includeChecklistSheet = options.sheetChecklistItems;
  
  // ─── Main Data Sheets ───
  
  if (sheetPerList) {
    // Group cards by list, but maintain list order (pos)
    const listsMap = new Map();
    filteredCards.forEach(card => {
      if (!listsMap.has(card.idList)) {
        listsMap.set(card.idList, []);
      }
      listsMap.get(card.idList).push(card);
    });
    
    // Get sorted lists that have cards
    const sortedLists = Array.from(store.listsById.values())
      .filter(list => listsMap.has(list.id))
      .sort((a, b) => a.pos - b.pos);
      
    sortedLists.forEach(list => {
      const sheetName = getValidSheetName(list.name, existingSheetNames);
      const worksheet = workbook.addWorksheet(sheetName);
      const listCards = listsMap.get(list.id);
      populateSheet(worksheet, listCards, selectedCols, store);
    });
    
  } else {
    // Single sheet for all cards
    const sheetName = getValidSheetName('Cards', existingSheetNames);
    const worksheet = workbook.addWorksheet(sheetName);
    populateSheet(worksheet, filteredCards, selectedCols, store);
  }
  
  // ─── Checklist Items Sheet ───
  
  if (includeChecklistSheet) {
    const clSheetName = getValidSheetName('Checklist Items', existingSheetNames);
    const clWorksheet = workbook.addWorksheet(clSheetName);
    
    const clCols = [
      { header: 'List', key: 'list', width: 25 },
      { header: 'Card', key: 'card', width: 40 },
      { header: 'Checklist', key: 'checklist', width: 30 },
      { header: 'Item', key: 'item', width: 50 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Item due date', key: 'due', width: 18 },
      { header: 'Assigned to', key: 'assigned', width: 25 },
      { header: 'Card link', key: 'link', width: 32 }
    ];
    
    clWorksheet.columns = clCols.map(c => ({ header: c.header, key: c.key }));
    
    filteredCards.forEach(card => {
      const checklists = store.checklistsByCard.get(card.id) || [];
      const list = store.listsById.get(card.idList);
      const listName = list ? list.name : '';
      
      checklists.sort((a, b) => a.pos - b.pos).forEach(cl => {
        const items = cl.checkItems || [];
        items.sort((a, b) => a.pos - b.pos).forEach(item => {
          
          let memberName = '';
          if (item.idMember) {
            const member = store.membersById.get(item.idMember);
            if (member) memberName = member.fullName;
          }
          
          let dueDate = '';
          if (item.due) dueDate = new Date(item.due);
          
          const rowData = {
            list: sanitizeCell(listName),
            card: sanitizeCell(card.name),
            checklist: sanitizeCell(cl.name),
            item: sanitizeCell(item.name),
            state: item.state === 'complete' ? 'Complete' : 'Incomplete',
            due: dueDate,
            assigned: sanitizeCell(memberName),
            link: card.shortUrl ? { text: card.shortUrl, hyperlink: card.shortUrl } : ''
          };
          
          const row = clWorksheet.addRow(rowData);
          formatDataRow(row, clCols);
        });
      });
    });
    
    formatWorksheet(clWorksheet, clCols);
  }
  
  // ─── Export File ───
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  
  // Format filename
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  let safeBoardName = store.board.name.replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeBoardName}_export_${dateStr}.xlsx`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Populates a worksheet with cards data.
 */
function populateSheet(worksheet, cards, selectedCols, store) {
  // Set headers
  worksheet.columns = selectedCols.map(c => ({
    header: c.header,
    key: c.key
  }));
  
  cards.forEach(card => {
    const rowObj = {};
    
    selectedCols.forEach(col => {
      const rawValue = col.getter(card, store);
      
      // Handle Date formats
      if (['start', 'due', 'lastActivity'].includes(col.key) && rawValue) {
        // rawValue from getter is a formatted string, we want the actual Date object for Excel
        let d = null;
        if (col.key === 'start' && card.start) d = new Date(card.start);
        if (col.key === 'due' && card.due) d = new Date(card.due);
        if (col.key === 'lastActivity' && card.dateLastActivity) d = new Date(card.dateLastActivity);
        
        rowObj[col.key] = d || '';
      } 
      // Handle Links
      else if (col.key === 'link' && rawValue) {
        rowObj[col.key] = { text: rawValue, hyperlink: rawValue };
      } 
      else {
        rowObj[col.key] = sanitizeCell(rawValue);
      }
    });
    
    const row = worksheet.addRow(rowObj);
    formatDataRow(row, selectedCols);
  });
  
  formatWorksheet(worksheet, selectedCols);
}

/**
 * Applies formatting to a data row (wrap text, alignment, number formats).
 */
function formatDataRow(row, cols) {
  row.eachCell((cell, colNumber) => {
    const colDef = cols[colNumber - 1];
    
    cell.alignment = { vertical: 'top' };
    
    if (colDef) {
      // Enable text wrap for multiline columns
      if (['description', 'comments', 'checklistItems', 'attachments', 'item'].includes(colDef.key)) {
        cell.alignment.wrapText = true;
      }
      
      // Format Dates
      if (['start', 'due', 'lastActivity'].includes(colDef.key)) {
        cell.numFmt = colDef.key === 'start' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm';
      }
      
      // Format Links
      if (colDef.key === 'link' && cell.value) {
        cell.font = { color: { argb: 'FF0C66E4' }, underline: true };
      }
    }
  });
}
