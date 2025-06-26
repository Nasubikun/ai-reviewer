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
exports.generateReviewCommentObject = exports.generateReviewCommentText = exports.dryRunPostReviewComment = exports.realPostReviewComment = exports.generateAcademicReviewText = exports.generateAcademicReviewObject = exports.createAcademicReviewPrompt = void 0;
exports.fetchPullRequest = fetchPullRequest;
exports.fetchPullRequestFiles = fetchPullRequestFiles;
exports.filterFiles = filterFiles;
exports.parseFiles = parseFiles;
exports.createReviewPrompt = createReviewPrompt;
exports.createParsedDiffText = createParsedDiffText;
exports.runReviewBotVercelAI = runReviewBotVercelAI;
const ai_1 = require("ai");
const google_1 = require("@ai-sdk/google");
const rest_1 = require("@octokit/rest");
const minimatch_1 = require("minimatch");
const diff_1 = require("diff");
const zod_1 = require("zod");
// 学術論文レビュー用の関数をインポート
var createAcademicPrompt_1 = require("./createAcademicPrompt");
Object.defineProperty(exports, "createAcademicReviewPrompt", { enumerable: true, get: function () { return createAcademicPrompt_1.createAcademicReviewPrompt; } });
var generateAcademicReview_1 = require("./generateAcademicReview");
Object.defineProperty(exports, "generateAcademicReviewObject", { enumerable: true, get: function () { return generateAcademicReview_1.generateAcademicReviewObject; } });
Object.defineProperty(exports, "generateAcademicReviewText", { enumerable: true, get: function () { return generateAcademicReview_1.generateAcademicReviewText; } });
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
                    throw error; // Not retryable, rethrow immediately
                }
                if (attempt >= maxAttempts) {
                    break; // Will throw the last error after the loop
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
 * GitHub の PR 情報を取得
 */
function fetchPullRequest(octokit, owner, repo, pullNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data } = yield octokit.pulls.get({
            owner,
            repo,
            pull_number: pullNumber,
        });
        return data;
    });
}
/**
 * GitHub の PR のファイル情報を取得
 */
function fetchPullRequestFiles(octokit, owner, repo, pullNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data } = yield octokit.pulls.listFiles({
            owner,
            repo,
            pull_number: pullNumber,
        });
        return data;
    });
}
/**
 * 除外パスリスト (excludePaths) に該当しないファイルだけをフィルタする
 */
function filterFiles(files, excludePaths) {
    return files.filter((file) => {
        return !excludePaths.some((pattern) => (0, minimatch_1.minimatch)(file.filename, pattern, { matchBase: true }));
    });
}
function parseFiles(files) {
    return files.map((file) => {
        if (!file.patch) {
            return Object.assign(Object.assign({}, file), { patch: [] });
        }
        return Object.assign(Object.assign({}, file), { patch: (0, diff_1.parsePatch)(file.patch) });
    });
}
/**
 * AI に投げるプロンプトを生成する
 */
function createReviewPrompt({ prTitle, prBody, diffText, language, }) {
    return `
You are an experienced professor in the School of Science and Engineering.
Please review the code changes in the following Pull Request and point out potential problems or areas for improvement only if they are significant.
Important rules about the diff format:
- Lines that begin with "-" are lines that have been **removed** in this Pull Request.
- Lines that begin with "+" are lines that have been **added** in this Pull Request.
- Lines that begin with a space " " are context lines, which have not changed.

Review guidelines:
- Ignore changes that only involve whitespace, indentation, or formatting that do not affect the code's behavior.
- Do not add any review comments for trivial or non-impactful changes (e.g., variable-name changes that do not affect logic).
- For suggestions, assign a priority. Only the following labels are allowed: HIGH, MEDIUM, LOW, or POSITIVE.
- Use type=POSITIVE only for changes that bring a clear, significant improvement to readability, performance, or maintainability. If a change is merely “not a problem,” do not comment on it.
- Your review must be written in ${language}.


Pull Request Title: ${prTitle}
Pull Request Body: ${prBody}

Diffs:
${diffText}
`;
}
/** 実際に GitHub に投稿する関数 */
const realPostReviewComment = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { octokit, owner, repo, pullNumber, reviewCommentContent } = params;
    yield octokit.pulls.createReview(Object.assign({ owner,
        repo, pull_number: pullNumber, event: "COMMENT" }, reviewCommentContent));
});
exports.realPostReviewComment = realPostReviewComment;
/** dryRun用の疑似投稿関数 */
const dryRunPostReviewComment = (params) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("--- DryRun Mode ---");
    console.log(`Would post review to ${params.owner}/${params.repo}#${params.pullNumber}`);
    console.log("Review Comment:");
    console.log(params.reviewCommentContent);
});
exports.dryRunPostReviewComment = dryRunPostReviewComment;
/**
 * Hunk を行番号付きの文字列にフォーマットする
 */
function formatHunkWithLineNumbers(hunk) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    // @@ -oldStart,oldLines +newStart,newLines @@ のヘッダー
    const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    // 各行に対して行番号を付与
    const formattedLines = hunk.lines.map((line) => {
        let lineNumbers = "";
        switch (line[0]) {
            case "-":
                // 削除行の場合: oldLine のみインクリメント
                lineNumbers = `${oldLine.toString().padStart(4, " ")}      `;
                oldLine++;
                break;
            case "+":
                // 追加行の場合: newLine のみインクリメント
                lineNumbers = `     ${newLine.toString().padStart(4, " ")}`;
                newLine++;
                break;
            default:
                // コンテキスト行の場合: oldLine/newLine 両方をインクリメント
                lineNumbers = `${oldLine.toString().padStart(4, " ")} ${newLine
                    .toString()
                    .padStart(4, " ")}`;
                oldLine++;
                newLine++;
                break;
        }
        return `${lineNumbers} | ${line}`;
    });
    return [hunkHeader, ...formattedLines].join("\n");
}
/**
 * ParsedDiff を使って読みやすい形に差分を整形する
 */
function createReadableDiffForFile(file) {
    const { filename, patch } = file;
    // "patch" is ParsedDiff[], so we can iterate through each diff
    const diffTexts = patch.map((diff, diffIndex) => {
        const headerInfo = [
            diff.index ? `Index: ${diff.index}` : "",
            diff.oldFileName ? `Old file: ${diff.oldFileName}` : "",
            diff.newFileName ? `New file: ${diff.newFileName}` : "",
        ]
            .filter(Boolean)
            .join("\n");
        // Format each hunk with line numbers
        const hunksText = diff.hunks
            .map((hunk) => formatHunkWithLineNumbers(hunk))
            .join("\n\n");
        return [
            `Diff #${diffIndex + 1} for ${filename}`,
            headerInfo,
            hunksText,
        ]
            .filter(Boolean)
            .join("\n") + "\n";
    });
    return diffTexts.join("\n");
}
/**
 * ParsedPullRequestFile[] をまとめて差分テキスト(diffText)に変換する
 */
function createParsedDiffText(parsedFiles) {
    return parsedFiles
        .map((file) => {
        return `---\nFile: ${file.filename}\n${createReadableDiffForFile(file)}`;
    })
        .join("\n");
}
const generateReviewCommentText = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { modelCode, userPrompt } = params;
    const { text } = yield (0, ai_1.generateText)({
        model: (0, google_1.google)(modelCode),
        prompt: userPrompt,
    });
    return { body: text };
});
exports.generateReviewCommentText = generateReviewCommentText;
const generateReviewCommentObject = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { modelCode, userPrompt } = params;
    // read testPrompt from a file named "testPrompt.txt` in the same directory
    // this file is comes from: https://github.com/Nasubikun/ai-reviewer/issues/1
    // const testPromptPath = path.join(process.cwd(), 'src', 'utils', 'testPrompt.txt');
    // const testPromptText = await fs.readFile(testPromptPath, 'utf-8');
    const commentSchema = zod_1.z.object({
        path: zod_1.z
            .string()
            .describe("Specifies the relative path to the file where the review comment should be posted. " +
            "For example, 'src/index.js'. This path must match the file path in the Pull Request."),
        body: zod_1.z
            .string()
            .describe("The content of the comment that will be displayed on the specified line of the Pull Request. " +
            "This message should clearly explain the suggestion or feedback related to that line."),
        line: zod_1.z
            .number()
            .positive()
            .describe("The 1-based line number where the comment is placed. " +
            "This corresponds to the modified (new) line in the diff or the final file."),
        priority: zod_1.z
            .enum(["HIGH", "MEDIUM", "LOW", "POSITIVE"])
            .describe("The priority of this fix. For suggestions, set its priority as like 'HIGH', 'MEDIUM', or 'LOW'. For positive comments, it should be 'POSITIVE'."),
    });
    const reviewSchema = zod_1.z.object({
        body: zod_1.z
            .string()
            .describe("Represents the overall body text of the review, providing a summary or context for the accompanying line-level comments."),
        comments: zod_1.z.array(commentSchema),
    });
    try {
        // Use the retry mechanism for handling NoObjectGeneratedError
        const { object } = yield withRetry((...args_1) => __awaiter(void 0, [...args_1], void 0, function* (attempt = 1) {
            return yield (0, ai_1.generateObject)({
                schema: reviewSchema,
                model: (0, google_1.google)(modelCode),
                prompt: userPrompt,
                // Use temperature 0 for first attempt, 0.5 for retries
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
        const iconMap = {
            "HIGH": ":rotating_light:",
            "MEDIUM": ":warning:",
            "LOW": ":information_source:",
            "POSITIVE": ":sparkles:"
        };
        const priorityOrder = {
            "HIGH": 0,
            "MEDIUM": 1,
            "LOW": 2,
            "POSITIVE": 999
        };
        return {
            body: object.body,
            comments: object.comments
                .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
                .map((comment) => {
                return Object.assign(Object.assign({}, comment), { body: `${iconMap[comment.priority]} [${comment.priority}] ${comment.body}`, priority: undefined });
            }),
        };
    }
    catch (error) {
        // If object generation fails after all retries, fall back to text generation
        console.log("Failed to generate structured review after all retries. Falling back to text generation.");
        return yield (0, exports.generateReviewCommentText)(params);
    }
});
exports.generateReviewCommentObject = generateReviewCommentObject;
function runReviewBotVercelAI(_a) {
    return __awaiter(this, arguments, void 0, function* ({ githubToken, owner, repo, pullNumber, excludePaths, language, modelCode, generateReviewCommentFn, postReviewCommentFn, createPromptFn = createReviewPrompt, }) {
        try {
            const octokit = new rest_1.Octokit({ auth: githubToken });
            // 1. PRデータの取得
            const prData = yield fetchPullRequest(octokit, owner, repo, pullNumber);
            // 2. ファイル一覧の取得
            const filesData = yield fetchPullRequestFiles(octokit, owner, repo, pullNumber);
            // 3. 除外パスのフィルタリング
            const filteredFiles = filterFiles(filesData, excludePaths);
            // 4. ParsedPatch化
            const parsedFilesData = parseFiles(filteredFiles);
            // 5. 差分テキストの生成
            const diffText = createParsedDiffText(parsedFilesData);
            // 6. プロンプトの生成
            const userPrompt = createPromptFn({
                prTitle: prData.title,
                prBody: prData.body,
                diffText,
                language,
            });
            console.log("--- Prompt ---");
            console.log(userPrompt);
            // 7. AI にレビュー文を生成してもらう (with improved error handling)
            let reviewCommentContent;
            try {
                reviewCommentContent = yield generateReviewCommentFn({ modelCode, userPrompt });
            }
            catch (error) {
                console.error("Failed to generate review comment after retries:", error);
                throw error; // Re-throw to be caught by the outer try-catch
            }
            console.log("--- Review ---");
            console.log(reviewCommentContent);
            // 8. GitHub にレビュー文を投稿
            yield postReviewCommentFn({
                octokit,
                owner,
                repo,
                pullNumber,
                reviewCommentContent,
            });
        }
        catch (error) {
            console.error("Error in runReviewBotVercelAI:", error);
            throw error;
        }
    });
}
