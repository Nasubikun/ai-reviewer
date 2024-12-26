import { dryRunPostReviewComment, runReviewBotVercelAI } from "./utils";

import dotenv from "dotenv"
dotenv.config()

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER
const REPO = process.env.GITHUB_REPO
const EXCLUDE_PATHS = process.env.EXCLUDE_PATHS?.split(',').map(p => p.trim()) || [];
const LANGUAGE = process.env.LANGUAGE || "English"
const PR_NUMBER = Number(process.env.GITHUB_PR_NUMBER) || 1;
const MODEL_CODE = process.env.MODEL_CODE || "models/gemini-2.0-flash-exp"

if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing");
}
if (!OWNER) {
    throw new Error("OWNER is missing");
}
if (!REPO) {
    throw new Error("REPO is missing");
}
runReviewBotVercelAI({
    githubToken: GITHUB_TOKEN,
    owner: OWNER,
    repo: REPO,
    excludePaths: EXCLUDE_PATHS,
    language: LANGUAGE,
    pullNumber: PR_NUMBER,
    modelCode: MODEL_CODE,
    postReviewCommentFn: dryRunPostReviewComment
})