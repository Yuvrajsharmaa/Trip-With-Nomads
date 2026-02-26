# Agent Self Rules (Non‑Negotiable)

1. Always branch from `staging`.
2. One issue = one branch = one PR.
3. No production testing for new features.
4. Always provide staging QA evidence before promotion.
5. Keep commits atomic and reversible.
6. Include a rollback note in every PR.
7. If runtime is stable and issue is unrelated, do not touch stable files.
8. Use Framer API directly (no Unframer MCP).
9. MCPs are required when working on Framer/Supabase if direct API isn’t available.
