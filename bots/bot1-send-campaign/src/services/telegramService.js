// src/services/telegramService.js
// Gửi tin chiến dịch vào Telegram Channel qua Bot API

const TelegramBot = require("node-telegram-bot-api");
const logger = require("../utils/logger");

// Khởi tạo bot ở chế độ polling=false (chỉ gửi, không nhận)
let _bot = null;
function getBot() {
  if (!_bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN trong .env");
    _bot = new TelegramBot(token, { polling: false });
  }
  return _bot;
}

/**
 * Build nội dung tin nhắn Telegram (hỗ trợ HTML formatting)
 */
function buildTelegramMessage(campaignData) {
  const { campaignName, productName, promoContent } = campaignData;

  // Telegram HTML mode: <b>, <i>, <a>, <code> được hỗ trợ
  return [
    `🎯 <b>${escapeHtml(campaignName)}</b>`,
    ``,
    `🛍️ <b>Sản phẩm:</b> ${escapeHtml(productName)}`,
    ``,
    `📢 <b>Ưu đãi:</b>`,
    escapeHtml(promoContent),
    ``,
    `👇 <i>Liên hệ ngay để được tư vấn miễn phí!</i>`,
  ].join("\n");
}

/**
 * Escape ký tự đặc biệt HTML cho Telegram parse_mode HTML
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Gửi tin chiến dịch vào Telegram Channel
 * @param {Object} campaignData - Thông tin chiến dịch
 * @returns {{ messageId: number, chatId: string }}
 */
async function sendToTelegramChannel(campaignData) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!channelId) {
    throw new Error("Thiếu TELEGRAM_CHANNEL_ID trong .env");
  }

  const bot = getBot();
  const text = buildTelegramMessage(campaignData);

  logger.info("[Telegram] Đang gửi tin vào Channel...", {
    channelId,
    campaignName: campaignData.campaignName,
  });

  try {
    const sentMessage = await bot.sendMessage(channelId, text, {
      parse_mode: "HTML",
      // disable_web_page_preview: true,  // Bỏ comment nếu không muốn preview link
    });

    logger.info("[Telegram] ✅ Gửi thành công", {
      messageId: sentMessage.message_id,
      channelId,
    });

    return {
      messageId: sentMessage.message_id,
      chatId: sentMessage.chat.id,
      chatTitle: sentMessage.chat.title,
    };
  } catch (err) {
    // Telegram error codes: https://core.telegram.org/api/errors
    const errMsg = err.response?.body
      ? `[${err.response.body.error_code}] ${err.response.body.description}`
      : err.message;

    logger.error("[Telegram] ❌ Lỗi gửi tin", { error: errMsg });
    throw new Error(`Telegram API lỗi: ${errMsg}`);
  }
}

/**
 * Verify bot token và quyền vào channel (dùng khi startup)
 */
async function verifyBotAccess() {
  try {
    const bot = getBot();
    const me = await bot.getMe();
    logger.info("[Telegram] Bot token hợp lệ", {
      botId: me.id,
      botUsername: me.username,
    });
    return true;
  } catch (err) {
    logger.warn("[Telegram] Không thể verify bot token", {
      error: err.message,
    });
    return false;
  }
}

module.exports = { sendToTelegramChannel, verifyBotAccess };
