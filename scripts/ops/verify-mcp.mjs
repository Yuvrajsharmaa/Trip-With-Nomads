import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MCP_CONFIG_PATH = '/Users/yuvrajsharma/.gemini/antigravity/mcp_config.json';

async function checkServer(name, config) {
    console.log(`\nChecking [${name}]...`);
    try {
        if (!config.command) {
            console.log(`  [-] No command defined for ${name}. Skipping.`);
            return;
        }

        // We try to run the command with a timeout to see if it starts
        // Since many MCP servers wait for input, we just check if the command exists/starts
        console.log(`  [ ] Running: ${config.command} ${config.args.join(' ')}`);
        
        if (name === 'framer') {
            console.log("  [!] Note: Framer MCP requires the plugin to be open in the Framer app.");
        }

        // Just check if npx/command is accessible
        execSync(`${config.command} --version`, { stdio: 'ignore' });
        console.log(`  [+] ${config.command} is accessible.`);

    } catch (e) {
        console.log(`  [x] Error checking ${name}: ${e.message}`);
    }
}

async function main() {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
        console.error(`Config not found at ${MCP_CONFIG_PATH}`);
        return;
    }

    const config = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
    const servers = config.mcpServers || {};

    console.log("=== MCP STATUS AUDIT ===");
    for (const [name, cfg] of Object.entries(servers)) {
        await checkServer(name, cfg);
    }
}

main();
