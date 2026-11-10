const Groq = require("groq-sdk");
const logger = require("../utils/logger");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích và chấm điểm lead bán hàng.
Nhiệm vụ: Phân tích thông tin lead và trả về JSON chấm điểm.

Quy tắc chấm điểm (tổng 100 điểm):
- Mức độ ưu tiên (hot/warm/cold): hot=40đ, warm=25đ, cold=10đ
- Thông tin đầy đủ (dựa trên email, khu vực, nhu cầu rõ ràng và đánh giá của Sales): 0-25đ
- Nguồn lead chất lượng (referral > organic > paid > unknown): 0-20đ
- Tiềm năng theo nhu cầu mô tả: 0-15đ

Phân loại kết quả:
- 80-100: "A" (Rất tiềm năng - ưu tiên liên hệ ngay)
- 60-79:  "B" (Tiềm năng cao - liên hệ trong ngày)
- 40-59:  "C" (Trung bình - lên kế hoạch follow-up)
- 0-39:   "D" (Thấp - vào nurturing campaign)

Chỉ trả về JSON hợp lệ:
{
  "score": 0,
  "grade": "C",
  "reasoning": "Giải thích ngắn gọn bằng tiếng Việt.",
  "suggestedAction": "Hành động đề xuất cho Sales bằng tiếng Việt."
}`;

function normalizeGrade(score) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

async function scoreLead(leadData) {
  const userMessage = `
Thông tin lead cần chấm điểm:
- Tên: ${leadData.leadName || "Không có"}
- SĐT: ${leadData.leadPhone || "Không có"}
- Email: ${leadData.leadEmail || "Không có"}
- Nguồn lead: ${leadData.leadSource || "unknown"}
- Mức độ ưu tiên (Sales đánh giá): ${leadData.leadPriority || "warm"}
- Nhu cầu khách hàng: ${leadData.leadNeed || "Không mô tả"}
- Khu vực: ${leadData.leadArea || "Không rõ"}
- Sales đánh giá thông tin lead đầy đủ: ${leadData.leadComplete ? "Có" : "Không"}
- Ghi chú xác minh: ${leadData.verifyNote || "Không có"}
  `.trim();

  logger.info("[Groq] Đang chấm điểm lead...", {
    leadName: leadData.leadName,
    leadPhone: leadData.leadPhone,
  });

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama3-8b-8192",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const rawContent = completion.choices?.[0]?.message?.content || "{}";

    logger.debug("[Groq] Raw response", { rawContent });
    logger.info("[Groq] Raw response", { rawContent }); // <-- thêm dòng này

    const cleaned = rawContent
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    const safeScore = clampScore(parseInt(parsed.score, 10) || 50);

    const result = {
      score: safeScore,
      grade: normalizeGrade(safeScore),
      reasoning:
        typeof parsed.reasoning === "string" && parsed.reasoning.trim()
          ? parsed.reasoning.trim()
          : "Không thể phân tích AI, điểm mặc định được gán.",
      suggestedAction:
        typeof parsed.suggestedAction === "string" &&
        parsed.suggestedAction.trim()
          ? parsed.suggestedAction.trim()
          : "Sales tự đánh giá và liên hệ theo lịch thông thường.",
    };

    logger.info("[Groq] Chấm điểm thành công", {
      leadName: leadData.leadName,
      score: result.score,
      grade: result.grade,
    });

    return result;
  } catch (err) {
    logger.error("[Groq] Lỗi chấm điểm, dùng giá trị mặc định", {
      error: err.message,
    });

    return {
      score: 50,
      grade: "C",
      reasoning: "Không thể phân tích AI, điểm mặc định được gán.",
      suggestedAction: "Sales tự đánh giá và liên hệ theo lịch thông thường.",
    };
  }
}

module.exports = { scoreLead };
