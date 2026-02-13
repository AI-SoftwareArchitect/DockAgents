/**
 * Express router for the /chat endpoint.
 *
 * Single Responsibility: Handles HTTP concerns only, delegates to the workflow.
 */

import { Router } from "express";
import { getWorkflow } from "../workflow/graph.js";
import config from "../core/config.js";
import { getLogger } from "../core/logger.js";

const logger = getLogger("ChatRouter");
const router = Router();

/**
 * POST /chat
 * Main entry point – processes the user prompt through the agent workflow.
 */
router.post("/chat", async (req, res) => {
    const { prompt } = req.body;

    // Validate input
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({
            error: "Validation Error",
            message: "The 'prompt' field is required and must be a non-empty string.",
        });
    }

    logger.info(`Received prompt: ${prompt.substring(0, 120)}…`);

    // Prepare initial workflow state
    const initialState = {
        userPrompt: prompt.trim(),
        enrichedPrompt: "",
        orchestratorDecision: null,
        composeYaml: "",
        securityReport: null,
        currentIteration: 0,
        maxIterations: config.maxRetryLoops,
        status: "pending",
        retrievedRules: [],
        retrievedSecurityRules: [],
    };

    try {
        const workflow = getWorkflow();
        const finalState = await workflow.invoke(initialState);

        // Build response
        const securityReport = finalState.securityReport
            ? JSON.stringify(finalState.securityReport, null, 2)
            : "No security report generated.";

        return res.json({
            compose_yaml: finalState.composeYaml || "",
            security_report: securityReport,
            iterations: finalState.currentIteration || 0,
            status: finalState.status || "failed",
        });
    } catch (err) {
        logger.error(`Workflow execution failed: ${err.message}`);
        return res.status(500).json({
            error: "Workflow Error",
            message: `Workflow execution error: ${err.message}`,
        });
    }
});

export default router;
