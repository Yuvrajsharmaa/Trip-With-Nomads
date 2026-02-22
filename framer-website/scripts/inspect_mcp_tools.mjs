
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;
import { readFileSync } from "fs";

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "pusher", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);

        // Read the instruction resource first
        try {
            const resource = await client.readResource({ uri: "mcp://mcp.unframer.co/prompts/how-to-write-framer-code-files.md" });
            const text = resource.contents?.[0]?.text || "";
            console.log("=== FRAMER INSTRUCTIONS ===\n" + text.slice(0, 3000));
        } catch (e) {
            console.log("Resource read failed:", e.message);
        }

        // Get tools list and find updateCodeFile schema
        const tools = await client.listTools();
        const updateTool = tools.tools.find(t => t.name === "updateCodeFile");
        const createTool = tools.tools.find(t => t.name === "createCodeFile");

        if (updateTool) {
            console.log("\n=== updateCodeFile schema ===\n" + JSON.stringify(updateTool.inputSchema, null, 2));
        }
        if (createTool) {
            console.log("\n=== createCodeFile schema ===\n" + JSON.stringify(createTool.inputSchema, null, 2));
        }

        // Try to call updateCodeFile with an empty call to see the error message (tells us params needed)
        try {
            const r = await client.callTool({ name: "updateCodeFile", arguments: {} });
            console.log("\nupdateCodeFile empty result:", JSON.stringify(r).slice(0, 500));
        } catch (e) {
            console.log("\nupdateCodeFile error (shows needed params):", e.message?.slice(0, 500));
        }

    } catch (e) {
        console.error("Fatal:", e.message);
    } finally {
        await client.close();
    }
}

main();
