import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repositoryRoot = path.resolve(new URL("..", import.meta.url).pathname)
const guardPath = path.join(repositoryRoot, "scripts", "verify_worktree.mjs")

function runGit(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function createFixture() {
    const root = mkdtempSync(path.join(tmpdir(), "twn-worktree-guard-"))
    runGit(root, ["init", "-q", "-b", "main"])
    runGit(root, ["config", "user.name", "Worktree Guard Test"])
    runGit(root, ["config", "user.email", "worktree-guard@example.test"])
    writeFileSync(path.join(root, "README.md"), "fixture\n")
    runGit(root, ["add", "README.md"])
    runGit(root, ["commit", "-qm", "fixture: initial"])
    runGit(root, ["branch", "staging"])
    runGit(root, ["remote", "add", "origin", root])
    runGit(root, ["update-ref", "refs/remotes/origin/staging", "refs/heads/staging"])
    const linked = path.join(root, "linked")
    runGit(root, ["worktree", "add", "-qb", "codex/fixture", linked, "refs/remotes/origin/staging"])
    return { root, linked }
}

function runGuard(cwd, command) {
    try {
        const output = execFileSync(process.execPath, [guardPath, command], {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        })
        return { code: 0, output }
    } catch (error) {
        return {
            code: error.status ?? 1,
            output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
        }
    }
}

test("accepts a clean codex worktree at origin/staging", () => {
    const fixture = createFixture()
    try {
        const result = runGuard(fixture.linked, "start")
        assert.equal(result.code, 0, result.output)
        assert.match(result.output, /PASS start/)
    } finally {
        rmSync(fixture.root, { recursive: true, force: true })
    }
})

test("rejects the primary checkout and protected branches", () => {
    const fixture = createFixture()
    try {
        const rootResult = runGuard(fixture.root, "start")
        assert.notEqual(rootResult.code, 0)
        assert.match(rootResult.output, /primary checkout/)

        runGit(fixture.root, ["switch", "--detach", "HEAD"])
        runGit(fixture.linked, ["switch", "-C", "staging", "refs/remotes/origin/staging"])
        const protectedResult = runGuard(fixture.linked, "start")
        assert.notEqual(protectedResult.code, 0)
        assert.match(protectedResult.output, /Protected branch 'staging'/)
    } finally {
        rmSync(fixture.root, { recursive: true, force: true })
    }
})

test("rejects dirty handoff and accepts it after a wip checkpoint", () => {
    const fixture = createFixture()
    try {
        writeFileSync(path.join(fixture.linked, "README.md"), "unfinished\n")
        const dirtyResult = runGuard(fixture.linked, "handoff")
        assert.notEqual(dirtyResult.code, 0)
        assert.match(dirtyResult.output, /uncommitted path/)

        runGit(fixture.linked, ["add", "README.md"])
        runGit(fixture.linked, ["commit", "-qm", "wip: checkpoint fixture"])
        const cleanResult = runGuard(fixture.linked, "handoff")
        assert.equal(cleanResult.code, 0, cleanResult.output)
    } finally {
        rmSync(fixture.root, { recursive: true, force: true })
    }
})

test("refreshes origin/staging before accepting a new worktree", () => {
    const fixture = createFixture()
    try {
        runGit(fixture.root, ["switch", "staging"])
        writeFileSync(path.join(fixture.root, "README.md"), "new staging baseline\n")
        runGit(fixture.root, ["add", "README.md"])
        runGit(fixture.root, ["commit", "-qm", "fixture: advance staging"])

        const result = runGuard(fixture.linked, "start")
        assert.notEqual(result.code, 0)
        assert.match(result.output, /must start exactly at origin\/staging/)
    } finally {
        rmSync(fixture.root, { recursive: true, force: true })
    }
})

test("allows a clean non-Codex feature branch to push", () => {
    const fixture = createFixture()
    try {
        runGit(fixture.linked, ["switch", "-C", "fix/ordinary-feature"])
        const result = runGuard(fixture.linked, "push")
        assert.equal(result.code, 0, result.output)
        assert.match(result.output, /PASS push/)
    } finally {
        rmSync(fixture.root, { recursive: true, force: true })
    }
})
