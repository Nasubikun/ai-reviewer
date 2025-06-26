import { generateText, generateObject, NoObjectGeneratedError } from "ai";
import { google } from "@ai-sdk/google";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { minimatch } from "minimatch";
import { components } from "@octokit/openapi-types";
import { Hunk, ParsedDiff, parsePatch } from "diff";
import { z } from "zod"
import * as fs from 'fs/promises';
import * as path from 'path';

// 学術論文レビュー用の関数をインポート
export { createAcademicReviewPrompt } from './createAcademicPrompt';
export { generateAcademicReviewObject, generateAcademicReviewText } from './generateAcademicReview';

/**
 * Generic retry function with exponential backoff
 */
async function withRetry<T>(
    operation: (attempt?: number) => Promise<T>,
    options: {
        maxAttempts: number;
        initialDelayMs: number;
        backoffFactor: number;
        retryableError: (error: any) => boolean;
        onRetry?: (attempt: number, error: any) => void;
    }
): Promise<T> {
    const { maxAttempts, initialDelayMs, backoffFactor, retryableError, onRetry } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation(attempt);
        } catch (error) {
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

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    throw lastError;
}

// OpenAPI型定義から直接Pull Requestの型を取得
type PullRequestData = components["schemas"]["pull-request"];
type PullRequestFile = components["schemas"]["diff-entry"];
type PullRequestFiles = PullRequestFile[];

type ParsedPullRequestFile = Omit<PullRequestFile, "patch"> & {
    patch: ParsedDiff[];
};

export type GenerateReviewCommentFnParams = {
    modelCode: string;
    userPrompt: string;
}

type PostReviewCommentParams = {
    octokit: Octokit;
    owner: string;
    repo: string;
    pullNumber: number;
    reviewCommentContent: ReviewCommentContent
}

type PostReviewCommentFn = (params: PostReviewCommentParams) => Promise<void>;

interface ReviewBotOptions {
    githubToken: string;
    owner: string;
    repo: string;
    pullNumber: number;
    excludePaths: string[];
    language: string;
    modelCode: string;
    generateReviewCommentFn: GenerateReviewCommentFn
    postReviewCommentFn: PostReviewCommentFn;
    createPromptFn?: typeof createReviewPrompt;
}

export type GenerateReviewCommentFn = (params: GenerateReviewCommentFnParams) => Promise<ReviewCommentContent>
export type ReviewCommentContent = Pick<RestEndpointMethodTypes["pulls"]["createReview"]["parameters"], "body" | "comments">

/**
 * GitHub の PR 情報を取得
 */
export async function fetchPullRequest(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number
): Promise<PullRequestData> {
    const { data }: { data: PullRequestData } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
    });
    return data;
}

/**
 * GitHub の PR のファイル情報を取得
 */
export async function fetchPullRequestFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number
): Promise<PullRequestFiles> {
    const { data }: { data: PullRequestFiles } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
    });
    return data;
}

/**
 * 除外パスリスト (excludePaths) に該当しないファイルだけをフィルタする
 */
export function filterFiles(
    files: PullRequestFiles,
    excludePaths: string[]
): PullRequestFiles {
    return files.filter((file) => {
        return !excludePaths.some((pattern) =>
            minimatch(file.filename, pattern, { matchBase: true })
        );
    });
}

export function parseFiles(files: PullRequestFiles): ParsedPullRequestFile[] {
    return files.map((file) => {
        if (!file.patch) {
            return { ...file, patch: [] };
        }
        return {
            ...file,
            patch: parsePatch(file.patch),
        };
    });
}

/**
 * AI に投げるプロンプトを生成する
 */
export function createReviewPrompt({
    prTitle,
    prBody,
    diffText,
    language,
}: {
    prTitle: string;
    prBody: string | null;
    diffText: string;
    language: string;
}): string {
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
export const realPostReviewComment: PostReviewCommentFn = async (params) => {
    const { octokit, owner, repo, pullNumber, reviewCommentContent } = params;
    await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        event: "COMMENT",
        ...reviewCommentContent
    });
}

/** dryRun用の疑似投稿関数 */
export const dryRunPostReviewComment: PostReviewCommentFn = async (params) => {
    console.log("--- DryRun Mode ---");
    console.log(
        `Would post review to ${params.owner}/${params.repo}#${params.pullNumber}`
    );
    console.log("Review Comment:");
    console.log(params.reviewCommentContent);
}

/**
 * Hunk を行番号付きの文字列にフォーマットする
 */
function formatHunkWithLineNumbers(hunk: Hunk): string {
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
function createReadableDiffForFile(file: ParsedPullRequestFile): string {
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
export function createParsedDiffText(parsedFiles: ParsedPullRequestFile[]): string {
    return parsedFiles
        .map((file) => {
            return `---\nFile: ${file.filename}\n${createReadableDiffForFile(file)}`;
        })
        .join("\n");
}

export const generateReviewCommentText: GenerateReviewCommentFn = async (params) => {
    const { modelCode, userPrompt } = params
    const { text } = await generateText({
        model: google(modelCode),
        prompt: userPrompt,
    });

    return { body: text }
}

export const generateReviewCommentObject: GenerateReviewCommentFn = async (params) => {
    const { modelCode, userPrompt } = params;

    // read testPrompt from a file named "testPrompt.txt` in the same directory
    // this file is comes from: https://github.com/Nasubikun/ai-reviewer/issues/1
    // const testPromptPath = path.join(process.cwd(), 'src', 'utils', 'testPrompt.txt');
    // const testPromptText = await fs.readFile(testPromptPath, 'utf-8');

    const commentSchema = z.object({
        path: z
            .string()
            .describe(
                "Specifies the relative path to the file where the review comment should be posted. " +
                "For example, 'src/index.js'. This path must match the file path in the Pull Request."
            ),
        body: z
            .string()
            .describe(
                "The content of the comment that will be displayed on the specified line of the Pull Request. " +
                "This message should clearly explain the suggestion or feedback related to that line."
            ),
        line: z
            .number()
            .positive()
            .describe(
                "The 1-based line number where the comment is placed. " +
                "This corresponds to the modified (new) line in the diff or the final file."
            ),
        priority: z
            .enum(["HIGH", "MEDIUM", "LOW", "POSITIVE"])
            .describe(
                "The priority of this fix. For suggestions, set its priority as like 'HIGH', 'MEDIUM', or 'LOW'. For positive comments, it should be 'POSITIVE'."
            ),
    });

    const reviewSchema = z.object({
        body: z
            .string()
            .describe(
                "Represents the overall body text of the review, providing a summary or context for the accompanying line-level comments."
            ),
        comments: z.array(commentSchema),
    });

    try {
        // Use the retry mechanism for handling NoObjectGeneratedError
        const { object } = await withRetry(
            async (attempt = 1) => {
                return await generateObject({
                    schema: reviewSchema,
                    model: google(modelCode),
                    prompt: userPrompt,
                    // Use temperature 0 for first attempt, 0.5 for retries
                    temperature: attempt === 1 ? 0 : 0.5
                });
            },
            {
                maxAttempts: 3,
                initialDelayMs: 2000,
                backoffFactor: 1.5,
                retryableError: (error) => {
                    return error instanceof NoObjectGeneratedError;
                },
                onRetry: (attempt, error) => {
                    console.log(`Retry attempt ${attempt} after error: ${error.message}`);
                }
            }
        );

        const iconMap = {
            "HIGH": ":rotating_light:",
            "MEDIUM": ":warning:",
            "LOW": ":information_source:",
            "POSITIVE": ":sparkles:"
        } as const;

        const priorityOrder = {
            "HIGH": 0,
            "MEDIUM": 1,
            "LOW": 2,
            "POSITIVE": 999
        } as const;

        return {
            body: object.body,
            comments: object.comments
                .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
                .map((comment) => {
                    return {
                        ...comment,
                        body: `${iconMap[comment.priority]} [${comment.priority}] ${comment.body}`,
                        priority: undefined,
                    };
                }),
        };
    } catch (error) {
        // If object generation fails after all retries, fall back to text generation
        console.log("Failed to generate structured review after all retries. Falling back to text generation.");
        return await generateReviewCommentText(params);
    }
}

export async function runReviewBotVercelAI({
    githubToken,
    owner,
    repo,
    pullNumber,
    excludePaths,
    language,
    modelCode,
    generateReviewCommentFn,
    postReviewCommentFn,
    createPromptFn = createReviewPrompt,
}: ReviewBotOptions) {
    try {
        const octokit = new Octokit({ auth: githubToken });

        // 1. PRデータの取得
        const prData = await fetchPullRequest(octokit, owner, repo, pullNumber);

        // 2. ファイル一覧の取得
        const filesData = await fetchPullRequestFiles(octokit, owner, repo, pullNumber);

        // 3. 除外パスのフィルタリング
        const filteredFiles = filterFiles(filesData, excludePaths);

        // 4. ParsedPatch化
        const parsedFilesData: ParsedPullRequestFile[] = parseFiles(filteredFiles)

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
            reviewCommentContent = await generateReviewCommentFn({ modelCode, userPrompt });
        } catch (error) {
            console.error("Failed to generate review comment after retries:", error);
            throw error; // Re-throw to be caught by the outer try-catch
        }

        console.log("--- Review ---");
        console.log(reviewCommentContent);

        // 8. GitHub にレビュー文を投稿
        await postReviewCommentFn({
            octokit,
            owner,
            repo,
            pullNumber,
            reviewCommentContent,
        });

    } catch (error) {
        console.error("Error in runReviewBotVercelAI:", error);
        throw error;
    }
}
