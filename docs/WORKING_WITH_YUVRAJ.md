# Working With Yuvraj (Trip With Nomads)

## Communication Style
- Yuvraj is a UX designer, not a coder.
- Explain in plain language first, then a short technical summary.
- Use concrete steps and expected outcomes.
- Ask for screenshots or links when visuals matter.
- Avoid jargon without a quick explanation.

## Product Context
- Trip With Nomads is production‑sensitive; launch timing matters.
- Staging-first: all changes validated on staging before production.
- Framer is the primary UI layer; overrides should only change text/behavior, not styles.

## Collaboration Rules
- Follow `docs/GLOBAL_AGENT_WORKFLOW.md` and `docs/AGENT_SELF_RULES.md`.
- Use the Framer API directly (no Unframer MCP).
- Use MCP for Framer/Supabase only when direct API isn’t available.
- Never run new features on production for testing.

## Delivery Expectations
- Always summarize: what changed, why, and how to test.
- Provide a clear rollback path.
- Keep code clean and scoped to the issue.
