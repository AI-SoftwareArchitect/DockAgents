/**
 * Orchestrator Agent – the decision maker.
 *
 * Responsibilities:
 * 1. Enrich the user prompt with relevant rules from VectorDB.
 * 2. Evaluate the security report and decide whether to retry.
 * 3. Provide actionable feedback to Compose Builder on retries.
 */

import { BaseAgent } from "./base.agent.js";
import { getVectorDBService } from "../services/vectordb.service.js";

export class OrchestratorAgent extends BaseAgent {
    constructor() {
        super("OrchestratorAgent");
        this._vectordb = getVectorDBService();
    }

    getSystemPrompt() {
        return (
            "You are the Orchestrator Agent for a Docker Compose generation system.\n" +
            "Your role is to:\n" +
            "1. Analyse the user's prompt and enrich it with best-practice rules.\n" +
            "2. After security validation, decide if the compose file is acceptable.\n" +
            "3. If not, provide concrete feedback so the Compose Builder can fix issues.\n\n" +
            "Always respond in valid JSON."
        );
    }

    /**
     * Phase 1: Query VectorDB for relevant rules, build enriched prompt.
     * @param {object} state - Workflow state.
     * @returns {Promise<object>} Updated state.
     */
    async enrichPrompt(state) {
        this.logger.info("Enriching user prompt with compose rules…");

        const rules = await this._vectordb.queryComposeRules(state.userPrompt, 5);
        state.retrievedRules = rules;

        const rulesBlock =
            rules.length > 0 ? rules.map((r) => `- ${r}`).join("\n") : "None";

        const userMessage =
            `User request:\n${state.userPrompt}\n\n` +
            `Relevant compose best-practice rules:\n${rulesBlock}\n\n` +
            "Create an enriched, detailed prompt that the Compose Builder agent " +
            "should use to generate a production-ready docker-compose.yaml. " +
            "Include specific instructions derived from the rules above.\n\n" +
            'Respond with a JSON object: {"enriched_prompt": "..."}';

        const raw = await this.invokeLLM(this.getSystemPrompt(), userMessage);
        const parsed = this.safeParseJSON(raw);
        state.enrichedPrompt = parsed.enriched_prompt || raw;
        return state;
    }

    /**
     * Phase 2: Read security report, decide retry / accept / fail.
     * @param {object} state - Workflow state.
     * @returns {Promise<object>} Updated state.
     */
    async evaluateAndDecide(state) {
        this.logger.info(
            `Evaluating security report (iteration ${state.currentIteration}/${state.maxIterations})…`
        );

        const reportText = state.securityReport
            ? JSON.stringify(state.securityReport, null, 2)
            : "No report available.";

        const userMessage =
            `Current docker-compose.yaml:\n\`\`\`yaml\n${state.composeYaml}\n\`\`\`\n\n` +
            `Security report:\n${reportText}\n\n` +
            `Iteration: ${state.currentIteration}/${state.maxIterations}\n\n` +
            "Decide:\n" +
            "- If the compose is secure (no high/critical issues), set should_retry=false.\n" +
            "- If there are fixable issues AND iterations remain, set should_retry=true " +
            "and provide feedback.\n" +
            "- If max iterations reached, set should_retry=false.\n\n" +
            'Respond with JSON: { "should_retry": bool, "feedback": "...", "extra_rules": ["..."] }';

        const raw = await this.invokeLLM(this.getSystemPrompt(), userMessage);
        const parsed = this.safeParseJSON(raw);

        state.orchestratorDecision = {
            shouldRetry: parsed.should_retry || false,
            feedback: parsed.feedback || "",
            extraRules: parsed.extra_rules || [],
        };

        return state;
    }
}
