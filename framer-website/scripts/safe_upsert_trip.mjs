import { readFile } from "node:fs/promises"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { EventSource } from "eventsource"

global.EventSource = EventSource

const DEFAULT_MCP_URL = ""
const TRIPS_COLLECTION_ID = "Z1Bphf6oI"
const CATEGORY_COLLECTION_ID = "Mj2KXInih"
const TAGS_FIELD_ID = "EM1Da5Zbe"
const CATEGORY_FIELD_ID = "q1IsKozNh"

function parseArgs(argv) {
    const args = {}
    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i]
        if (!token.startsWith("--")) continue
        const key = token.slice(2)
        const maybeValue = argv[i + 1]
        if (!maybeValue || maybeValue.startsWith("--")) {
            args[key] = "true"
            continue
        }
        args[key] = maybeValue
        i += 1
    }
    return args
}

function usage() {
    console.error(
        [
            "Usage:",
            '  node ./scripts/safe_upsert_trip.mjs --slug "<trip-slug>" --patch-file "<json-path>"',
            '  node ./scripts/safe_upsert_trip.mjs --item-id "<item-id>" --patch-json \'{"sOpVBzQ8v":"uuid"}\'',
            "",
            "Options:",
            "  --slug         Trip slug in Framer CMS (recommended)",
            "  --item-id      Trip item ID in Framer CMS",
            "  --patch-file   Path to JSON object of field updates",
            "  --patch-json   Inline JSON object of field updates",
            "  --dry-run      Validate payload and print final patch, do not upsert",
            "  --mcp-url      Override MCP URL (defaults to project MCP URL)",
            "",
            "Patch format:",
            "  Keys should be Framer field IDs.",
            "  Value can be either:",
            "    1) typed entry: {\"type\":\"string\",\"value\":\"...\"}",
            "    2) raw value: script infers type from existing field definition.",
            "",
            "Example:",
            '  node ./scripts/safe_upsert_trip.mjs --slug "srilanka-twn" --patch-json \'{"sOpVBzQ8v":"443928dc-32e1-47cf-bdbd-2b46ddc9a172"}\'',
        ].join("\n")
    )
}

function isTypedFieldEntry(value) {
    return (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof value.type === "string" &&
        Object.prototype.hasOwnProperty.call(value, "value")
    )
}

function normalizeReferenceId(value, slugToId, idSet) {
    if (typeof value !== "string") return value
    if (idSet.has(value)) return value
    return slugToId.get(value) || value
}

function asObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be a JSON object`)
    }
    return value
}

async function loadPatch(args) {
    const hasFile = typeof args["patch-file"] === "string"
    const hasInline = typeof args["patch-json"] === "string"

    if (hasFile && hasInline) {
        throw new Error("Use only one of --patch-file or --patch-json")
    }
    if (!hasFile && !hasInline) {
        return {}
    }

    if (hasFile) {
        const text = await readFile(args["patch-file"], "utf8")
        return asObject(JSON.parse(text), "patch-file")
    }

    return asObject(JSON.parse(args["patch-json"]), "patch-json")
}

function buildTypedPatch(rawPatch, existingFieldData) {
    const out = {}
    for (const [fieldId, inputValue] of Object.entries(rawPatch)) {
        if (isTypedFieldEntry(inputValue)) {
            out[fieldId] = { ...inputValue }
            continue
        }

        const existing = existingFieldData[fieldId]
        if (!existing?.type) {
            throw new Error(
                `Field ${fieldId} is not present on target item and no explicit {type,value} was provided`
            )
        }

        out[fieldId] = {
            type: existing.type,
            value: inputValue,
            ...(existing.contentType && existing.type === "formattedText"
                ? { contentType: existing.contentType }
                : {}),
        }
    }
    return out
}

async function callToolOrThrow(client, name, args) {
    const result = await client.callTool({ name, arguments: args })
    const text = result?.content?.[0]?.text || ""
    if (text.startsWith("Encountered an error:")) {
        throw new Error(text.replace(/^Encountered an error:\s*/, ""))
    }
    return text
}

async function upsertWithRetry(client, args, retries = 3) {
    let lastError = null
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            return await callToolOrThrow(client, "upsertCMSItem", args)
        } catch (error) {
            lastError = error
            if (attempt < retries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, 400 * attempt)
                )
            }
        }
    }
    throw lastError
}

async function main() {
    const args = parseArgs(process.argv)
    const slug = String(args.slug || "").trim()
    const itemId = String(args["item-id"] || "").trim()
    const isDryRun = args["dry-run"] === "true"
    const mcpUrl = String(
        args["mcp-url"] || process.env.UNFRAMER_MCP_URL || DEFAULT_MCP_URL
    ).trim()

    if (!mcpUrl) {
        throw new Error("Set UNFRAMER_MCP_URL or pass --mcp-url")
    }

    if ((!slug && !itemId) || (slug && itemId)) {
        usage()
        throw new Error("Provide exactly one of --slug or --item-id")
    }

    const rawPatch = await loadPatch(args)

    const transport = new SSEClientTransport(new URL(mcpUrl))
    const client = new Client(
        { name: "safe-upsert-trip", version: "1.0.0" },
        { capabilities: {} }
    )

    try {
        await client.connect(transport)

        const categoriesText = await callToolOrThrow(client, "getCMSItems", {
            collectionId: CATEGORY_COLLECTION_ID,
            limit: 200,
        })
        const categories = JSON.parse(categoriesText).items || []
        const categorySlugToId = new Map(categories.map((item) => [item.slug, item.id]))
        const categoryIdSet = new Set(categories.map((item) => item.id))

        const tripsText = await callToolOrThrow(client, "getCMSItems", {
            collectionId: TRIPS_COLLECTION_ID,
            limit: 200,
        })
        const trips = JSON.parse(tripsText).items || []

        const target = trips.find((trip) =>
            itemId ? trip.id === itemId : trip.slug === slug
        )
        if (!target) {
            throw new Error(
                itemId
                    ? `Trip with item-id ${itemId} not found`
                    : `Trip with slug ${slug} not found`
            )
        }

        const typedPatch = buildTypedPatch(rawPatch, target.fieldData || {})

        // Include normalized reference fields on every upsert to avoid bad-reference rejections.
        const currentTags = target.fieldData?.[TAGS_FIELD_ID]
        const currentCategory = target.fieldData?.[CATEGORY_FIELD_ID]

        const candidateTags = typedPatch[TAGS_FIELD_ID] || currentTags
        if (
            candidateTags?.type === "multiCollectionReference" &&
            Array.isArray(candidateTags.value)
        ) {
            const normalized = candidateTags.value.map((value) =>
                normalizeReferenceId(value, categorySlugToId, categoryIdSet)
            )
            const unresolved = normalized.filter(
                (value) => typeof value === "string" && !categoryIdSet.has(value)
            )
            if (unresolved.length > 0) {
                throw new Error(
                    `Unresolved tags reference(s): ${unresolved.join(", ")}`
                )
            }
            typedPatch[TAGS_FIELD_ID] = {
                type: "multiCollectionReference",
                value: normalized,
            }
        }

        const candidateCategory = typedPatch[CATEGORY_FIELD_ID] || currentCategory
        if (candidateCategory?.type === "collectionReference") {
            const normalized = normalizeReferenceId(
                candidateCategory.value,
                categorySlugToId,
                categoryIdSet
            )
            if (typeof normalized !== "string" || !categoryIdSet.has(normalized)) {
                throw new Error(
                    `Unresolved category reference: ${String(candidateCategory.value)}`
                )
            }
            typedPatch[CATEGORY_FIELD_ID] = {
                type: "collectionReference",
                value: normalized,
            }
        }

        const payload = {
            collectionId: TRIPS_COLLECTION_ID,
            itemId: target.id,
            fieldData: typedPatch,
        }

        if (isDryRun) {
            console.log(
                JSON.stringify(
                    {
                        mode: "dry-run",
                        target: { id: target.id, slug: target.slug },
                        payload,
                    },
                    null,
                    2
                )
            )
            return
        }

        const responseText = await upsertWithRetry(client, payload, 3)
        console.log(responseText)
        console.log(
            `\nSafe upsert complete for ${target.slug} (${target.id}). Updated fields: ${Object.keys(
                typedPatch
            ).length}`
        )
    } finally {
        await client.close()
    }
}

main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
})
