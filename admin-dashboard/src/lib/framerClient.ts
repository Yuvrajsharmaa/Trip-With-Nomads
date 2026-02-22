import { connect } from "framer-api";

/**
 * FramerClient uses the official Framer Server API (framer-api).
 * It replaces the previous MCP-based bridge for direct, high-performance CMS access.
 */
class FramerClient {
    private framer: any = null;
    private isConnected = false;

    private get credentials() {
        const url = import.meta.env.VITE_FRAMER_PROJECT_URL;
        const key = import.meta.env.VITE_FRAMER_API_KEY;

        if (!url || !key) {
            console.error("Framer credentials missing. Please set VITE_FRAMER_PROJECT_URL and VITE_FRAMER_API_KEY in .env");
        }
        return { url, key };
    }

    /**
     * Connects to the Framer project. 
     * Note: Server API connections are long-lived and should be manually disconnected if in a script,
     * but in a dashboard (browser) we manage the singleton instance.
     */
    async connect() {
        if (this.isConnected && this.framer) return this.framer;

        const { url, key } = this.credentials;
        if (!url || !key) return null;

        try {
            this.framer = await connect(url, key);
            this.isConnected = true;
            return this.framer;
        } catch (error) {
            console.error("Failed to connect to Framer:", error);
            throw error;
        }
    }

    async disconnect() {
        if (this.framer) {
            await this.framer.disconnect();
            this.framer = null;
            this.isConnected = false;
        }
    }

    // --- CMS Operations ---

    async getCollections() {
        const f = await this.connect();
        if (!f) return [];
        return await f.getCollections();
    }

    async getItems(collectionId: string) {
        const f = await this.connect();
        if (!f) return [];
        // The server API usually provides getItems directly or via an unmanaged collection
        const collections = await f.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (!collection) throw new Error(`Collection ${collectionId} not found`);

        return await collection.getItems();
    }

    /**
     * Upserts items to the CMS. 
     * To update: include the existing item 'id' in the object.
     * To create: omit the 'id'.
     */
    async upsertItems(collectionId: string, items: any[]) {
        const f = await this.connect();
        if (!f) return null;

        const collections = await f.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (!collection) throw new Error(`Collection ${collectionId} not found`);

        return await collection.addItems(items);
    }

    // --- Deployment Operations ---

    async getChangedPaths() {
        const f = await this.connect();
        if (!f) return { added: [], removed: [], modified: [] };
        return await f.getChangedPaths();
    }

    async publish() {
        const f = await this.connect();
        if (!f) return null;
        return await f.publish();
    }

    async deploy(deploymentId: string) {
        const f = await this.connect();
        if (!f) return null;
        return await f.deploy(deploymentId);
    }
}

export const framerClient = new FramerClient();
