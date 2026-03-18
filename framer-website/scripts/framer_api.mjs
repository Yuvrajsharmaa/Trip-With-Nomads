
import { readFileSync } from "fs";

// Extract project ID from MCP URL
// MCP URL example: https://mcp.unframer.co/sse?id=<FRAMER_PROJECT_TOKEN>
// The "id" parameter in the URL is the Framer project token, not project ID directly
// Let's try using the Framer API with the token

// From sync_framer_ids.mjs:
// Try Framer API to list project files
const API_BASE = "https://api.framer.com";
const token = String(process.env.FRAMER_PROJECT_TOKEN || "").trim();
const secret = String(process.env.FRAMER_SECRET || "").trim();

if (!token) {
    throw new Error("Missing FRAMER_PROJECT_TOKEN env var");
}

async function tryEndpoint(url, options = {}) {
    const res = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`, // Some use token
            ...(secret ? { "X-Framer-Secret": secret } : {}), // Others use secret
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
