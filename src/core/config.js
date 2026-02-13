/**
 * Application configuration.
 * Single Responsibility: Only handles configuration loading and validation.
 */

import dotenv from "dotenv";

dotenv.config();

const config = Object.freeze({
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
  maxRetryLoops: parseInt(process.env.MAX_RETRY_LOOPS || "3", 10),
  chromaHost: process.env.CHROMA_HOST || "localhost",
  chromaPort: parseInt(process.env.CHROMA_PORT || "8001", 10),
  port: parseInt(process.env.PORT || "8000", 10),
  logLevel: process.env.LOG_LEVEL || "info",
});

export default config;
