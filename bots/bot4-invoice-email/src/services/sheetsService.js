// src/services/sheetsService.js
// Ghi thông tin đơn hàng đã chốt vào Google Sheet

const { google } = require("googleapis");
const logger = require("../utils/logger");

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function appendOrderResult(
  orderData,
  invoiceNumber,
  emailStatus,
  processInstanceId,
) {
  const spreadsheetId = process.env.ORDERS_SHEET_ID;
  const sheetName = process.env.ORDERS_SHEET_NAME || "Bot4_Orders";
  const headers = [
    "Timestamp",
    "Số hóa đơn",
    "Tên KH",
    "Email KH",
    "Mã SP",
    "Số lượng",
    "Hình thức nhận",
    "Địa chỉ",
    "Trạng thái email",
    "Process Instance ID",
  ];

  try {
    const sheets = getSheetsClient();

    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:J1`,
    });
    if (!check.data.values || check.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }

    const row = [
      new Date().toLocaleString("vi-VN"),
      invoiceNumber,
      orderData.customerName || "",
      orderData.customerEmail || "",
      orderData.productCode || "",
      orderData.quantity || "",
      orderData.deliveryMethod || "",
      orderData.deliveryAddress || "",
      emailStatus,
      processInstanceId || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    logger.info("[Sheets] Đã ghi đơn hàng vào Sheet", { invoiceNumber });
  } catch (err) {
    logger.error("[Sheets] Lỗi ghi đơn hàng", { error: err.message });
  }
}

module.exports = { appendOrderResult };
