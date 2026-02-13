/**
 * Security Validator Agent – validates docker-compose.yaml for security issues.
 *
 * Single Responsibility: Analyse a compose file and produce a SecurityReport.
 */

import { BaseAgent } from "./base.agent.js";
import { getVectorDBService } from "../services/vectordb.service.js";

export class SecurityValidatorAgent extends BaseAgent {
    constructor() {
        super("SecurityValidatorAgent");
        this._vectordb = getVectorDBService();
    }

    getSystemPrompt() {
        return (
            "You are a Docker security expert. Your job is to audit a " +
            "docker-compose.yaml file for security vulnerabilities and " +
            "misconfigurations.\n\n" +
            "You MUST respond with a JSON object in this exact format:\n" +
            "{\n" +
            '  "is_secure": true/false,\n' +
            '  "issues": [\n' +
            "    {\n" +
            '      "severity": "low|medium|high|critical",\n' +
            '      "description": "...",\n' +
            '      "recommendation": "..."\n' +
            "    }\n" +
            "  ],\n" +
            '  "summary": "..."\n' +
            "}\n\n" +
            "Set is_secure to true ONLY if there are no high or critical issues."
        );
    }

    /**
     * Run security validation on the current compose YAML.
     * @param {object} state - Workflow state.
     * @returns {Promise<object>} Updated state.
     */
    async validate(state) {
        this.logger.info("Validating compose security…");

        // Retrieve relevant security rules from VectorDB
        const secRules = await this._vectordb.querySecurityRules(
            state.composeYaml,
            5
        );
        state.retrievedSecurityRules = secRules;

        const rulesBlock =
            secRules.length > 0
                ? secRules.map((r) => `- ${r}`).join("\n")
                : "No specific rules retrieved.";

        const userMessage =
            `docker-compose.yaml to audit:\n\`\`\`yaml\n${state.composeYaml}\n\`\`\`\n\n` +
            `Security rules to check against:\n${rulesBlock}\n\n` +
            "Perform a thorough security audit and respond with the JSON format " +
            "described in your system prompt.";

        const raw = await this.invokeLLM(this.getSystemPrompt(), userMessage);
        state.securityReport = this._parseReport(raw);
        return state;
    }

    /**
     * Parse LLM output into a SecurityReport object, with fallback.
     * @private
     * @param {string} raw
     * @returns {object}
     */
    _parseReport(raw) {
        let cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            const lines = cleaned.split("\n");
            const filtered = lines.filter((l) => !l.trim().startsWith("```"));
            cleaned = filtered.join("\n");
        }

        try {
            const data = JSON.parse(cleaned);
            return {
                isSecure: data.is_secure ?? false,
                issues: (data.issues || []).map((issue) => ({
                    severity: issue.severity,
                    description: issue.description,
                    recommendation: issue.recommendation,
                })),
                summary: data.summary || "",
            };
        } catch (err) {
            this.logger.warn(`Failed to parse security report: ${err.message}`);
            return {
                isSecure: false,
                issues: [
                    {
                        severity: "high",
                        description: "Could not parse security report from LLM.",
                        recommendation: "Review the compose file manually.",
                    },
                ],
                summary: `Parse error: ${err.message}`,
            };
        }
    }
}
