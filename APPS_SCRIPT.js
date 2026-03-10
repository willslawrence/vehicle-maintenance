const SHEET_ID = '1_mIU0Ocxof2WalBQucHZj2SIhfGCtQZfzmZZvJStYV4';
const DRIVE_FOLDER_ID = '1oI0UsdCtg7IWZoLYcXqbvgBQT7JXQ65g';
const RECEIPT_COL = 8;

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

  // Write receipt link to column H of the matching log row
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var sheet = ss.getSheetByName(data.vehicle);
  var matched = false;
  
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    var headerIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].some(function(c) { return String(c).indexOf('Work Performed') > -1; })) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx >= 0) {
      var hCell = sheet.getRange(headerIdx + 1, RECEIPT_COL);
      if (!hCell.getValue()) hCell.setValue('Receipt');

      var searchDate = String(data.date || '').substring(0, 10);
      var searchWork = (data.work || '').substring(0, 40).trim().toLowerCase();

      for (var r = headerIdx + 1; r < rows.length; r++) {
        var rowDate = rows[r][1];
        // Convert Date objects using spreadsheet timezone (not UTC)
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
        } else {
          rowDate = String(rowDate || '');
        }
        
        var rowWork = String(rows[r][3] || '').substring(0, 40).trim().toLowerCase();
        
        if (rowDate.indexOf(searchDate) > -1 && rowWork === searchWork) {
          var cell = sheet.getRange(r + 1, RECEIPT_COL);
          var existing = String(cell.getValue() || '');
          if (existing && existing.length > 0) {
            cell.setValue(existing + ',' + fileUrl);
          } else {
            cell.setValue(fileUrl);
          }
          matched = true;
          break;
        }
      }
    }
  }

  return jsonResponse({ success: true, fileId: fileId, fileUrl: fileUrl, thumbUrl: thumbUrl, matched: matched });
}

function handleDelete(data) {
  try { DriveApp.getFileById(data.fileId).setTrashed(true); } catch (e) {}
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
