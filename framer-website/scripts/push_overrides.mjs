import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { readFileSync } from "fs";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

const filesToPush = [
    {
        targetId: "perCTUm",
        localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/CheckoutPageOverrides.tsx"
    },
    {
        targetId: "u_WTK4w",
        localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/TripPriceOverrides.tsx"
    }
];

const client = new Client({ name: "pusher", version: "1.0.0" }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(MCP_URL));

function text(result) {
    return result?.content?.find((c) => c.type === "text")?.text || "";
}

try {
    await client.connect(transport);

    for (const file of filesToPush) {
        const local = readFileSync(file.localFile, "utf8");
        console.log(`Pushing ${file.localFile} to ${file.targetId}...`);

        const update = await client.callTool({
            name: "updateCodeFile",
            arguments: { codeFileId: file.targetId, content: local },
        });
        console.log(`Update response for ${file.targetId}: ${text(update) || JSON.stringify(update)}`);
    }
} catch (e) {
    console.error(e?.message || e);
    if (e?.data) console.error(JSON.stringify(e.data));
    process.exitCode = 1;
} finally {
    await client.close();
}
