// src/services/emailService.js
// Gửi email chiến dịch hàng loạt qua Nodemailer (SMTP)

const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

/**
 * Tạo transporter SMTP từ biến môi trường
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: String(process.env.SMTP_PORT) === "465", // true nếu dùng port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Lấy email và tên khách từ recipient
 * Hỗ trợ:
 * - "abc@gmail.com"
 * - { email: "abc@gmail.com", name: "Nguyễn Văn A" }
 */
function normalizeRecipient(recipient) {
  if (typeof recipient === "string") {
    return {
      email: recipient,
      name: "Quý khách",
    };
  }

  return {
    email: recipient?.email || "",
    name: recipient?.name || "Quý khách",
  };
}

/**
 * Build subject có tên công ty + tên khách hàng
 */
function buildSubject(campaignData, customerName) {
  const companyName = campaignData.companyName || "Giày Thượng Đình";
  const safeCustomerName = customerName || "Quý khách";

  if (campaignData.productName) {
    return `${companyName} gửi đến ${safeCustomerName} - Ưu đãi cho ${campaignData.productName}`;
  }

  if (campaignData.campaignName) {
    return `${companyName} gửi đến ${safeCustomerName} - ${campaignData.campaignName}`;
  }

  return `${companyName} gửi đến ${safeCustomerName}`;
}

/**
 * Build bản text fallback
 */
function buildEmailText(campaignData, customerName) {
  const companyName = campaignData.companyName || "Giày Thượng Đình";
  const campaignName = campaignData.campaignName || "Chương trình ưu đãi";
  const productName = campaignData.productName || "Sản phẩm đang cập nhật";
  const promoContent =
    campaignData.promoContent || "Thông tin ưu đãi đang được cập nhật.";
  const safeCustomerName = customerName || "Quý khách";

  return [
    `${companyName} gửi đến ${safeCustomerName}`,
    "",
    `Kính chào ${safeCustomerName},`,
    "",
    `${companyName} xin trân trọng giới thiệu chương trình ưu đãi đặc biệt dành cho bạn:`,
    "",
    `Chương trình: ${campaignName}`,
    `Khuyến mãi: ${promoContent}`,
    `Sản phẩm: ${productName}`,
    "",
    "Đừng bỏ lỡ cơ hội này! Liên hệ ngay với chúng tôi để được tư vấn miễn phí.",
    "",
    `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`,
  ].join("\n");
}

/**
 * Build HTML email body từ thông tin chiến dịch
 * Dùng table + inline CSS để render ổn định hơn trên desktop email
 */
function buildEmailHtml(campaignData, customerName) {
  const campaignName = escapeHtml(
    campaignData.campaignName || "Chương trình ưu đãi",
  );
  const productName = escapeHtml(
    campaignData.productName || "Sản phẩm đang cập nhật",
  );
  const promoContent = escapeHtml(
    campaignData.promoContent || "Thông tin ưu đãi đang được cập nhật.",
  );
  const companyName = escapeHtml(
    campaignData.companyName || "Giày Thượng Đình",
  );
  const safeCustomerName = escapeHtml(customerName || "Quý khách");
  const ctaUrl = escapeHtml(campaignData.ctaUrl || "#");
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${companyName} gửi đến ${safeCustomerName}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    ${companyName} gửi đến ${safeCustomerName} - ${campaignName}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; background-color:#f3f4f6; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px; width:100%; border-collapse:separate; background-color:#ffffff; border-radius:12px; overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#2557d6; padding:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td valign="middle" style="font-family:Arial, Helvetica, sans-serif; font-size:30px; line-height:30px; width:44px;">
                    🎯
                  </td>
                  <td valign="middle" style="font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:36px; font-weight:700; color:#ffffff;">
                    ${campaignName}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#111827;">
                Kính chào ${safeCustomerName},
              </p>

              <p style="margin:0 0 24px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#111827;">
                ${companyName} xin trân trọng giới thiệu chương trình ưu đãi đặc biệt dành cho bạn:
              </p>

              <!-- Promo -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:separate; background-color:#eef2ff; border-left:5px solid #2557d6; border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:24px; font-weight:700; color:#111827; margin-bottom:8px;">
                      📢 Chương trình khuyến mãi:
                    </div>
                    <div style="font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:24px; color:#111827;">
                      ${promoContent}
                    </div>
                  </td>
                </tr>
              </table>

              <div style="height:24px; line-height:24px; font-size:24px;">&nbsp;</div>

              <div style="font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:28px; font-weight:700; color:#2557d6; margin:0 0 16px 0;">
                🛍️ Sản phẩm: ${productName}
              </div>

              <p style="margin:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#111827;">
                Đừng bỏ lỡ cơ hội này! Liên hệ ngay với chúng tôi để được tư vấn miễn phí.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2557d6" style="border-radius:10px;">
                    <a
                      href="${ctaUrl}"
                      target="_blank"
                      style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;"
                    >
                      Tìm hiểu ngay
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:separate; background-color:#f3f4f6; border-radius:10px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#6b7280;">
                      Email này được gửi tự động từ hệ thống. Vui lòng không reply trực tiếp.
                    </p>
                    <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#6b7280;">
                      © ${currentYear} Công ty ${companyName}. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Gửi email chiến dịch đến danh sách recipients
 * @param {Object} campaignData - Thông tin chiến dịch
 * @param {(string|{email:string,name?:string})[]} recipients - Danh sách email nhận
 * @returns {{ successCount: number, errorCount: number, errors: Array }}
 */
async function sendCampaignEmails(campaignData, recipients) {
  const transporter = createTransporter();

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  logger.info(
    `[Email] Bắt đầu gửi chiến dịch tới ${recipients.length} địa chỉ`,
    {
      campaignName: campaignData.campaignName,
    },
  );

  // Gửi tuần tự để tránh spam filter
  for (const recipient of recipients) {
    const { email, name } = normalizeRecipient(recipient);

    if (!email) {
      errorCount++;
      errors.push({ to: "", error: "Thiếu địa chỉ email người nhận" });
      logger.error("[Email] ❌ Thiếu địa chỉ email người nhận");
      continue;
    }

    try {
      const html = buildEmailHtml(campaignData, name);
      const text = buildEmailText(campaignData, name);
      const subject = buildSubject(campaignData, name);

      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        text,
        html,
      });

      successCount++;
      logger.info(`[Email] ✅ Gửi thành công tới: ${email}`, {
        customerName: name,
        subject,
      });
    } catch (err) {
      errorCount++;
      errors.push({ to: email, error: err.message });
      logger.error(`[Email] ❌ Lỗi gửi tới ${email}`, { error: err.message });
    }

    // Delay nhỏ giữa các email để tránh rate limit SMTP
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  logger.info("[Email] Kết quả gửi chiến dịch", { successCount, errorCount });
  return { successCount, errorCount, errors };
}

module.exports = { sendCampaignEmails };
