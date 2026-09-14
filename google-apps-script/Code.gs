const SPREADSHEET_ID = "1HNqlt-Z1h6B28MpglXbUleJhnoh-n2Mi0PptJuTjvBY";
const SHEET_NAME = "CSDL";
const DRIVE_FOLDER_ID = "";
const DRIVE_FOLDER_NAME = "VKU_Survey_Photos";
const MAX_PAYLOAD_CHARS = 5500000;
const MAX_TEXT_LENGTH = 1500;
const MAX_SESSION_ID_LENGTH = 80;
const SHARE_PHOTOS_ANYONE_WITH_LINK = false;

const HEADERS = [
  "Timestamp (server)",
  "Session ID",
  "Tên phiên khảo sát",
  "Người phỏng vấn",
  "Thời gian (thiết bị)",
  "Vĩ độ",
  "Kinh độ",
  "Bản đồ (link)",
  "Ảnh hiện trường (link)",
  "Tên sinh viên",
  "Lớp / Khoa",
  "Năm học",
  "Đang làm thêm",
  "Nhu cầu tìm việc",
  "Ngành mong muốn",
  "Mức lương mong muốn",
  "Kỹ năng còn thiếu",
  "Đề xuất hỗ trợ",
  "Ghi chú"
];

function doGet() {
  return jsonResponse_({
    result: "ok",
    message: "VKU Survey endpoint is alive",
    service: "VKU Field Survey",
    version: "2.0"
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || typeof e.postData.contents !== "string") {
      throw new Error("Request POST không có body hợp lệ.");
    }
    if (e.postData.contents.length > MAX_PAYLOAD_CHARS) {
      throw new Error("Dữ liệu gửi lên vượt giới hạn cho phép.");
    }

    const payload = parsePayload_(e.postData.contents);
    validatePayload_(payload);

    if (!isValidSpreadsheetId_()) {
      throw new Error("Chưa cấu hình SPREADSHEET_ID.");
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getSheet_(spreadsheet);
    ensureHeaders_(sheet);

    lock.waitLock(25000);
    try {
      const existingRow = findSessionRow_(sheet, payload.sessionId);
      if (existingRow > 0) {
        return jsonResponse_({
          result: "ok",
          message: "Phiên khảo sát đã tồn tại",
          sessionId: payload.sessionId,
          duplicate: true
        });
      }

      const photoUrl = savePhoto_(payload.photoBase64, payload.sessionId);
      const mapUrl = buildMapsUrl_(payload.latitude, payload.longitude);
      const row = [
        new Date(),
        payload.sessionId,
        payload.sessionName,
        payload.interviewerName,
        payload.sessionTime,
        payload.latitude,
        payload.longitude,
        mapUrl,
        photoUrl,
        payload.studentName,
        payload.studentClass,
        payload.studentYear,
        payload.q_working,
        payload.q_needJob,
        payload.q_industry,
        payload.q_salary,
        payload.q_skillGap,
        payload.q_support,
        payload.q_note
      ];

      sheet.appendRow(row);
      SpreadsheetApp.flush();

      return jsonResponse_({
        result: "ok",
        message: "Đã ghi dữ liệu vào Google Sheets",
        sessionId: payload.sessionId,
        duplicate: false
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("VKU Survey doPost error:", error && error.message ? error.message : error);
    return jsonResponse_({
      result: "error",
      message: sanitizeErrorMessage_(error),
    });
  }
}

function testConfiguration() {
  if (!isValidSpreadsheetId_()) {
    throw new Error("Hãy điền SPREADSHEET_ID trước khi chạy testConfiguration().");
  }
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheet_(spreadsheet);
  ensureHeaders_(sheet);

  const folder = getDriveFolder_();
  return {
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn(),
    driveFolderName: folder.getName(),
    driveFolderId: folder.getId()
  };
}

function setupSheet() {
  if (!isValidSpreadsheetId_()) throw new Error("Chưa cấu hình SPREADSHEET_ID.");
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheet_(spreadsheet);
  ensureHeaders_(sheet);
  return `Sheet ${SHEET_NAME} đã sẵn sàng.`;
}

function setupDriveFolder() {
  const folder = getDriveFolder_();
  return `Folder sẵn sàng: ${folder.getName()} (${folder.getId()})`;
}

function parsePayload_(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON phải là một object.");
    }
    return parsed;
  } catch (error) {
    throw new Error("Dữ liệu JSON không hợp lệ.");
  }
}

function validatePayload_(payload) {
  const required = [
    "sessionId",
    "sessionName",
    "interviewerName",
    "sessionTime",
    "latitude",
    "longitude",
    "studentName",
    "studentClass",
    "studentYear",
    "q_working",
    "q_needJob",
    "q_industry",
    "q_salary",
    "photoBase64"
  ];
  required.forEach(function(key) {
    if (!clean_(payload[key])) throw new Error(`Thiếu trường bắt buộc: ${key}`);
  });

  const sessionId = clean_(payload.sessionId);
  if (sessionId.length > MAX_SESSION_ID_LENGTH) throw new Error("sessionId quá dài.");
  if (!/^S-[A-Z0-9-]+$/i.test(sessionId)) throw new Error("sessionId không đúng định dạng.");

  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Vĩ độ không hợp lệ.");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Kinh độ không hợp lệ.");

  const textFields = [
    "sessionName", "interviewerName", "sessionTime", "studentName", "studentClass",
    "studentYear", "q_working", "q_needJob", "q_industry", "q_salary",
    "q_skillGap", "q_support", "q_note"
  ];
  textFields.forEach(function(key) {
    if (clean_(payload[key]).length > MAX_TEXT_LENGTH) {
      throw new Error(`Trường ${key} vượt quá giới hạn ký tự.`);
    }
  });

  if (clean_(payload.photoBase64).length > MAX_PAYLOAD_CHARS) {
    throw new Error("Ảnh hoặc payload quá lớn.");
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(clean_(payload.photoBase64))) {
    throw new Error("Ảnh phải là data URL JPEG, PNG hoặc WebP.");
  }
}

function getSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const width = Math.max(lastColumn, HEADERS.length);
  const existing = sheet.getRange(1, 1, 1, width).getValues()[0].slice(0, HEADERS.length);
  const nonEmpty = existing.some(function(value) { return clean_(value) !== ""; });

  if (!nonEmpty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  for (let i = 0; i < HEADERS.length; i++) {
    if (clean_(existing[i]) !== HEADERS[i]) {
      throw new Error(`Header sheet không khớp tại cột ${i + 1}: phải là "${HEADERS[i]}". Dữ liệu cũ không bị ghi đè.`);
    }
  }
}

function findSessionRow_(sheet, sessionId) {
  if (sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(sessionId)
    .matchEntireCell(true)
    .useRegularExpression(false);
  const match = finder.findNext();
  return match ? match.getRow() : 0;
}

function getDriveFolder_() {
  if (clean_(DRIVE_FOLDER_ID)) {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  }
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function savePhoto_(dataUrl, sessionId) {
  const cleanDataUrl = clean_(dataUrl);
  const parts = cleanDataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!parts) throw new Error("Dữ liệu ảnh không hợp lệ.");

  const folder = getDriveFolder_();
  const existingFiles = folder.getFilesByName(`${sessionId}.jpg`);
  if (existingFiles.hasNext()) {
    const existing = existingFiles.next();
    return existing.getUrl();
  }

  const mime = parts[1].toLowerCase() === "webp" ? "image/webp" : (parts[1].toLowerCase() === "png" ? "image/png" : "image/jpeg");
  let bytes;
  try {
    bytes = Utilities.base64Decode(parts[2]);
  } catch (error) {
    throw new Error("Không thể giải mã ảnh Base64.");
  }
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Ảnh sau nén vẫn quá lớn.");

  const extension = mime === "image/png" ? "png" : (mime === "image/webp" ? "webp" : "jpg");
  const fileName = `${sessionId}.${extension}`;
  const file = folder.createFile(Utilities.newBlob(bytes, mime, fileName));

  if (SHARE_PHOTOS_ANYONE_WITH_LINK) {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      throw new Error("Không thể cấp quyền xem ảnh Drive theo cấu hình ANYONE_WITH_LINK.");
    }
  }

  return file.getUrl();
}

function buildMapsUrl_(latitude, longitude) {
  return `https://www.google.com/maps?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
}

function isValidSpreadsheetId_() {
  return /^[-\w]{20,}$/.test(clean_(SPREADSHEET_ID));
}

function sanitizeErrorMessage_(error) {
  const message = clean_(error && error.message ? error.message : error);
  if (!message) return "Lỗi server không xác định.";
  if (message.length > 260) return `${message.slice(0, 257)}...`;
  return message;
}

function clean_(value) {
  return String(value == null ? "" : value).trim();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
