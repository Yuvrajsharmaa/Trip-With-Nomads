
import { readFileSync } from "fs";

// Extract project ID from MCP URL
// MCP URL: https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253...
// The "id" parameter in the URL is the Framer project token, not project ID directly
// Let's try using the Framer API with the token

// From sync_framer_ids.mjs:
const fetch = (await import("node-fetch")).default;

// Try Framer API to list project files
const API_BASE = "https://api.framer.com";
const token = "73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253";

async function tryEndpoint(url, options = {}) {
    const res = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers
        },
        ...options
    });
    const text = await res.text();
    console.log(`${options.method || "GET"} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    return { status: res.status, text };
}

// Try various endpoints
await tryEndpoint(`${API_BASE}/v1/projects`);
await tryEndpoint(`${API_BASE}/v2/sites`);
await tryEndpoint(`${API_BASE}/v1/me`);

// Also check the unframer domain
await tryEndpoint("https://api.unframer.co/v1/files", { headers: { "X-API-Key": token } });

console.log("Done");
