import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const MCP_URL = import.meta.env.VITE_MCP_URL;

export class FramerSyncClient {
    private client: Client;
    private transport: SSEClientTransport;
    private isConnected = false;

    constructor() {
        if (!MCP_URL) throw new Error("VITE_MCP_URL is missing from .env");
        this.transport = new SSEClientTransport(new URL(MCP_URL), {
            eventSourceInit: { withCredentials: false },
        });
        this.client = new Client(
            { name: "admin-dashboard", version: "1.0.0" },
            { capabilities: {} }
        );
    }

    async connect() {
        if (this.isConnected) return;
        await this.client.connect(this.transport);
        this.isConnected = true;
    }

    // ── Read ────────────────────────────────────────────────────────────────────

    async getCollections() {
        await this.connect();
        const result = await this.client.callTool({ name: "getCMSCollections", arguments: {} });
        const content = (result.content as any)[0];
        if (content?.type === 'text') {
            try { return JSON.parse(content.text); } catch { return content.text; }
        }
        return result;
    }

    async getItems(collectionId: string, limit = 100) {
        await this.connect();
        const result = await this.client.callTool({
            name: "getCMSItems",
            arguments: { collectionId, limit },
        });
        const content = (result.content as any)[0];
        if (content?.type === 'text') {
            try { return JSON.parse(content.text); } catch { return content.text; }
        }
        return result;
    }

    async getItem(collectionId: string, itemId: string) {
        const all = await this.getItems(collectionId);
        return (all.items ?? []).find((i: any) => i.id === itemId) ?? null;
    }

    // ── Write ───────────────────────────────────────────────────────────────────

    /**
     * Create a brand-new CMS item (draft). No itemId means Framer generates one.
     */
    async createItem(collectionId: string, fieldData: Record<string, any>) {
        await this.connect();
        return this._callUpsert(collectionId, undefined, fieldData);
    }

    /**
     * Update an existing CMS item by its Framer itemId.
     */
    async updateItem(collectionId: string, itemId: string, fieldData: Record<string, any>) {
        await this.connect();
        return this._callUpsert(collectionId, itemId, fieldData);
    }

    /**
     * Backwards-compatible upsert (pass empty string itemId to create).
     */
    async upsertItem(collectionId: string, itemId: string, fieldData: Record<string, any>) {
        await this.connect();
        return this._callUpsert(collectionId, itemId || undefined, fieldData);
    }

    async deleteItem(collectionId: string, itemId: string) {
        await this.connect();
        const result = await this.client.callTool({
            name: "deleteCMSItem",
            arguments: { collectionId, itemId },
        });
        return this._parseResult(result);
    }

    // ── Internal ─────────────────────────────────────────────────────────────────

    private async _callUpsert(
        collectionId: string,
        itemId: string | undefined,
        fieldData: Record<string, any>
    ) {
        const args: Record<string, any> = { collectionId, fieldData };
        if (itemId) args.itemId = itemId;
        const result = await this.client.callTool({ name: "upsertCMSItem", arguments: args });
        return this._parseResult(result);
    }

    private _parseResult(result: any) {
        const content = (result.content as any)?.[0];
        if (content?.type === 'text') {
            try { return JSON.parse(content.text); } catch { return content.text; }
        }
        return result;
    }
}

export const mcp = new FramerSyncClient();
