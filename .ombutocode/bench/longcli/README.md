# LongCLI-Bench adapter for Ombuto Code

These files register Ombuto Code as an *installed agent* in the
[LongCLI-Bench](https://github.com/finyorko/longcli-bench) (Terminal-Bench)
harness, so `tb run --agent ombuto --model claude-sonnet-4-6 ...` drives the
whole headless pipeline (`epic create` → `tickets create` → `run --until
drained --profile benchmark` → `status`) inside each task container and the
harness grades the resulting `/app` working tree.

They are a copy of `terminal_bench/agents/installed_agents/ombuto/` from the
`ombuto-agent` branch of the harness clone; the harness also needs
`OMBUTO = "ombuto"` in `terminal_bench/agents/agent_name.py` and the class
added to `AgentFactory` in `terminal_bench/agents/agent_factory.py`.

| File | Role |
|------|------|
| `ombuto_agent.py` | `OmbutoAgent(AbstractInstalledAgent)`: env vars, template variables, the single `bash /installed-agent/ombuto-run.sh '<instruction>'` command. |
| `ombuto-setup.sh.j2` | Setup script (sourced once per container): node 22 via nvm, `npm i -g @anthropic-ai/claude-code@{{ claude_version }}`, `npx create-ombutocode@{{ installer_version }} --into-existing /app --omit-dev`, then writes `ombuto-run.sh` and `fake-claude` into `/installed-agent` as heredocs. |
| `ombuto-run.sh` | The pipeline driver. Maps the CLI model id to the `codingagents.yml` id (and pins the yml to that single model), makes `/app` a committed git repo on `main`, runs the four CLI stages, copies `run-manifest.json`, `run-output/`, `logs/` and per-stage JSON/stderr to `/agent-logs/ombuto/`, writes `stages.json`, always exits 0. |
| `fake-claude.js` | Model-free stand-in for `claude --print` used when `OMBUTO_FAKE_AGENT=1`: satisfies the epic/tickets/impl/test/eval/merge-resolve output contracts so the pipeline can be exercised at zero API cost. |

Agent kwargs: `--agent-kwarg version=v0.2.7` (Ombuto tag; the installer npm
version is the tag without `v`), `--agent-kwarg claude_version=latest`,
`--agent-kwarg max_seconds=7000` (or env `OMBUTO_MAX_SECONDS`),
`--agent-kwarg closeout=eval` (or env `OMBUTO_CLOSEOUT`; `all|eval|none`, default
`eval` — keep only the epic-level evaluation closeout ticket; benchmark
repositories have no help docs or code map for the other three to maintain).

Dry run (no paid calls):

```bash
OMBUTO_FAKE_AGENT=1 ANTHROPIC_API_KEY=dummy uv run tb run --agent ombuto \
  --model claude-sonnet-4-6 --task-id pytest_pytest_example \
  --dataset-path tasks_long_cli_example --run-id ombuto_dry --n-attempts 1
```
