#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import path from "node:path"

const command = process.argv[2] || "start"
const allowedCommands = new Set(["start", "handoff", "push"])

if (!allowedCommands.has(command)) {
    console.error("Usage: node scripts/verify_worktree.mjs <start|handoff|push>")
    process.exit(2)
}

function git(args, allowFailure = false) {
    try {
        return execFileSync("git", args, {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
        }).trimEnd()
    } catch (error) {
        if (allowFailure) return ""
        const detail = error?.stderr?.toString?.().trim() || error.message
        throw new Error(`git ${args.join(" ")} failed: ${detail}`)
    }
}

function absoluteGitPath(value) {
    return path.resolve(process.cwd(), value)
}

const errors = []
let branch = ""
let head = ""
let stagingHead = ""
let gitDir = ""
let commonGitDir = ""

try {
    branch = git(["branch", "--show-current"])
    head = git(["rev-parse", "HEAD"])
    gitDir = absoluteGitPath(git(["rev-parse", "--git-dir"]))
    commonGitDir = absoluteGitPath(git(["rev-parse", "--git-common-dir"]))

    const superproject = git(["rev-parse", "--show-superproject-working-tree"], true)
    if (superproject) {
        errors.push("This path is inside a Git submodule, not a feature worktree.")
    } else if (gitDir === commonGitDir) {
        errors.push("This is the primary checkout. Feature implementation must run in a linked worktree.")
    }

    if (!branch) {
        errors.push("The worktree is detached. Create a unique codex/<feature> branch before editing.")
    } else if (branch === "main" || branch === "staging") {
        errors.push(`Protected branch '${branch}' cannot be used for feature work.`)
    } else if (command !== "push" && (!branch.startsWith("codex/") || branch.length <= "codex/".length)) {
        errors.push(`Branch '${branch}' is not a feature branch. Use a unique codex/<feature> branch.`)
    }

    const dirtyEntries = git(["status", "--porcelain=v1", "--untracked-files=all"])
        .split(/\r?\n/)
        .filter(Boolean)
    if (dirtyEntries.length > 0) {
        errors.push(
            `Worktree has ${dirtyEntries.length} uncommitted path${dirtyEntries.length === 1 ? "" : "s"}. ` +
            "Checkpoint intentional source with a wip: commit before handoff, push, or reuse.",
        )
    }

    if (command === "start") {
        const remotes = git(["remote"], true).split(/\r?\n/).filter(Boolean)
        if (!remotes.includes("origin")) {
            errors.push("The origin remote is unavailable. Fetch the repository before starting work.")
        } else {
            try {
                git(["fetch", "--quiet", "origin", "staging"])
            } catch (error) {
                errors.push(`Could not refresh origin/staging before starting work: ${error.message}`)
            }
        }
        stagingHead = git(["rev-parse", "--verify", "refs/remotes/origin/staging"], true)
        if (!stagingHead) {
            errors.push("refs/remotes/origin/staging is unavailable. Fetch the repository before starting work.")
        } else if (head !== stagingHead) {
            errors.push("A new feature worktree must start exactly at origin/staging.")
        }
    }
} catch (error) {
    errors.push(error.message)
}

if (errors.length > 0) {
    console.error(`[worktree-guard] FAIL ${command}`)
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
}

console.log(`[worktree-guard] PASS ${command}: ${branch} at ${head.slice(0, 12)}`)
