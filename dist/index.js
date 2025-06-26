"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const EXCLUDE_PATHS = ((_a = process.env.EXCLUDE_PATHS) === null || _a === void 0 ? void 0 : _a.split(',').map(p => p.trim())) || [];
const LANGUAGE = process.env.LANGUAGE || "English";
const PR_NUMBER = Number(process.env.GITHUB_PR_NUMBER) || 1;
const MODEL_CODE = process.env.MODEL_CODE || "models/gemini-2.0-flash";
const USE_SINGLE_COMMENT_REVIEW = process.env.USE_SINGLE_COMMENT_REVIEW === 'true';
const REVIEW_MODE = process.env.REVIEW_MODE || "CODE";
if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing");
}
if (!OWNER) {
    throw new Error("OWNER is missing");
}
if (!REPO) {
    throw new Error("REPO is missing");
}
// レビューモードに応じて適切な関数を選択
const isAcademicMode = REVIEW_MODE === "ACADEMIC";
const promptFn = isAcademicMode ? utils_1.createAcademicReviewPrompt : utils_1.createReviewPrompt;
const generateFn = USE_SINGLE_COMMENT_REVIEW
    ? (isAcademicMode ? utils_1.generateAcademicReviewText : utils_1.generateReviewCommentText)
    : (isAcademicMode ? utils_1.generateAcademicReviewObject : utils_1.generateReviewCommentObject);
(0, utils_1.runReviewBotVercelAI)({
    githubToken: GITHUB_TOKEN,
    owner: OWNER,
    repo: REPO,
    excludePaths: EXCLUDE_PATHS,
    language: LANGUAGE,
    pullNumber: PR_NUMBER,
    modelCode: MODEL_CODE,
    generateReviewCommentFn: generateFn,
    postReviewCommentFn: utils_1.realPostReviewComment,
    createPromptFn: promptFn
});
