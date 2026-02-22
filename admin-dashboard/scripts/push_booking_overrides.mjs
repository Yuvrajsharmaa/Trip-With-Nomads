
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { readFileSync } from "fs";
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const CODE_FILE_PATH = "/Users/yuvrajsharma/.gemini/antigravity/playground/blazing-aphelion/twn-clone/framer/BookingOverrides.tsx";

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "code-pusher", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        console.log("Connected to Framer MCP");

        // Step 1: Read the guide
        console.log("\n=== Reading Framer how-to guide ===");
        const resource = await client.readResource({
            uri: "mcp://mcp.unframer.co/prompts/how-to-write-framer-code-files.md"
        });
        const guide = resource.contents?.[0]?.text || "";
        console.log(guide.slice(0, 1000));

        // Step 2: Read local file
        const codeContent = readFileSync(CODE_FILE_PATH, "utf-8");
        console.log(`\nCode file is ${codeContent.length} characters`);

        // Step 3: Try to create the code file in Framer
        console.log("\n=== Creating BookingOverrides code file in Framer ===");
        const result = await client.callTool({
            name: "createCodeFile",
            arguments: {
                name: "BookingOverrides.tsx",
                content: codeContent
            }
        });

        console.log("\nResult:", JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("Error:", e.message);
        if (e.data) console.error("Data:", JSON.stringify(e.data, null, 2));
    } finally {
        await client.close();
    }
}

main();
