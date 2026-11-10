// src/services/sheetsService.js
// Ghi thông tin lead + điểm AI vào Google Sheet

const { google } = require("googleapis");
const logger = require("../utils/logger");

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const headers = [
    "Timestamp",
    "Tên KH",
    "SĐT",
    "Email",
    "Nguồn lead",
    "Khu vực",
    "Nhu cầu",
    "Ưu tiên (Sales)",
    "Điểm AI",
    "Xếp loại AI",
    "Lý do AI",
    "Hành động đề xuất",
    "Process Instance ID",
  ];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
      logger.info("[Sheets] Header row đã được tạo cho Leads sheet");
    }
  } catch (err) {
    logger.warn("[Sheets] Không kiểm tra được header", { error: err.message });
  }
}

/**
 * Ghi lead + kết quả AI vào Google Sheet
 */
async function appendLeadResult(leadData, scoreResult, processInstanceId) {
  const spreadsheetId = process.env.LEADS_SHEET_ID;
  // const sheetName = process.env.LEADS_SHEET_NAME || "Bot2_L";
  const sheetName = "Bot2_Leads";

  try {
    const sheets = getSheetsClient();
    await ensureHeader(sheets, spreadsheetId, sheetName);

    const row = [
      new Date().toLocaleString("vi-VN"),
      leadData.leadName || "",
      leadData.leadPhone || "",
      leadData.leadEmail || "",
      leadData.leadSource || "",
      leadData.leadArea || "",
      leadData.leadNeed || "",
      leadData.leadPriority || "",
      scoreResult.score ?? "",
      scoreResult.grade || "",
      scoreResult.reasoning || "",
      scoreResult.suggestedAction || "",
      processInstanceId || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:M`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    logger.info("[Sheets] Đã ghi lead thành công", {
      leadName: leadData.leadName,
      grade: scoreResult.grade,
    });
  } catch (err) {
    logger.error("[Sheets] Lỗi ghi lead vào Sheet", { error: err.message });
  }
}

module.exports = { appendLeadResult };
