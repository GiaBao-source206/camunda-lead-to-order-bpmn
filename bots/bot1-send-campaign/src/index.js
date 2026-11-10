// src/index.js
// Bot 1 — Gửi chiến dịch đa kênh
// Camunda External Task Worker: topic = "send-campaign"

require("dotenv").config();
const { Client, Variables } = require("camunda-external-task-client-js");
const logger = require("./utils/logger");

const { sendCampaignEmails } = require("./services/emailService");
const { appendCampaignResult } = require("./services/sheetsService");

const {
  sendToTelegramChannel,
  verifyBotAccess,
} = require("./services/telegramService");

// ============================================================
// DANH SÁCH EMAIL NHẬN CHIẾN DỊCH
// Trong thực tế: đọc từ DB hoặc Google Sheet CRM
// ============================================================
const MOCK_RECIPIENT_LIST = [
  {
    email: "customer@example.com",
    name: "Nguyễn Văn A",
  },
];

// ============================================================
// HẰNG SỐ
// ============================================================
const ALLOWED_CHANNELS = new Set(["email", "facebook", "telegram"]);

// ============================================================
// HELPER
// ============================================================
function normalizeChannels(rawChannel) {
  let values = [];

  if (Array.isArray(rawChannel)) {
    values = rawChannel;
  } else if (typeof rawChannel === "string") {
    values = rawChannel.split(",");
  }

  return [
    ...new Set(
      values
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => item && ALLOWED_CHANNELS.has(item)),
    ),
  ];
}

function getOverallStatus(channelResults) {
  const statuses = Object.values(channelResults)
    .map((item) => item.status)
    .filter(Boolean);

  if (!statuses.length) return "FAILED";
  if (statuses.every((status) => status === "SUCCESS")) return "SUCCESS";
  if (statuses.every((status) => status === "FAILED")) return "FAILED";
  return "PARTIAL";
}

function buildSummaryNote(channelResults) {
  const parts = [];

  if (channelResults.email) {
    parts.push(
      `Email=${channelResults.email.status} (${channelResults.email.successCount}/${channelResults.email.totalTarget})`,
    );
  }

  if (channelResults.facebook) {
    parts.push(`Facebook=${channelResults.facebook.status}`);
  }

  if (channelResults.telegram) {
    parts.push(`Telegram=${channelResults.telegram.status}`);
  }

  return parts.join(" | ");
}

async function runStartupChecks() {
  try {
    if (process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN) {
      await verifyPageToken();
    } else {
      logger.warn(
        "[Startup] Facebook chưa cấu hình đầy đủ, kênh Facebook sẽ không dùng được",
      );
    }

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
      await verifyBotAccess();
    } else {
      logger.warn(
        "[Startup] Telegram chưa cấu hình đầy đủ, kênh Telegram sẽ không dùng được",
      );
    }
  } catch (err) {
    logger.warn("[Startup] Lỗi khi kiểm tra cấu hình kênh", {
      error: err.message,
    });
  }
}

// ============================================================
// CAMUNDA CLIENT
// ============================================================
const client = new Client({
  baseUrl: process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest",
  workerId: process.env.WORKER_ID || "bot1-send-campaign-worker",
  maxTasks: 5,
  lockDuration: 30000,
  asyncResponseTimeout: 10000,
  interceptors: (config) => {
    logger.debug("[Camunda] Polling for tasks...");
    return config;
  },
});

// ============================================================
// HANDLER CHÍNH
// ============================================================
client.subscribe("send-campaign", async ({ task, taskService }) => {
  const processInstanceId = task.processInstanceId;
  const taskId = task.id;

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("[Bot1] 🚀 Nhận task gửi chiến dịch", {
    taskId,
    processInstanceId,
  });

  const campaignName =
    task.variables.get("campaignName") || "Chiến dịch không tên";
  const rawChannel = task.variables.get("channel");
  const promoContent = task.variables.get("promoContent") || "";
  const productName = task.variables.get("productName") || "";

  const selectedChannels = normalizeChannels(rawChannel);

  logger.info("[Bot1] Thông tin chiến dịch", {
    campaignName,
    rawChannel,
    selectedChannels,
    productName,
  });

  // Không có kênh hợp lệ
  if (!selectedChannels.length) {
    const note = "Không có kênh truyền thông hợp lệ được chọn";

    logger.error("[Bot1] ❌ Task không có kênh hợp lệ", {
      taskId,
      rawChannel,
    });

    try {
      await appendCampaignResult({
        campaignName,
        channel: "",
        productName,
        promoContent,
        totalSent: 0,
        successCount: 0,
        errorCount: 1,
        overallStatus: "FAILED",
        note,
        processInstanceId,
      });
    } catch (sheetErr) {
      logger.error("[Bot1] Không thể ghi Google Sheet", {
        error: sheetErr.message,
      });
    }

    const outputVars = new Variables();
    outputVars.set("campaignSentStatus", "FAILED");
    outputVars.set("campaignSuccessCount", 0);
    outputVars.set("campaignErrorCount", 1);
    outputVars.set("campaignChannels", "");
    outputVars.set("campaignChannelResults", JSON.stringify({}));

    try {
      await taskService.complete(task, outputVars);
      logger.info("[Bot1] ✅ Task hoàn tất với trạng thái FAILED", {
        processInstanceId,
      });
    } catch (err) {
      logger.error("[Bot1] ❌ Không thể complete task trên Camunda", {
        error: err.message,
      });
    }

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  const campaignData = {
    campaignName,
    channel: selectedChannels.join(", "),
    channels: selectedChannels,
    promoContent,
    productName,
    companyName: "Giày Thượng Đình",
    ctaUrl: process.env.COMPANY_WEBSITE || "#",
  };

  const channelResults = {};
  let totalTargetCount = 0;
  let totalSuccessCount = 0;
  let totalErrorCount = 0;

  // ==========================================================
  // 1. EMAIL
  // ==========================================================
  if (selectedChannels.includes("email")) {
    const recipients = MOCK_RECIPIENT_LIST;
    totalTargetCount += recipients.length;

    logger.info("[Bot1] Danh sách nhận email", {
      count: recipients.length,
      recipients: recipients.map((item) =>
        typeof item === "string"
          ? { email: item, name: "Quý khách" }
          : { email: item.email, name: item.name || "Quý khách" },
      ),
    });

    try {
      const emailResult = await sendCampaignEmails(campaignData, recipients);

      const emailStatus =
        emailResult.errorCount > 0
          ? emailResult.successCount > 0
            ? "PARTIAL"
            : "FAILED"
          : "SUCCESS";

      channelResults.email = {
        status: emailStatus,
        totalTarget: recipients.length,
        successCount: emailResult.successCount || 0,
        errorCount: emailResult.errorCount || 0,
        errors: emailResult.errors || [],
      };

      totalSuccessCount += emailResult.successCount || 0;
      totalErrorCount += emailResult.errorCount || 0;

      logger.info("[Bot1] Kết quả gửi email", channelResults.email);
    } catch (err) {
      channelResults.email = {
        status: "FAILED",
        totalTarget: recipients.length,
        successCount: 0,
        errorCount: recipients.length,
        errors: [err.message],
      };

      totalErrorCount += recipients.length;

      logger.error("[Bot1] ❌ Lỗi nghiêm trọng khi gửi email", {
        error: err.message,
      });
    }
  }

  // ==========================================================
  // 2. FACEBOOK
  // ==========================================================
  if (selectedChannels.includes("facebook")) {
    totalTargetCount += 1;

    try {
      const fbResult = await postToFacebookPage(campaignData);

      channelResults.facebook = {
        status: "SUCCESS",
        totalTarget: 1,
        successCount: 1,
        errorCount: 0,
        postId: fbResult.postId,
        postUrl: fbResult.postUrl,
      };

      totalSuccessCount += 1;

      logger.info("[Bot1] Kết quả đăng Facebook", channelResults.facebook);
    } catch (err) {
      channelResults.facebook = {
        status: "FAILED",
        totalTarget: 1,
        successCount: 0,
        errorCount: 1,
        error: err.message,
      };

      totalErrorCount += 1;

      logger.error("[Bot1] ❌ Lỗi đăng Facebook", {
        error: err.message,
      });
    }
  }

  // ==========================================================
  // 3. TELEGRAM
  // ==========================================================
  if (selectedChannels.includes("telegram")) {
    totalTargetCount += 1;

    try {
      const telegramResult = await sendToTelegramChannel(campaignData);

      channelResults.telegram = {
        status: "SUCCESS",
        totalTarget: 1,
        successCount: 1,
        errorCount: 0,
        messageId: telegramResult.messageId,
        chatId: telegramResult.chatId,
        chatTitle: telegramResult.chatTitle,
      };

      totalSuccessCount += 1;

      logger.info("[Bot1] Kết quả gửi Telegram", channelResults.telegram);
    } catch (err) {
      channelResults.telegram = {
        status: "FAILED",
        totalTarget: 1,
        successCount: 0,
        errorCount: 1,
        error: err.message,
      };

      totalErrorCount += 1;

      logger.error("[Bot1] ❌ Lỗi gửi Telegram", {
        error: err.message,
      });
    }
  }

  // ==========================================================
  // 4. TỔNG HỢP KẾT QUẢ
  // ==========================================================
  const overallStatus = getOverallStatus(channelResults);
  const note = buildSummaryNote(channelResults);

  logger.info("[Bot1] Tổng hợp kết quả chiến dịch", {
    overallStatus,
    totalTargetCount,
    totalSuccessCount,
    totalErrorCount,
    note,
  });

  // ==========================================================
  // 5. GHI GOOGLE SHEET
  // ==========================================================
  try {
    await appendCampaignResult({
      campaignName,
      channel: selectedChannels.join(", "),
      productName,
      promoContent,
      totalSent: totalTargetCount,
      successCount: totalSuccessCount,
      errorCount: totalErrorCount,
      overallStatus,
      note,
      processInstanceId,
    });
  } catch (err) {
    logger.error("[Bot1] ❌ Không thể ghi Google Sheet", {
      error: err.message,
    });
  }

  // ==========================================================
  // 6. TRẢ KẾT QUẢ VỀ CAMUNDA
  // ==========================================================
  const outputVars = new Variables();

  outputVars.set("campaignSentStatus", overallStatus);
  outputVars.set("campaignSuccessCount", totalSuccessCount);
  outputVars.set("campaignErrorCount", totalErrorCount);
  outputVars.set("campaignChannels", selectedChannels.join(","));
  outputVars.set("campaignChannelResults", JSON.stringify(channelResults));

  outputVars.set(
    "campaignEmailStatus",
    channelResults.email?.status || "SKIPPED",
  );
  outputVars.set(
    "campaignFacebookStatus",
    channelResults.facebook?.status || "SKIPPED",
  );
  outputVars.set(
    "campaignTelegramStatus",
    channelResults.telegram?.status || "SKIPPED",
  );

  if (channelResults.facebook?.postUrl) {
    outputVars.set("campaignFacebookPostUrl", channelResults.facebook.postUrl);
  }

  if (channelResults.telegram?.messageId) {
    outputVars.set(
      "campaignTelegramMessageId",
      channelResults.telegram.messageId,
    );
  }

  try {
    await taskService.complete(task, outputVars);
    logger.info("[Bot1] ✅ Task hoàn tất", {
      overallStatus,
      processInstanceId,
    });
  } catch (err) {
    logger.error("[Bot1] ❌ Không thể complete task trên Camunda", {
      error: err.message,
    });
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// ============================================================
// STARTUP LOG
// ============================================================
logger.info("🤖 Bot 1 — Gửi chiến dịch đa kênh đã khởi động");
logger.info(
  `📡 Kết nối Camunda: ${process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest"}`,
);
logger.info(`📧 SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
logger.info(
  `📊 Google Sheet ID: ${process.env.CAMPAIGN_SHEET_ID || "(chưa cấu hình)"}`,
);

runStartupChecks();
