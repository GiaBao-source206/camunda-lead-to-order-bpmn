// src/index.js
// Bot 2 — Lưu lead và chấm điểm AI bằng Groq
// Camunda External Task Worker: topic = "save-score-lead"

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client, Variables } = require("camunda-external-task-client-js");

const logger = require("./utils/logger");
const { scoreLead } = require("./services/groqService");
const { appendLeadResult } = require("./services/sheetsService");

// ============================================================
// TẠO THƯ MỤC LOGS
// ============================================================
const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ============================================================
// HELPER
// ============================================================
function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  if (typeof value === "number") return value === 1;
  return false;
}

// ============================================================
// CAMUNDA CLIENT
// ============================================================
const client = new Client({
  baseUrl: process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest",
  workerId: process.env.WORKER_ID || "bot2-save-score-lead-worker",
  maxTasks: 5,
  lockDuration: 60000,
  asyncResponseTimeout: 10000,
});

// ============================================================
// HANDLER CHÍNH
// ============================================================
client.subscribe("save-score-lead", async ({ task, taskService }) => {
  const processInstanceId = task.processInstanceId;
  const taskId = task.id;

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("[Bot2] 🚀 Nhận task lưu & chấm điểm lead", {
    taskId,
    processInstanceId,
  });

  try {
    // --- 1. Đọc dữ liệu từ Camunda ---
    const leadData = {
      leadName: task.variables.get("leadName") || "",
      leadPhone: task.variables.get("leadPhone") || "",
      leadEmail: task.variables.get("leadEmail") || "",
      leadSource: task.variables.get("leadSource") || "unknown",
      leadPriority: task.variables.get("leadPriority") || "warm",
      leadNeed: task.variables.get("leadNeed") || "",
      leadArea: task.variables.get("leadArea") || "",
      leadComplete: toBoolean(task.variables.get("leadComplete")),
      verifyNote: task.variables.get("verifyNote") || "",
    };

    logger.info("[Bot2] Dữ liệu lead nhận được", leadData);

    // --- 2. Gọi Groq AI chấm điểm ---
    const scoreResult = await scoreLead(leadData);

    logger.info("[Bot2] Kết quả chấm điểm AI", {
      score: scoreResult.score,
      grade: scoreResult.grade,
      reasoning: scoreResult.reasoning,
      suggestedAction: scoreResult.suggestedAction,
    });

    // --- 3. Ghi vào Google Sheet ---
    // Nếu Sheet lỗi thì vẫn không làm chết toàn bộ flow
    try {
      await appendLeadResult(leadData, scoreResult, processInstanceId);
      logger.info("[Bot2] Đã ghi lead vào Google Sheet", {
        leadName: leadData.leadName,
        processInstanceId,
      });
    } catch (sheetErr) {
      logger.error("[Bot2] ❌ Lỗi ghi Google Sheet", {
        error: sheetErr.message,
        processInstanceId,
      });
    }

    // --- 4. Trả kết quả về Camunda ---
    const outputVars = new Variables();
    outputVars.set("leadScore", scoreResult.score);
    outputVars.set("leadGrade", scoreResult.grade);
    outputVars.set("leadSuggestedAction", scoreResult.suggestedAction);
    outputVars.set("leadReasoning", scoreResult.reasoning);

    await taskService.complete(task, outputVars);

    logger.info("[Bot2] ✅ Task hoàn tất", {
      leadName: leadData.leadName,
      score: scoreResult.score,
      grade: scoreResult.grade,
      processInstanceId,
    });
  } catch (err) {
    logger.error("[Bot2] ❌ Lỗi xử lý task", {
      error: err.message,
      processInstanceId,
      taskId,
    });

    try {
      await taskService.handleFailure(
        task,
        "Bot2 xử lý lead thất bại",
        err.stack || err.message,
        0,
        1000,
      );
    } catch (failureErr) {
      logger.error("[Bot2] ❌ Không thể báo failure về Camunda", {
        error: failureErr.message,
        processInstanceId,
        taskId,
      });
    }
  }

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// ============================================================
// STARTUP LOG
// ============================================================
logger.info("🤖 Bot 2 — Lưu lead & chấm điểm AI đã khởi động");
logger.info(
  `📡 Camunda: ${process.env.CAMUNDA_BASE_URL || "http://localhost:8080/engine-rest"}`,
);
logger.info(`🧠 Groq Model: ${process.env.GROQ_MODEL || "llama3-8b-8192"}`);
logger.info(`📊 Sheet ID: ${process.env.LEADS_SHEET_ID || "(chưa cấu hình)"}`);
