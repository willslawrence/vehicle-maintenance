/**
 * Vehicle Maintenance — Receipt Upload Handler
 * 
 * Deploy as Google Apps Script Web App:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file
 * 3. Click Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL → paste into index.html APPS_SCRIPT_URL
 *
 * Handles:
 *   POST /upload — saves image to Drive folder, logs to Receipts tab
 *   GET /receipts — returns all receipts from the Receipts tab
 */

const SHEET_ID = '1_mIU0Ocxof2WalBQucHZj2SIhfGCtQZfzmZZvJStYV4';
const DRIVE_FOLDER_ID = '1oI0UsdCtg7IWZoLYcXqbvgBQT7JXQ65g';
const RECEIPTS_TAB = 'Receipts';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'upload') {
      return handleUpload(data);
    }
    if (data.action === 'delete') {
      return handleDelete(data);
    }
    
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'receipts';
    if (action === 'receipts') {
      return handleGetReceipts();
    }
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function handleUpload(data) {
  // data: { action, vehicle, date, work, fileName, mimeType, base64 }
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  
  // Decode base64 → blob
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.base64),
    data.mimeType || 'image/jpeg',
    data.fileName || 'receipt.jpg'
  );
  
  // Save to Drive
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
  const thumbUrl = `https://lh3.googleusercontent.com/d/${fileId}=s200`;
  
  // Log to Receipts tab
  const sheet = getOrCreateReceiptsTab();
  sheet.appendRow([
    data.vehicle || '',
    data.date || '',
    data.work || '',
    fileId,
    fileUrl,
    thumbUrl,
    data.fileName || 'receipt.jpg',
    new Date().toISOString()
  ]);
  
  return jsonResponse({
    success: true,
    fileId: fileId,
    fileUrl: fileUrl,
    thumbUrl: thumbUrl
  });
}

function handleDelete(data) {
  // data: { action, fileId }
  const sheet = getOrCreateReceiptsTab();
  const rows = sheet.getDataRange().getValues();
  
  // Find and delete row (fileId is column D, index 3)
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][3] === data.fileId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  
  // Delete from Drive
  try {
    DriveApp.getFileById(data.fileId).setTrashed(true);
  } catch (e) { /* file may already be gone */ }
  
  return jsonResponse({ success: true });
}

function handleGetReceipts() {
  const sheet = getOrCreateReceiptsTab();
  const rows = sheet.getDataRange().getValues();
  const receipts = [];
  
  for (let i = 1; i < rows.length; i++) {
    receipts.push({
      vehicle: rows[i][0],
      date: rows[i][1],
      work: rows[i][2],
      fileId: rows[i][3],
      fileUrl: rows[i][4],
      thumbUrl: rows[i][5],
      fileName: rows[i][6],
      uploadedAt: rows[i][7]
    });
  }
  
  return jsonResponse({ receipts: receipts });
}

function getOrCreateReceiptsTab() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(RECEIPTS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(RECEIPTS_TAB);
    sheet.appendRow(['Vehicle', 'Date', 'Work', 'FileId', 'FileUrl', 'ThumbUrl', 'FileName', 'UploadedAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
