"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAcademicReviewObject = exports.generateAcademicReviewText = void 0;
const ai_1 = require("ai");
const google_1 = require("@ai-sdk/google");
const zod_1 = require("zod");
/**
 * 学術論文レビュー用のスキーマとアイコンマップ
 */
const academicCommentSchema = zod_1.z.object({
    path: zod_1.z
        .string()
        .describe("Relative path to the file where the comment should be posted. Example: 'thesis/chapter2.tex' or 'paper/introduction.md'"),
    body: zod_1.z
        .string()
        .describe("Specific and constructive feedback from an academic perspective. Include improvement suggestions from an educational viewpoint."),
    line: zod_1.z
        .number()
        .positive()
        .describe("The 1-based line number where the comment is placed. Corresponds to the new line number in the diff."),
    priority: zod_1.z
        .enum(["CRITICAL", "IMPORTANT", "SUGGESTION", "GOOD_POINT"])
        .describe("Feedback priority. CRITICAL=major academic errors, IMPORTANT=significantly affects paper quality, SUGGESTION=improvement suggestions, GOOD_POINT=excellent sections"),
    category: zod_1.z
        .enum(["ACCURACY", "STRUCTURE", "NOVELTY", "FORMAT", "WRITING"])
        .describe("Feedback category. ACCURACY=academic accuracy, STRUCTURE=organization, NOVELTY=research novelty, FORMAT=formal requirements, WRITING=language quality and readability")
});
const academicReviewSchema = zod_1.z.object({
    body: zod_1.z
        .string()
        .describe("Overall feedback for the entire paper. Include both areas for improvement and strengths."),
    comments: zod_1.z.array(academicCommentSchema),
    strengths: zod_1.z.array(zod_1.z.string()).describe("List of the paper's strengths"),
    improvements: zod_1.z.array(zod_1.z.string()).describe("List of main areas needing improvement")
});
// アイコンマップ（学術論文向け）
const academicIconMap = {
    "CRITICAL": "🚨",
    "IMPORTANT": "📝",
    "SUGGESTION": "💡",
    "GOOD_POINT": "✅"
};
// カテゴリマップ（言語別）
const categoryMapJa = {
    "ACCURACY": "学術的正確性",
    "STRUCTURE": "構成",
    "NOVELTY": "新規性",
    "FORMAT": "形式",
    "WRITING": "文章品質"
};
const categoryMapEn = {
    "ACCURACY": "Academic Accuracy",
    "STRUCTURE": "Structure",
    "NOVELTY": "Novelty",
    "FORMAT": "Format",
    "WRITING": "Writing Quality"
};
// 優先度順序
const academicPriorityOrder = {
    "CRITICAL": 0,
    "IMPORTANT": 1,
    "SUGGESTION": 2,
    "GOOD_POINT": 999
};
/**
 * Generic retry function with exponential backoff
 */
function withRetry(operation, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const { maxAttempts, initialDelayMs, backoffFactor, retryableError, onRetry } = options;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return yield operation(attempt);
            }
            catch (error) {
                lastError = error;
                if (!retryableError(error)) {
                    throw error;
                }
                if (attempt >= maxAttempts) {
                    break;
                }
                const delayMs = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
                if (onRetry) {
                    onRetry(attempt, error);
                }
                yield new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        throw lastError;
    });
}
/**
 * 学術論文レビュー用のテキスト生成関数
 */
const generateAcademicReviewText = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { modelCode, userPrompt } = params;
    const { text } = yield (0, ai_1.generateText)({
        model: (0, google_1.google)(modelCode),
        prompt: userPrompt,
    });
    return { body: text };
});
exports.generateAcademicReviewText = generateAcademicReviewText;
/**
 * 学術論文レビュー用の構造化レビュー生成関数
 */
const generateAcademicReviewObject = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { modelCode, userPrompt } = params;
    // プロンプトから言語を判定（Japanese が含まれていれば日本語、それ以外は英語）
    const isJapanese = userPrompt.includes('Japanese');
    const categoryMap = isJapanese ? categoryMapJa : categoryMapEn;
    try {
        const { object } = yield withRetry((...args_1) => __awaiter(void 0, [...args_1], void 0, function* (attempt = 1) {
            return yield (0, ai_1.generateObject)({
                schema: academicReviewSchema,
                model: (0, google_1.google)(modelCode),
                prompt: userPrompt,
                temperature: attempt === 1 ? 0 : 0.5
            });
        }), {
            maxAttempts: 3,
            initialDelayMs: 2000,
            backoffFactor: 1.5,
            retryableError: (error) => {
                return error instanceof ai_1.NoObjectGeneratedError;
            },
            onRetry: (attempt, error) => {
                console.log(`Retry attempt ${attempt} after error: ${error.message}`);
            }
        });
        // 総合フィードバックの構築
        let overallBody = object.body;
        if (object.strengths && object.strengths.length > 0) {
            overallBody += "\n\n## 優れている点\n";
            object.strengths.forEach((strength, index) => {
                overallBody += `${index + 1}. ${strength}\n`;
            });
        }
        if (object.improvements && object.improvements.length > 0) {
            overallBody += "\n\n## 主な改善点\n";
            object.improvements.forEach((improvement, index) => {
                overallBody += `${index + 1}. ${improvement}\n`;
            });
        }
        return {
            body: overallBody,
            comments: object.comments
                .sort((a, b) => academicPriorityOrder[a.priority] - academicPriorityOrder[b.priority])
                .map((comment) => {
                return {
                    path: comment.path,
                    body: `${academicIconMap[comment.priority]} [${comment.priority}] [${categoryMap[comment.category]}] ${comment.body}`,
                    line: comment.line
                };
            }),
        };
    }
    catch (error) {
        console.log("Failed to generate structured academic review after all retries. Falling back to text generation.");
        return yield (0, exports.generateAcademicReviewText)(params);
    }
});
exports.generateAcademicReviewObject = generateAcademicReviewObject;
