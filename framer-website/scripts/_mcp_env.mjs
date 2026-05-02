export function resolveMcpUrl() {
  const direct = String(process.env.FRAMER_MCP_URL || process.env.UNFRAMER_MCP_URL || "").trim()
  if (direct) {
    if (!/^https:\/\/mcp\.unframer\.co\/sse\?/i.test(direct)) {
      throw new Error("FRAMER_MCP_URL must be a valid mcp.unframer.co SSE URL")
    }
    return direct
  }

  const projectToken = String(process.env.FRAMER_PROJECT_TOKEN || "").trim()
  const secret = String(process.env.FRAMER_SECRET || "").trim()
  if (projectToken && secret) {
    return `https://mcp.unframer.co/` + `sse?id=${encodeURIComponent(projectToken)}&secret=${encodeURIComponent(secret)}`
  }

  throw new Error(
    "Missing MCP credentials. Set FRAMER_MCP_URL (or UNFRAMER_MCP_URL), or set FRAMER_PROJECT_TOKEN + FRAMER_SECRET."
  )
}
