import { 
    dryRunPostReviewComment, 
    generateReviewCommentObject, 
    runReviewBotVercelAI,
    createAcademicReviewPrompt,
    generateAcademicReviewObject,
    createReviewPrompt
} from "./utils";

import dotenv from "dotenv"
dotenv.config()

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER
const REPO = process.env.GITHUB_REPO
const EXCLUDE_PATHS = process.env.EXCLUDE_PATHS?.split(',').map(p => p.trim()) || [];
const LANGUAGE = process.env.LANGUAGE || "English"
const PR_NUMBER = Number(process.env.GITHUB_PR_NUMBER) || 1;
const MODEL_CODE = process.env.MODEL_CODE || "models/gemini-2.0-flash"
const REVIEW_MODE = process.env.REVIEW_MODE || "CODE"

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
const promptFn = isAcademicMode ? createAcademicReviewPrompt : createReviewPrompt;
const generateFn = isAcademicMode ? generateAcademicReviewObject : generateReviewCommentObject;

runReviewBotVercelAI({
    githubToken: GITHUB_TOKEN,
    owner: OWNER,
    repo: REPO,
    excludePaths: EXCLUDE_PATHS,
    language: LANGUAGE,
    pullNumber: PR_NUMBER,
    modelCode: MODEL_CODE,
    generateReviewCommentFn: generateFn,
    postReviewCommentFn: dryRunPostReviewComment,
    createPromptFn: promptFn
})