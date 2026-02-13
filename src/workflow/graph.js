/**
 * LangGraph workflow graph definition.
 *
 * This is the core orchestration loop described in the architecture:
 *   Client → Orchestrator (enrich) → Compose Builder → Security Validator
 *        → Orchestrator (decide) → retry or finish
 *
 * Interface Segregation: Each node has a single, focused function.
 */

import { StateGraph, END, Annotation } from "@langchain/langgraph";
import { OrchestratorAgent } from "../agents/orchestrator.agent.js";
import { ComposeBuilderAgent } from "../agents/compose-builder.agent.js";
import { SecurityValidatorAgent } from "../agents/security-validator.agent.js";
import { getLogger } from "../core/logger.js";

const logger = getLogger("Workflow");

// ─── Agent instances ────────────────────────────────────────

const orchestrator = new OrchestratorAgent();
const builder = new ComposeBuilderAgent();
const validator = new SecurityValidatorAgent();

// ─── State Annotation for LangGraph ─────────────────────────

const WorkflowAnnotation = Annotation.Root({
    userPrompt: Annotation({ reducer: (_, v) => v, default: () => "" }),
    enrichedPrompt: Annotation({ reducer: (_, v) => v, default: () => "" }),
    orchestratorDecision: Annotation({ reducer: (_, v) => v, default: () => null }),
    composeYaml: Annotation({ reducer: (_, v) => v, default: () => "" }),
    securityReport: Annotation({ reducer: (_, v) => v, default: () => null }),
    currentIteration: Annotation({ reducer: (_, v) => v, default: () => 0 }),
    maxIterations: Annotation({ reducer: (_, v) => v, default: () => 3 }),
    status: Annotation({ reducer: (_, v) => v, default: () => "pending" }),
    retrievedRules: Annotation({ reducer: (_, v) => v, default: () => [] }),
    retrievedSecurityRules: Annotation({ reducer: (_, v) => v, default: () => [] }),
});

// ─── Node functions ─────────────────────────────────────────

async function orchestratorEnrichNode(state) {
    const updated = { ...state, status: "pending" };
    const result = await orchestrator.enrichPrompt(updated);
    logger.info("✅ Prompt enriched.");
    return result;
}

async function composeBuilderNode(state) {
    const updated = { ...state, status: "building" };
    const result = await builder.build(updated);
    logger.info(`✅ docker-compose.yaml generated (${result.composeYaml.length} chars).`);
    return result;
}

async function securityValidatorNode(state) {
    const updated = {
        ...state,
        status: "validating",
        currentIteration: state.currentIteration + 1,
    };
    const result = await validator.validate(updated);
    const isSecure = result.securityReport?.isSecure || false;
    logger.info(
        `✅ Security validation done (secure=${isSecure}, iteration=${result.currentIteration}).`
    );
    return result;
}

async function orchestratorDecideNode(state) {
    const result = await orchestrator.evaluateAndDecide({ ...state });

    const decision = result.orchestratorDecision;
    if (
        decision?.shouldRetry &&
        result.currentIteration < result.maxIterations
    ) {
        result.status = "retrying";
        logger.info(
            `🔄 Orchestrator decided to RETRY (${(decision.feedback || "").substring(0, 80)}).`
        );
    } else {
        const isSecure = result.securityReport?.isSecure || false;
        result.status = isSecure ? "success" : "failed";
        logger.info(`🏁 Orchestrator decided: ${result.status}`);
    }

    return result;
}

/**
 * Conditional edge: route to retry or finish.
 * @param {object} state
 * @returns {string}
 */
function shouldRetry(state) {
    return state.status === "retrying" ? "retry" : "finish";
}

// ─── Build the graph ────────────────────────────────────────

let _compiledGraph = null;

/**
 * Build and compile the LangGraph workflow.
 * @returns {CompiledStateGraph}
 */
export function buildWorkflow() {
    const workflow = new StateGraph(WorkflowAnnotation);

    // Add nodes
    workflow.addNode("orchestrator_enrich", orchestratorEnrichNode);
    workflow.addNode("compose_builder", composeBuilderNode);
    workflow.addNode("security_validator", securityValidatorNode);
    workflow.addNode("orchestrator_decide", orchestratorDecideNode);

    // Define edges
    workflow.addEdge("__start__", "orchestrator_enrich");
    workflow.addEdge("orchestrator_enrich", "compose_builder");
    workflow.addEdge("compose_builder", "security_validator");
    workflow.addEdge("security_validator", "orchestrator_decide");

    // Conditional edge: retry or finish
    workflow.addConditionalEdges("orchestrator_decide", shouldRetry, {
        retry: "compose_builder",
        finish: END,
    });

    return workflow.compile();
}

/**
 * Return the compiled workflow (lazy singleton).
 * @returns {CompiledStateGraph}
 */
export function getWorkflow() {
    if (!_compiledGraph) {
        _compiledGraph = buildWorkflow();
    }
    return _compiledGraph;
}
