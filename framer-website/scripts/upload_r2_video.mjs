import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { spawn } from "node:child_process"

function parseArgs(argv) {
    const args = {}
    for (let i = 2; i < argv.length; i += 1) {
        const part = argv[i]
        if (!part.startsWith("--")) continue
        const key = part.slice(2)
        const value = argv[i + 1]
        if (!value || value.startsWith("--")) {
            throw new Error(`Missing value for --${key}`)
        }
        args[key] = value
        i += 1
    }
    return args
}

function usage() {
    console.error(
        [
            "Usage:",
            '  node ./scripts/upload_r2_video.mjs --bucket "<bucket>" --file "<local-file>" --key "<object-key>" [--public-base-url "https://media.tripwithnomads.com"]',
            "",
            "Example:",
            '  node ./scripts/upload_r2_video.mjs --bucket "tripwithnomads-videos" --file "/Users/yuvrajsharma/Downloads/Framer Asset Video.compressed.mp4" --key "videos/herovideo_compressed.mp4" --public-base-url "https://media.tripwithnomads.com"',
        ].join("\n")
    )
}

async function main() {
    const args = parseArgs(process.argv)
    const bucket = String(args.bucket || "").trim()
    const file = String(args.file || "").trim()
    const key = String(args.key || "").trim().replace(/^\/+/, "")
    const publicBaseUrl = String(args["public-base-url"] || "").trim().replace(
        /\/+$/,
        ""
    )

    if (!bucket || !file || !key) {
        usage()
        process.exitCode = 1
        return
    }

    await access(file, constants.R_OK)

    const target = `${bucket}/${key}`
    const commandArgs = ["wrangler", "r2", "object", "put", target, "--file", file]

    console.log(`Uploading ${file}`)
    console.log(`Target: ${target}`)

    await new Promise((resolve, reject) => {
        const child = spawn("npx", commandArgs, {
            stdio: "inherit",
            shell: false,
        })

        child.on("exit", (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`wrangler exited with code ${code}`))
        })

        child.on("error", reject)
    })

    if (publicBaseUrl) {
        console.log(`Public URL: ${publicBaseUrl}/${key}`)
    } else {
        console.log("Upload complete.")
    }
}

main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
})
