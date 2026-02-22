
// Uses native fetch (Node 18+)
const token = "73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253";

async function tryEndpoint(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                ...options.headers
            },
            ...options
        });
        const text = await res.text();
        console.log(`${options.method || "GET"} ${url} → ${res.status}: ${text.slice(0, 500)}`);
        return { status: res.status, text };
    } catch (e) {
        console.log(`Error for ${url}: ${e.message}`);
        return null;
    }
}

// Try various Framer API endpoints
await tryEndpoint("https://api.framer.com/v1/files");
await tryEndpoint("https://api.framer.com/v2/files");
await tryEndpoint("https://api.framer.com/v1/projects");
await tryEndpoint(`https://api.framer.com/v1/code`);
await tryEndpoint(`https://api.framer.com/v1/tokens`);

console.log("Done");
