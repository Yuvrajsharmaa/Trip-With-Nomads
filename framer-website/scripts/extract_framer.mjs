import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

// Polyfill EventSource for Node environment if needed by the SDK (usually required for SSE transport in Node)
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

async function run() {
    console.log("Initializing MCP Client...");

    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client(
        {
            name: "terminal-extractor",
            version: "1.0.0",
        },
        {
            capabilities: {
                resources: {},
                tools: {},
                prompts: {}
            },
        }
    );

    try {
        console.log(`Connecting to ${MCP_URL}...`);
        await client.connect(transport);
        console.log("Connected successfully!");

        // console.log("\n--- Listing Resources ---");
        // const resources = await client.listResources();
        // console.log(JSON.stringify(resources, null, 2));

        console.log("\n--- Listing Tools ---");
        const tools = await client.listTools();
        console.log(JSON.stringify(tools, null, 2));

        console.log("\n--- Listing Prompts ---");
        const prompts = await client.listPrompts();
        console.log(JSON.stringify(prompts, null, 2));

        /*
        if (resources.resources && resources.resources.length > 0) {
            console.log(`\n--- Found ${resources.resources.length} resources. Reading the first few... ---`);

            // Limit to first 3 to avoid spam
            for (const resource of resources.resources.slice(0, 3)) {
                console.log(`\nReading: ${resource.name} (${resource.uri})`);
                try {
                    const content = await client.readResource({ uri: resource.uri });
                    console.log(JSON.stringify(content, null, 2));
                } catch (err) {
                    console.error(`Failed to read resource ${resource.name}:`, err.message);
                }
            }
        } else {
            console.log("No resources found.");
        }
        */

    } catch (error) {
        console.error("MCP Error:", error);
    } finally {
        console.log("\nClosing connection...");
        try {
            await client.close();
        } catch (e) {
            // ignore close errors
        }
    }
}

run();
