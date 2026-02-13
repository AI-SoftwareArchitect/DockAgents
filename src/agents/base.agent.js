/**
 * Abstract base for all agents.
 *
 * Open/Closed Principle: New agents extend BaseAgent without touching existing code.
 * Liskov Substitution: Every agent can be used wherever BaseAgent is expected.
 */

import { getLLM } from "../core/llm.js";
import { getLogger } from "../core/logger.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export class BaseAgent {
    /**
     * @param {string} name - Agent name for logging.
     */
    constructor(name) {
        if (new.target === BaseAgent) {
            throw new Error("BaseAgent is abstract and cannot be instantiated directly.");
        }
        this.llm = getLLM();
        this.logger = getLogger(name);
    }

    /**
     * Return the system-level prompt for the agent.
     * Must be overridden by subclasses.
     * @returns {string}
     */
    getSystemPrompt() {
        throw new Error("getSystemPrompt() must be implemented by subclass.");
    }

    /**
     * Send a system + user message pair to the LLM and return the text.
     * @param {string} systemPrompt
     * @param {string} userMessage
     * @returns {Promise<string>}
     */
    async invokeLLM(systemPrompt, userMessage) {
        const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(userMessage),
        ];
        const response = await this.llm.invoke(messages);
        return typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);
    }

    /**
     * Safely parse JSON from LLM output, tolerating code fences.
     * @param {string} text
     * @returns {object}
     */
    safeParseJSON(text) {
        let cleaned = text.trim();
        if (cleaned.startsWith("```")) {
            const lines = cleaned.split("\n");
            const filtered = lines.filter((l) => !l.trim().startsWith("```"));
            cleaned = filtered.join("\n");
        }
        try {
            return JSON.parse(cleaned);
        } catch {
            return { raw: cleaned };
        }
    }

    /**
     * Remove markdown code fences if present.
     * @param {string} text
     * @returns {string}
     */
    stripCodeFences(text) {
        let stripped = text.trim();
        if (stripped.startsWith("```")) {
            const lines = stripped.split("\n");
            if (lines[0].trim().startsWith("```")) lines.shift();
            if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
            return lines.join("\n").trim();
        }
        return stripped;
    }
}
