
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "file-lister", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);

        // Try listing code files (different tool name variations)  
        for (const toolName of ["listCodeFiles", "getCodeFiles", "listFiles", "getFiles"]) {
            try {
                const result = await client.callTool({ name: toolName, arguments: {} });
                console.log(`Tool ${toolName} worked:`, JSON.stringify(result).slice(0, 2000));
                break;
            } catch (e) {
                console.log(`Tool ${toolName} failed: ${e.message?.slice(0, 80)}`);
            }
        }

    } catch (e) {
        console.error("Connection error:", e.message);
    } finally {
        await client.close();
    }
}

main();
