/**
 * DockAgents – Express application entry point.
 *
 * Single Responsibility: Wire together the application components and start the server.
 */

import express from "express";
import cors from "cors";
import config from "./core/config.js";
import { getLogger } from "./core/logger.js";
import { getVectorDBService } from "./services/vectordb.service.js";
import chatRouter from "./api/chat.router.js";

const logger = getLogger("App");
const app = express();

// ─── Middleware ──────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ─── Routes ─────────────────────────────────────────────────

app.use("/", chatRouter);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

// ─── Startup ────────────────────────────────────────────────

async function start() {
    try {
        // Eagerly initialise VectorDB so rules are seeded
        logger.info("🚀 DockAgents is starting up…");
        const vectordb = getVectorDBService();
        await vectordb.init();
        logger.info("✅ VectorDB initialized and rules seeded.");

        app.listen(config.port, () => {
            logger.info(`🚀 DockAgents running on http://localhost:${config.port}`);
            logger.info(`📖 Health check: http://localhost:${config.port}/health`);
        });
    } catch (err) {
        logger.error(`Failed to start DockAgents: ${err.message}`);
        process.exit(1);
    }
}

start();

export default app;
