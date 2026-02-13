/**
 * ChromaDB-backed vector store for compose and security rules.
 *
 * Single Responsibility: Manages rule storage and retrieval only.
 * Dependency Inversion: Other modules depend on this abstract service,
 * not on ChromaDB internals directly.
 */

import { ChromaClient } from "chromadb";
import { getLogger } from "../core/logger.js";

const logger = getLogger("VectorDBService");

// ─── Predefined compose best-practice rules ───────────────────────

const COMPOSE_RULES = [
    {
        id: "compose_version",
        text: "Always use docker compose version 3.8 or higher for modern features.",
    },
    {
        id: "named_volumes",
        text: "Use named volumes instead of bind mounts for persistent data in production.",
    },
    {
        id: "resource_limits",
        text: "Set memory and CPU resource limits using deploy.resources.limits for every service.",
    },
    {
        id: "health_checks",
        text: "Add healthcheck configuration to every service so Docker can monitor container health.",
    },
    {
        id: "restart_policy",
        text: "Set restart policy to 'unless-stopped' or use deploy.restart_policy for resilient services.",
    },
    {
        id: "custom_network",
        text: "Define a custom bridge network instead of using the default network for better isolation.",
    },
    {
        id: "env_files",
        text: "Use env_file directive or Docker secrets instead of hardcoding environment variables in the compose file.",
    },
    {
        id: "depends_on_condition",
        text: "Use depends_on with service_healthy condition instead of plain depends_on for proper startup ordering.",
    },
    {
        id: "logging_driver",
        text: "Configure a logging driver (json-file with max-size and max-file) for each service.",
    },
    {
        id: "image_pinning",
        text: "Pin image versions with specific tags (e.g., postgres:16.1-alpine) instead of using 'latest'.",
    },
];

const SECURITY_RULES = [
    {
        id: "no_privileged",
        text: "Never use 'privileged: true' unless absolutely required. It gives container full root access to the host.",
    },
    {
        id: "no_host_network",
        text: "Avoid 'network_mode: host' as it exposes all host ports. Use custom bridge networks.",
    },
    {
        id: "read_only_fs",
        text: "Set 'read_only: true' for the container filesystem where possible, and use tmpfs for writable temp dirs.",
    },
    {
        id: "no_root_user",
        text: "Always specify 'user: <non-root-uid>' to run containers as a non-root user.",
    },
    {
        id: "drop_capabilities",
        text: "Drop all Linux capabilities with cap_drop: [ALL] and only add back what is strictly needed with cap_add.",
    },
    {
        id: "no_hardcoded_secrets",
        text: "Never hardcode passwords or API keys in the compose file. Use Docker secrets or environment variable references.",
    },
    {
        id: "expose_minimal_ports",
        text: "Only expose ports that are strictly necessary. Use 127.0.0.1:<port>:<port> instead of 0.0.0.0 for internal services.",
    },
    {
        id: "security_opt",
        text: "Use security_opt: [no-new-privileges:true] to prevent privilege escalation inside containers.",
    },
    {
        id: "limit_pids",
        text: "Set pids_limit to prevent fork bomb attacks inside containers.",
    },
    {
        id: "scan_images",
        text: "Use only official or verified images from trusted registries. Avoid unverified third-party images.",
    },
];

class VectorDBService {
    constructor() {
        this._client = null;
        this._composeCollection = null;
        this._securityCollection = null;
        this._initialized = false;
    }

    /**
     * Initialize the ChromaDB client and seed collections.
     * Must be called before using query methods.
     */
    async init() {
        if (this._initialized) return;

        this._client = new ChromaClient({ path: "http://localhost:8001" });

        // The embedder defaults to Chroma's default embedding function if omitted.
        this._composeCollection = await this._client.getOrCreateCollection({
            name: "compose_rules",
            metadata: { "hnsw:space": "cosine" },
        });

        this._securityCollection = await this._client.getOrCreateCollection({
            name: "security_rules",
            metadata: { "hnsw:space": "cosine" },
        });

        await this._seedIfEmpty();
        this._initialized = true;
        logger.info("VectorDB initialized and rules seeded.");
    }

    /**
     * Return the most relevant compose rules for the given prompt.
     * @param {string} prompt
     * @param {number} topK
     * @returns {Promise<string[]>}
     */
    async queryComposeRules(prompt, topK = 5) {
        return this._query(this._composeCollection, prompt, topK);
    }

    /**
     * Return the most relevant security rules for the given prompt.
     * @param {string} prompt
     * @param {number} topK
     * @returns {Promise<string[]>}
     */
    async querySecurityRules(prompt, topK = 5) {
        return this._query(this._securityCollection, prompt, topK);
    }

    /**
     * @private
     */
    async _query(collection, queryText, topK) {
        const count = await collection.count();
        if (count === 0) return [];

        const results = await collection.query({
            queryTexts: [queryText],
            nResults: Math.min(topK, count),
        });

        if (results.documents && results.documents[0]) {
            return results.documents[0];
        }
        return [];
    }

    /**
     * @private
     */
    async _seedIfEmpty() {
        const composeCount = await this._composeCollection.count();
        if (composeCount === 0) {
            logger.info("Seeding compose_rules collection…");
            await this._upsertRules(this._composeCollection, COMPOSE_RULES);
        }

        const securityCount = await this._securityCollection.count();
        if (securityCount === 0) {
            logger.info("Seeding security_rules collection…");
            await this._upsertRules(this._securityCollection, SECURITY_RULES);
        }
    }

    /**
     * @private
     */
    async _upsertRules(collection, rules) {
        await collection.upsert({
            ids: rules.map((r) => r.id),
            documents: rules.map((r) => r.text),
            metadatas: rules.map((r) => ({ category: r.id.startsWith("no_") || r.id.startsWith("drop_") || r.id.startsWith("limit_") || r.id.startsWith("scan_") || r.id.startsWith("expose_") || r.id.startsWith("read_") || r.id.startsWith("security_") ? "security" : "compose" })),
        });
    }
}

// ─── Singleton ───────────────────────────────────────────────

let _instance = null;

/**
 * Return the singleton VectorDBService instance.
 * @returns {VectorDBService}
 */
export function getVectorDBService() {
    if (!_instance) {
        _instance = new VectorDBService();
    }
    return _instance;
}

export default VectorDBService;
