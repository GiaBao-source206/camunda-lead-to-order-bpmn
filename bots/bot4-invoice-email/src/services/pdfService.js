// src/services/pdfService.js
// Tạo hóa đơn PDF từ HTML template bằng Puppeteer

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

/**
 * Đảm bảo thư mục output tồn tại
 */
function ensureOutputDir() {
  const dir = process.env.INVOICE_OUTPUT_DIR || "./invoices";
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
  return absDir;
}

/**
 * Format số tiền theo kiểu Việt Nam
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount || 0);
}

/**
 * Build HTML template hóa đơn
 */
function buildInvoiceHtml(orderData, invoiceNumber) {
  const {
    customerName,
    customerEmail,
    productCode,
    productName,
    quantity,
    unitPrice,
    deliveryMethod,
    deliveryAddress,
  } = orderData;

  const qty = parseInt(quantity || "1", 10);
  const price = parseFloat(unitPrice || "0");
  const subtotal = qty * price;
  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  const deliveryLabels = {
    delivery: "Giao hàng tận nơi",
    store: "Nhận tại cửa hàng",
    agent: "Nhận tại đại lý",
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("vi-VN");

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 13px;
           color: #1a1a1a; background: #fff; padding: 40px; }
    .invoice-header { display: flex; justify-content: space-between;
                      align-items: flex-start; margin-bottom: 40px; }
    .company-info h1 { font-size: 20px; color: #1a56db; margin-bottom: 4px; }
    .company-info p { color: #555; font-size: 12px; line-height: 1.6; }
    .invoice-meta { text-align: right; }
    .invoice-meta h2 { font-size: 26px; color: #1a56db; letter-spacing: 2px; }
    .invoice-meta .invoice-num { font-size: 14px; font-weight: bold; color: #333; margin-top: 4px; }
    .invoice-meta .invoice-date { font-size: 12px; color: #777; }
    .divider { border: none; border-top: 2px solid #1a56db; margin: 20px 0; }
    .bill-to { background: #f0f4ff; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px; }
    .bill-to h3 { font-size: 12px; text-transform: uppercase; color: #888;
                  letter-spacing: 1px; margin-bottom: 8px; }
    .bill-to p { font-size: 14px; color: #1a1a1a; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #1a56db; color: #fff; }
    thead th { padding: 12px 14px; text-align: left; font-size: 12px;
               text-transform: uppercase; letter-spacing: 0.5px; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody td { padding: 12px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .text-right { text-align: right; }
    .totals { width: 300px; margin-left: auto; }
    .totals tr td { padding: 8px 14px; font-size: 13px; }
    .totals .total-row { background: #1a56db; color: #fff;
                         font-weight: bold; font-size: 14px; border-radius: 4px; }
    .delivery-info { background: #f9fafb; border: 1px solid #e5e7eb;
                     border-radius: 6px; padding: 14px 18px; margin-bottom: 28px; }
    .delivery-info h3 { font-size: 12px; text-transform: uppercase; color: #888;
                        letter-spacing: 1px; margin-bottom: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;
              display: flex; justify-content: space-between; font-size: 11px; color: #999; }
    .stamp-area { text-align: center; }
    .stamp-area p { font-size: 12px; color: #555; margin-bottom: 60px; }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <h1>${"Công ty Giày Thượng Đình"}</h1>
      <p>
        ${"TP. HCM"}<br/>
        ĐT: ${"0123 456 789"}<br/>
        Email: ${"contact@example.com"}<br/>
        MST: ${"0123456789"}
      </p>
    </div>
    <div class="invoice-meta">
      <h2>HÓA ĐƠN</h2>
      <div class="invoice-num">Số: ${invoiceNumber}</div>
      <div class="invoice-date">Ngày: ${dateStr}</div>
    </div>
  </div>

  <hr class="divider"/>

  <div class="bill-to">
    <h3>Thông tin khách hàng</h3>
    <p>
      <strong>${customerName || "Khách hàng"}</strong><br/>
      Email: ${customerEmail || "—"}
    </p>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Mã SP</th>
        <th>Tên sản phẩm</th>
        <th>Số lượng</th>
        <th class="text-right">Đơn giá</th>
        <th class="text-right">Thành tiền</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${productCode || "—"}</td>
        <td>${productName || productCode || "Sản phẩm"}</td>
        <td>${qty}</td>
        <td class="text-right">${formatCurrency(price)}</td>
        <td class="text-right">${formatCurrency(subtotal)}</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Tạm tính:</td>
      <td class="text-right">${formatCurrency(subtotal)}</td>
    </tr>
    <tr>
      <td>VAT (10%):</td>
      <td class="text-right">${formatCurrency(vat)}</td>
    </tr>
    <tr class="total-row">
      <td>TỔNG CỘNG:</td>
      <td class="text-right">${formatCurrency(total)}</td>
    </tr>
  </table>

  <div class="delivery-info">
    <h3>Thông tin giao nhận</h3>
    <p>
      <strong>Hình thức:</strong> ${deliveryLabels[deliveryMethod] || deliveryMethod}<br/>
      <strong>Địa chỉ:</strong> ${deliveryAddress || "—"}
    </p>
  </div>

  <div style="display:flex; justify-content:space-between; margin-top:40px;">
    <div class="stamp-area">
      <p>Người mua hàng<br/>(Ký, ghi rõ họ tên)</p>
    </div>
    <div class="stamp-area">
      <p>Người bán hàng<br/>(Ký, đóng dấu)</p>
    </div>
  </div>

  <div class="footer">
    <span>Cảm ơn quý khách đã tin tưởng sử dụng dịch vụ!</span>
    <span>Hóa đơn được tạo tự động bởi hệ thống — ${now.toLocaleString("vi-VN")}</span>
  </div>
</body>
</html>`;
}

/**
 * Tạo file PDF hóa đơn từ HTML bằng Puppeteer
 * @param {Object} orderData - Thông tin đơn hàng
 * @param {string} invoiceNumber - Số hóa đơn
 * @returns {string} Đường dẫn file PDF
 */
async function generateInvoicePdf(orderData, invoiceNumber) {
  const outputDir = ensureOutputDir();
  const fileName = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
  const filePath = path.join(outputDir, fileName);

  logger.info("[PDF] Đang tạo hóa đơn PDF...", { invoiceNumber, filePath });

  const html = buildInvoiceHtml(orderData, invoiceNumber);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Quan trọng trên VPS/Docker
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: filePath,
      format: "A4",
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      printBackground: true,
    });

    logger.info("[PDF] ✅ Tạo PDF thành công", { filePath });
    return filePath;
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoicePdf };
