// src/index.js
// Bot 4 — Tạo hóa đơn PDF và gửi email xác nhận
// Camunda External Task Worker: topic = "invoice-email"

require("dotenv").config();
const { Client, Variables } = require("camunda-external-task-client-js");
const { v4: uuidv4 } = require("uuid");
const logger = require("./utils/logger");
const { generateInvoicePdf } = require("./services/pdfService");
const { sendConfirmationEmail } = require("./services/confirmEmailService");
const { appendOrderResult } = require("./services/sheetsService");

const fs = require("fs");
const path = require("path");
const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// ============================================================
// CAMUNDA CLIENT
// ============================================================
const client = new Client({
  baseUrl: process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest",
  workerId: process.env.WORKER_ID || "bot4-invoice-email-worker",
  maxTasks: 3, // PDF generation tốn tài nguyên → giới hạn thấp
  lockDuration: 120000, // 2 phút — Puppeteer + email có thể mất thời gian
  asyncResponseTimeout: 10000,
});

// ============================================================
// HANDLER CHÍNH
// ============================================================
client.subscribe("invoice-email", async ({ task, taskService }) => {
  const processInstanceId = task.processInstanceId;
  const taskId = task.id;

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("[Bot4] 🚀 Nhận task tạo hóa đơn & gửi email", {
    taskId,
    processInstanceId,
  });

  // --- 1. Đọc dữ liệu đơn hàng từ Camunda ---
  const orderData = {
    customerName: task.variables.get("customerName") || "",
    customerEmail: task.variables.get("customerEmail") || "",
    productCode: task.variables.get("productCode") || "",
    productName:
      task.variables.get("productName") ||
      task.variables.get("productCode") ||
      "",
    quantity: task.variables.get("quantity") || 1,
    unitPrice: task.variables.get("unitPrice") || 0, // Sales có thể set từ UserTask
    deliveryMethod: task.variables.get("deliveryMethod") || "delivery",
    deliveryAddress: task.variables.get("deliveryAddress") || "",
  };

  logger.info("[Bot4] Thông tin đơn hàng", orderData);

  // --- 2. Tạo số hóa đơn ---
  // Format: INV-YYYYMMDD-XXXX (ngắn, dễ đọc)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = uuidv4().slice(0, 6).toUpperCase();
  const invoiceNumber = `INV-${dateStr}-${shortId}`;

  logger.info(`[Bot4] Số hóa đơn: ${invoiceNumber}`);

  // --- 3. Tạo PDF hóa đơn ---
  let pdfPath = null;
  try {
    pdfPath = await generateInvoicePdf(orderData, invoiceNumber);
  } catch (err) {
    logger.error("[Bot4] Lỗi tạo PDF, sẽ gửi email không có đính kèm", {
      error: err.message,
    });
  }

  // --- 4. Gửi email xác nhận đơn hàng ---
  let emailStatus = "FAILED";
  try {
    await sendConfirmationEmail(orderData, invoiceNumber, pdfPath);
    emailStatus = "SUCCESS";
  } catch (err) {
    logger.error("[Bot4] Lỗi gửi email xác nhận", { error: err.message });
    emailStatus = `FAILED: ${err.message}`;
  }

  // --- 5. Ghi vào Google Sheet ---
  await appendOrderResult(
    orderData,
    invoiceNumber,
    emailStatus,
    processInstanceId,
  );

  // --- 6. Dọn file PDF tạm (tùy chọn — comment nếu muốn lưu lại) ---
  // if (pdfPath && fs.existsSync(pdfPath)) {
  //   fs.unlinkSync(pdfPath);
  //   logger.info("[Bot4] Đã xóa file PDF tạm");
  // }

  // --- 7. Trả kết quả về Camunda ---
  const outputVars = new Variables();
  outputVars.set("invoiceNumber", invoiceNumber);
  outputVars.set("invoiceEmailStatus", emailStatus);
  outputVars.set("pdfPath", pdfPath || "");

  try {
    await taskService.complete(task, outputVars);
    logger.info("[Bot4] ✅ Task hoàn tất", {
      invoiceNumber,
      emailStatus,
      processInstanceId,
    });
  } catch (err) {
    logger.error("[Bot4] ❌ Không thể complete task", { error: err.message });
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// ============================================================
// STARTUP LOG
// ============================================================
logger.info("🤖 Bot 4 — Tạo hóa đơn PDF & Gửi email xác nhận đã khởi động");
logger.info(
  `📡 Camunda: ${process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest"}`,
);
logger.info(`🧠 Groq Model: ${process.env.GROQ_MODEL || "llama3-8b-8192"}`);
logger.info(`📧 SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
logger.info(
  `📊 Orders Sheet ID: ${process.env.ORDERS_SHEET_ID || "(chưa cấu hình)"}`,
);
logger.info(
  `🖨️  PDF Output: ${process.env.INVOICE_OUTPUT_DIR || "./invoices"}`,
);
