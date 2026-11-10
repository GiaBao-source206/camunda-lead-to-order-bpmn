// src/services/sheetsService.js
// Ghi kết quả chiến dịch vào Google Sheet

const { google } = require("googleapis");
const logger = require("../utils/logger");

/**
 * Khởi tạo Google Sheets client từ Service Account
 */
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Đảm bảo header row tồn tại trong sheet
 */
async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const headers = [
    "Timestamp",
    "Tên chiến dịch",
    "Kênh",
    "Sản phẩm",
    "Nội dung CTKM",
    "Số email gửi",
    "Số email thành công",
    "Số email lỗi",
    "Trạng thái tổng",
    "Ghi chú",
    "Process Instance ID",
  ];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:K1`,
    });

    // Nếu row 1 chưa có data → ghi header
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
      logger.info("[Sheets] Header row đã được tạo");
    }
  } catch (err) {
    logger.warn("[Sheets] Không thể kiểm tra header, bỏ qua", {
      error: err.message,
    });
  }
}

/**
 * Append một row kết quả vào Google Sheet
 * @param {Object} data - Dữ liệu cần ghi
 */
async function appendCampaignResult(data) {
  const spreadsheetId = process.env.CAMPAIGN_SHEET_ID;
  const sheetName = process.env.CAMPAIGN_SHEET_NAME || "Bot1_Campaigns";

  try {
    const sheets = getSheetsClient();
    await ensureHeader(sheets, spreadsheetId, sheetName);

    const row = [
      new Date().toLocaleString("vi-VN"),
      data.campaignName || "",
      data.channel || "",
      data.productName || "",
      data.promoContent || "",
      data.totalSent ?? 0,
      data.successCount ?? 0,
      data.errorCount ?? 0,
      data.overallStatus || "UNKNOWN",
      data.note || "",
      data.processInstanceId || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:K`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    logger.info("[Sheets] Đã ghi kết quả chiến dịch thành công", {
      campaignName: data.campaignName,
      sheetName,
    });
  } catch (err) {
    // Không throw — lỗi Sheet không nên dừng cả flow
    logger.error("[Sheets] Lỗi khi ghi Google Sheet", { error: err.message });
  }
}

module.exports = { appendCampaignResult };
