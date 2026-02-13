/**
 * LLM client factory.
 * Single Responsibility: Creates and provides the ChatOpenAI instance.
 * Open/Closed: New LLM providers can be added without modifying existing code.
 */

import { ChatOpenAI } from "@langchain/openai";
import config from "./config.js";

let _instance = null;

/**
 * Return a singleton ChatOpenAI instance.
 * @returns {ChatOpenAI}
 */
export function getLLM() {
    if (!_instance) {
        _instance = new ChatOpenAI({
            modelName: config.openaiModel,
            openAIApiKey: config.openaiApiKey,
            temperature: 0.2,
        });
    }
    return _instance;
}
