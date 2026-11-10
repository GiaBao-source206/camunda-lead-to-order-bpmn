// src/utils/logger.js
// Winston logger — ghi log ra console và file logs/bot1.log

const { createLogger, format, transports } = require("winston");
const path = require("path");
const fs = require("fs");

// Tạo thư mục logs nếu chưa có
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [
    // Console — màu sắc cho dễ đọc lúc dev
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? "\n" + JSON.stringify(meta, null, 2)
            : "";
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        }),
      ),
    }),
    // File log
    new transports.File({
      filename: path.join(logDir, "bot1.log"),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

module.exports = logger;
