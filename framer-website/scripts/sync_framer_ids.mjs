/* sync_framer_ids.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const COLLECTION_ID = "Z1Bphf6oI";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    
    try {

        console.log("Updating Framer ID for leh-to-leh-with-umling-la-hanle-tso-moriri...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "MPChBIFAe",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "7b8b17de-5691-4eed-ae76-b834b52100ec" }
                }
            }
        });
            
        console.log("Updating Framer ID for kedarnath-yatra...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "eoBRtNlkT",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "2f0ea5c3-f8d4-4c2f-9156-b2ad011fca7d" }
                }
            }
        });
            
        console.log("Updating Framer ID for do-dhaam...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "hOXAU4LUt",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "74497b7e-8d3d-49dc-afd5-c09c268d048d" }
                }
            }
        });
            
        console.log("Updating Framer ID for ladakh-apricot-blossom...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "syE02dQzP",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "56bd2126-f80e-45f3-9f09-588e3931f55b" }
                }
            }
        });
            
        console.log("Updating Framer ID for bali-with-nusa-gili-t...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "LdCqEFFFc",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "341c59dc-8934-451c-8b9e-66c99445f2ec" }
                }
            }
        });
            
        console.log("Updating Framer ID for teen-taal...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "fKIljYZL3",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "bc006aec-a940-47cc-93c8-a56c6bcba83b" }
                }
            }
        });
            
        console.log("Updating Framer ID for baku-without-shahdag...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "k0ge9MUFO",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "1d081900-96e7-491d-b30e-0f637476b40d" }
                }
            }
        });
            
        console.log("Updating Framer ID for baku-with-shahdag...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "Vb_noMopE",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "1d081900-96e7-491d-b30e-0f637476b40d" }
                }
            }
        });
            
        console.log("Updating Framer ID for vietnam...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "jeTYE_wrk",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "2cd68b3f-bbae-41d4-93e6-b77f70119855" }
                }
            }
        });
            
        console.log("Updating Framer ID for dubai...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "hegknjsEt",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "5a220162-dffa-43ab-8d3c-42e9959189b6" }
                }
            }
        });
            
        console.log("Updating Framer ID for sangla-holi-special...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "NSNGMstyM",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "23fc4e0e-40e3-4767-81c8-9dc6bdcd7608" }
                }
            }
        });
            
        console.log("Updating Framer ID for sri-lanka...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "rDVdhCduy",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "45fb8007-1088-436c-8472-10783002f7a9" }
                }
            }
        });
            
        console.log("Updating Framer ID for spiti-valley-with-sangla-holi...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "eU_vVKkLq",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "e0615ffb-27d0-48c8-9cf7-0acbb16204a0" }
                }
            }
        });
            
        console.log("Updating Framer ID for thailand-songkran-festival...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "O1F9s8L1a",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "3efb8866-7ac1-4b96-a8c6-7c2e5496843c" }
                }
            }
        });
            
        console.log("Updating Framer ID for winter-spiti-expedition...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "CTs4tQRmn",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "a1b86c67-45e9-4193-a645-ea1a74d0af09" }
                }
            }
        });
            
        console.log("Updating Framer ID for almaty...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "JFPOu0QZf",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "670992ff-24ac-43fe-a0a3-5a4c2c19ed53" }
                }
            }
        });
            
        console.log("Updating Framer ID for japan...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "bWcqTz07R",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "7a6903f0-ff2a-4816-9b66-a2b337d0fba6" }
                }
            }
        });
            
        console.log("Updating Framer ID for thailand-full-moon-party...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "ErvmDhozt",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "fae90e04-3c77-4878-9b6b-a5f1e7e37fa7" }
                }
            }
        });
            
    } catch (e) { console.error(e); }
    finally { await client.close(); }
}
run();
