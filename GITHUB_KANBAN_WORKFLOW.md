# GitHub + Kanban Operating Workflow

This repository uses GitHub Issues + GitHub Project for always-on tracking.

## Project
- Project: `Trip-With-Nomads Kanban` (Project #1)
- Status columns: `Todo`, `In Progress`, `Done`

## Required Secret for Automation
Set this repository secret:
- `PROJECT_PAT`: Personal Access Token with scopes `repo`, `read:org`, `project`

Path: GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret.

## Daily Task Flow
1. Create an issue from `Task` template.
2. Start work using:
   - `scripts/ops/start-task.sh <issue-number> [slug]`
3. Implement changes on branch:
   - `codex/<issue-number>-<slug>`
4. Finish task using:
   - `scripts/ops/finish-task.sh <issue-number> <type> <area> "<summary>"`

## Commit Format
`<type>(<area>): <summary> (#<issue-number>)`

Example:
`feat(checkout): add vehicle option handling (#6)`

## Automation Behavior
Workflow file: `.github/workflows/project-kanban-sync.yml`

- Issue opened/reopened -> add issue to Project and set `Todo`
- PR opened/reopened/synchronize -> linked issues set `In Progress`
- PR closed + merged -> linked closed issues set `Done`
- Issue closed -> set `Done`

## Linking PRs to Issues
Use closing keywords in PR body/title, e.g.:
- `Closes #4`
- `Fixes #6`

This is required for automatic status transitions.
