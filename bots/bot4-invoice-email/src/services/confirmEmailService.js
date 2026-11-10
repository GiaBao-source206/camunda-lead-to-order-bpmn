// src/services/confirmEmailService.js
// Dùng Groq generate nội dung email xác nhận đơn hàng cá nhân hóa
// rồi gửi kèm hóa đơn PDF qua Nodemailer

const Groq = require("groq-sdk");
const nodemailer = require("nodemailer");
const fs = require("fs");
const logger = require("../utils/logger");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Groq: Generate nội dung email xác nhận đơn hàng cá nhân hóa
 */
async function generateConfirmEmailContent(orderData) {
  const { customerName, productName, productCode, quantity, deliveryMethod } =
    orderData;

  const deliveryLabels = {
    delivery: "giao hàng tận nơi",
    store: "nhận tại cửa hàng",
    agent: "nhận tại đại lý",
  };

  const prompt = `Bạn là nhân viên CSKH chuyên nghiệp của ${"Công ty Giày Thượng Đình"}.
Viết một email xác nhận đơn hàng ngắn gọn, thân thiện, chuyên nghiệp bằng tiếng Việt.

Thông tin đơn hàng:
- Tên khách hàng: ${customerName}
- Sản phẩm: ${productName || productCode}
- Số lượng: ${quantity}
- Hình thức nhận: ${deliveryLabels[deliveryMethod] || deliveryMethod}

Yêu cầu:
- Chào hỏi khách hàng theo tên
- Xác nhận đơn hàng thành công, nêu thông tin sản phẩm và hình thức nhận
- Thông báo hóa đơn đính kèm
- Kêu gọi liên hệ nếu có thắc mắc
- Lời chào kết thúc chuyên nghiệp
- Tổng độ dài khoảng 80-120 từ, không quá dài

Chỉ trả về nội dung phần body email (không bao gồm tiêu đề/subject), dạng văn xuôi thuần túy.`;

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content || "";
    logger.info("[Groq] Generate nội dung email thành công");
    return content.trim();
  } catch (err) {
    logger.error("[Groq] Lỗi generate email, dùng template mặc định", {
      error: err.message,
    });
    return `Kính gửi ${customerName},\n\nChúng tôi xin xác nhận đơn hàng của bạn đã được ghi nhận thành công. Hóa đơn chi tiết được đính kèm trong email này.\n\nNếu có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi.\n\nTrân trọng,\n${"Công ty Giày Thượng Đình"}`;
  }
}

/**
 * Gửi email xác nhận đơn hàng kèm hóa đơn PDF
 */
async function sendConfirmationEmail(orderData, invoiceNumber, pdfPath) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // AI generate nội dung cá nhân hóa
  const emailBody = await generateConfirmEmailContent(orderData);

  // Wrap vào HTML đẹp
  const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #222; background: #f9f9f9; }
    .container { max-width: 580px; margin: 32px auto; background: #fff;
                 border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a56db; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .badge { display: inline-block; background: #22c55e; color: #fff;
             padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-top: 8px; }
    .body { padding: 28px 32px; line-height: 1.8; white-space: pre-line; }
    .order-box { background: #f0f4ff; border-radius: 6px; padding: 14px 18px;
                 margin: 20px 0; font-size: 13px; }
    .order-box strong { display: block; margin-bottom: 8px; color: #1a56db; }
    .footer { background: #f3f4f6; padding: 14px 32px; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Xác nhận đơn hàng</h1>
      <span class="badge">Đơn #${invoiceNumber}</span>
    </div>
    <div class="body">
      ${emailBody.replace(/\n/g, "<br/>")}
      <div class="order-box">
        <strong>📋 Chi tiết đơn hàng</strong>
        Sản phẩm: ${orderData.productName || orderData.productCode}<br/>
        Số lượng: ${orderData.quantity}<br/>
        Hình thức nhận: ${orderData.deliveryMethod}<br/>
        Địa chỉ: ${orderData.deliveryAddress || "—"}
      </div>
      <p style="font-size:12px;color:#888;">📎 Hóa đơn PDF đính kèm bên dưới.</p>
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} ${"Công ty Giày Thượng Đình"} — Email tự động, vui lòng không reply.
    </div>
  </div>
</body>
</html>`;

  const attachments = [];
  if (pdfPath && fs.existsSync(pdfPath)) {
    attachments.push({
      filename: `HoaDon_${invoiceNumber}.pdf`,
      path: pdfPath,
      contentType: "application/pdf",
    });
  }

  logger.info(
    `[Email] Đang gửi email xác nhận tới: ${orderData.customerEmail}`,
  );

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: orderData.customerEmail,
    subject: `✅ Xác nhận đơn hàng #${invoiceNumber} — ${"Công ty Giày Thượng Đình"}`,
    html: htmlContent,
    attachments,
  });

  logger.info(
    `[Email] ✅ Email xác nhận đã gửi thành công tới: ${orderData.customerEmail}`,
  );
}

module.exports = { sendConfirmationEmail };
