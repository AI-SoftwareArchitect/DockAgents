/**
 * Compose Builder Agent – generates docker-compose.yaml.
 *
 * Single Responsibility: Generates valid docker-compose YAML from an enriched prompt.
 */

import { BaseAgent } from "./base.agent.js";

export class ComposeBuilderAgent extends BaseAgent {
    constructor() {
        super("ComposeBuilderAgent");
    }

    getSystemPrompt() {
        return (
            "You are a Docker Compose expert. Your ONLY job is to generate a valid, " +
            "production-ready docker-compose.yaml file.\n\n" +
            "Rules:\n" +
            "- Output ONLY the raw YAML content, no markdown fences, no explanation.\n" +
            "- Use compose file version 3.8+.\n" +
            "- Follow every instruction in the enriched prompt precisely.\n" +
            "- Apply all best-practice and security rules provided.\n" +
            "- If feedback from a previous iteration is given, address every point."
        );
    }

    /**
     * Generate or regenerate the docker-compose.yaml.
     * @param {object} state - Workflow state.
     * @returns {Promise<object>} Updated state.
     */
    async build(state) {
        this.logger.info("Building docker-compose.yaml…");

        const parts = [`Enriched prompt:\n${state.enrichedPrompt}`];

        // Include previous feedback if this is a retry
        if (state.orchestratorDecision?.feedback) {
            parts.push(
                `\n\nPrevious security feedback (MUST fix ALL issues):\n${state.orchestratorDecision.feedback}`
            );
        }

        if (state.composeYaml) {
            parts.push(
                `\n\nPrevious YAML (use as starting point, fix issues):\n\`\`\`yaml\n${state.composeYaml}\n\`\`\``
            );
        }

        // Include any extra rules the orchestrator found
        if (state.orchestratorDecision?.extraRules?.length) {
            const extra = state.orchestratorDecision.extraRules
                .map((r) => `- ${r}`)
                .join("\n");
            parts.push(`\n\nAdditional rules to follow:\n${extra}`);
        }

        const userMessage = parts.join("\n");
        const yamlOutput = await this.invokeLLM(
            this.getSystemPrompt(),
            userMessage
        );

        state.composeYaml = this.stripCodeFences(yamlOutput);
        return state;
    }
}
