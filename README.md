# EAT

EAT is a supervised local-first orchestration panel for CLI-based coding agents. An operator registers a local git repository, clarifies requirements with a Leader agent, reviews a generated execution plan, and then supervises execution across a task-mainline branch plus isolated worker branches, worktrees, and sandboxed sessions.

## Worker Sandbox Image

Worker sessions run inside Docker with `eat/worker-base:latest` by default. Build it locally before launching real worker execution:

```bash
npm run build:worker-image
```

The image is intentionally small but includes the minimum tools EAT's Codex workers currently rely on: `bash`, `git`, and `rg`.

## Planning Roles

Leader planning in EAT now uses an agency-inspired role catalog so task allocation is less generic and more execution-oriented. The current planning prompt explicitly nudges the Leader toward specialist roles such as:

- `frontend-developer`
- `backend-architect`
- `ux-architect`
- `devops-automator`
- `rapid-prototyper`
- `code-reviewer`
- `senior-developer`
- `reality-checker`

These roles are used as planning guidance, not as a verbatim import. EAT still keeps its own supervised workflow, explicit approval checkpoints, and local-first execution model.

## Borrowed Inspiration

The role taxonomy and role-boundary writing style above are adapted from the public `agency-agents` project by Marcin Sitarzewski:

- Source repository: <https://github.com/msitarzewski/agency-agents>

We borrow the idea of giving each agent a sharper specialty and clearer operating rules so the Leader can produce better subtask ownership, review splits, and release-readiness plans.
