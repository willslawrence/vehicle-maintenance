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
 * Receipts are stored in Google Drive (per-vehicle subfolder).
 * Drive links are written directly into column H ("Receipt") of each vehicle's log tab.
 * Multiple receipts per row are comma-separated.
 */

const SHEET_ID = '1_mIU0Ocxof2WalBQucHZj2SIhfGCtQZfzmZZvJStYV4';
const DRIVE_FOLDER_ID = '1oI0UsdCtg7IWZoLYcXqbvgBQT7JXQ65g';
const RECEIPT_COL = 8; // Column H

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'upload') return handleUpload(data);
    if (data.action === 'delete') return handleDelete(data);
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({ status: 'ok' });
}

function getVehicleFolder(vehicleName) {
  var parent = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var folders = parent.getFoldersByName(vehicleName);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(vehicleName);
}

function handleUpload(data) {
  // data: { action, vehicle, date, work, fileName, mimeType, base64 }
  var folder = getVehicleFolder(data.vehicle || 'Other');
  
  var blob = Utilities.newBlob(
    Utilities.base64Decode(data.base64),
    data.mimeType || 'image/jpeg',
    data.fileName || 'receipt.jpg'
  );
  
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  var fileUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
  var thumbUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=s200';
  
  // Find matching row in vehicle tab and write receipt link to column H
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(data.vehicle);
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    // Find header row
    var headerIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].some(function(c) { return String(c).indexOf('Work Performed') > -1; })) {
        headerIdx = i;
        break;
      }
    }
    
    // Ensure column H header exists
    if (headerIdx >= 0) {
      var hCell = sheet.getRange(headerIdx + 1, RECEIPT_COL);
      if (!hCell.getValue()) hCell.setValue('Receipt');
      
      // Find matching row by date + work (columns B=2, D=4)
      var searchDate = data.date || '';
      var searchWork = (data.work || '').substring(0, 40).trim().toLowerCase();
      
      for (var r = headerIdx + 1; r < rows.length; r++) {
        var rowDate = rows[r][1] || '';
        // Normalize date for comparison
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, 'UTC', 'yyyy-MM-dd');
        }
        var rowWork = String(rows[r][3] || '').substring(0, 40).trim().toLowerCase();
        
        // Match on date + work prefix
        if (String(rowDate).indexOf(String(searchDate).substring(0, 10)) > -1 && rowWork === searchWork) {
          var cell = sheet.getRange(r + 1, RECEIPT_COL);
          var existing = cell.getValue();
          if (existing) {
            cell.setValue(existing + ',' + fileUrl);
          } else {
            cell.setValue(fileUrl);
          }
          break;
        }
      }
    }
  }
  
  return jsonResponse({
    success: true,
    fileId: fileId,
    fileUrl: fileUrl,
    thumbUrl: thumbUrl
  });
}

function handleDelete(data) {
  // data: { action, fileId, vehicle }
  try { DriveApp.getFileById(data.fileId).setTrashed(true); } catch (e) {}
  
  // Remove link from Sheet
  var fileUrl = 'https://drive.google.com/file/d/' + data.fileId + '/view';
  if (data.vehicle) {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(data.vehicle);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var r = 0; r < rows.length; r++) {
        var val = String(rows[r][RECEIPT_COL - 1] || '');
        if (val.indexOf(fileUrl) > -1) {
          var links = val.split(',').filter(function(u) { return u.trim() !== fileUrl; });
          sheet.getRange(r + 1, RECEIPT_COL).setValue(links.join(','));
          break;
        }
      }
    }
  }
  
  return jsonResponse({ success: true });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
