#!/bin/bash
# ombuto-run.sh — drive Ombuto Code over the task repository in /app.
#
# Usage: bash /installed-agent/ombuto-run.sh "<task instruction>"
#
# Stages (each one records its exit code in $LOGS/ombuto/stages.json and
# writes its stdout JSON / stderr to separate files there):
#   git     make sure /app is a git repo with everything committed on `main`
#   model   map $OMBUTO_MODEL (CLI id, e.g. claude-sonnet-4-6) to the Ombuto
#           model id in .ombutocode/codingagents/codingagents.yml
#   epic    node .ombutocode/src/headless.js epic create --input <spec> --json
#   tickets node .ombutocode/src/headless.js tickets create --epic <path> --json
#   run     node .ombutocode/src/headless.js run --until drained --profile benchmark --json
#   status  node .ombutocode/src/headless.js status --json
# and finally copies .ombutocode/run-manifest.json, run-output/ and logs/ to
# $LOGS/ombuto/. The script always exits 0: the harness grades the /app
# working tree, not this exit code. A failed stage stops the pipeline but
# status + copy-out still run.
#
# Environment (written to /installed-agent/setup-env.sh by the harness):
#   OMBUTO_MODEL                 CLI model id from `tb run --model`
#   OMBUTO_MAX_SECONDS           budget for `run --until drained` (default 7000)
#   OMBUTOCODE_EVAL_DEFAULT_AGENT tool for planning/test/eval phases (claude)
#   OMBUTO_FAKE_AGENT=1          route every agent template to fake-claude
#   ANTHROPIC_API_KEY            for claude --print
set -u

INSTRUCTION="${1:-}"
APP=/app
OMBUTO_MAX_SECONDS="${OMBUTO_MAX_SECONDS:-7000}"
OMBUTO_MODEL="${OMBUTO_MODEL:-}"
OMBUTO_AGENT="${OMBUTOCODE_EVAL_DEFAULT_AGENT:-claude}"
export OMBUTOCODE_EVAL_DEFAULT_AGENT="$OMBUTO_AGENT"

# ---------------------------------------------------------------------------
# Agent-logs directory. The task's docker-compose mounts the host trial dir
# `agent-logs/` at ${T_BENCH_CONTAINER_AGENT_LOGS_PATH} (= /agent-logs, see
# DockerComposeManager.CONTAINER_AGENT_LOGS_PATH); the variable itself is not
# exported into the shell, so probe the mount and fall back.
# ---------------------------------------------------------------------------
LOGS_ROOT=""
for candidate in "${T_BENCH_CONTAINER_AGENT_LOGS_PATH:-}" /agent-logs /logs/agent; do
  if [ -n "$candidate" ] && [ -d "$candidate" ] && [ -w "$candidate" ]; then
    LOGS_ROOT="$candidate"
    break
  fi
done
if [ -z "$LOGS_ROOT" ]; then
  LOGS_ROOT="$APP/test_output/ombuto-agent-logs"
  mkdir -p "$LOGS_ROOT"
fi
LOGS="$LOGS_ROOT/ombuto"
mkdir -p "$LOGS"
RUN_LOG="$LOGS/ombuto-run.log"
STAGES_TSV="$LOGS/stages.tsv"
: > "$STAGES_TSV"

log() {
  local line="[ombuto $(date -u +%H:%M:%S)] $*"
  echo "$line"
  echo "$line" >> "$RUN_LOG"
}

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# record <stage> <exit> <started> <finished> <stdout-file> <stderr-file>
record() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" "$6" >> "$STAGES_TSV"
}

# run_stage <stage> <cmd...>: runs in $APP, stdout -> $LOGS/<stage>.json,
# stderr -> $LOGS/<stage>.stderr.log, records the exit code.
run_stage() {
  local stage="$1"; shift
  local out="$LOGS/$stage.json" err="$LOGS/$stage.stderr.log"
  local started finished code
  started="$(now_iso)"
  log "stage $stage: $*"
  (cd "$APP" && "$@") > "$out" 2> "$err"
  code=$?
  finished="$(now_iso)"
  record "$stage" "$code" "$started" "$finished" "$out" "$err"
  log "stage $stage: exit $code"
  return "$code"
}

write_stages_json() {
  node - "$STAGES_TSV" "$LOGS/stages.json" <<'EOF'
const fs = require('fs');
const [tsv, out] = process.argv.slice(2);
const stages = fs.readFileSync(tsv, 'utf8').split('\n').filter(Boolean).map((line) => {
  const [stage, exitCode, startedAt, finishedAt, stdoutFile, stderrFile] = line.split('\t');
  return {
    stage,
    exitCode: Number(exitCode),
    startedAt,
    finishedAt,
    durationSec: Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)),
    stdoutFile,
    stderrFile
  };
});
fs.writeFileSync(out, JSON.stringify(stages, null, 2) + '\n');
EOF
}

copy_out() {
  if [ -f "$APP/.ombutocode/run-manifest.json" ]; then
    cp -f "$APP/.ombutocode/run-manifest.json" "$LOGS/run-manifest.json"
  fi
  if [ -d "$APP/.ombutocode/run-output" ]; then
    rm -rf "$LOGS/run-output"
    cp -r "$APP/.ombutocode/run-output" "$LOGS/run-output"
  fi
  if [ -d "$APP/.ombutocode/logs" ]; then
    rm -rf "$LOGS/logs"
    cp -r "$APP/.ombutocode/logs" "$LOGS/logs"
  fi
  (cd "$APP" && git log --oneline -30 > "$LOGS/git-log.txt" 2>&1; git status --short > "$LOGS/git-status.txt" 2>&1)
  # The container runs as root; let the host user read/remove the artefacts.
  chmod -R a+rwX "$LOGS" 2>/dev/null || true
}

restore_main() {
  # Ombuto squash-merges onto main and checks main back out, but make sure
  # the graded tree is main with no stray uncommitted merge state.
  cd "$APP" || return
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ "$branch" != "main" ] && git show-ref --verify --quiet refs/heads/main; then
    log "checked-out branch is '$branch' — switching back to main"
    git checkout -q main 2>>"$RUN_LOG" || git checkout -q -f main 2>>"$RUN_LOG"
  fi
  if [ -n "$(git stash list 2>/dev/null)" ]; then
    log "restoring stashed working-tree changes left by a merge"
    git stash pop -q 2>>"$RUN_LOG" || true
  fi
  git worktree prune 2>/dev/null || true
}

finish() {
  local summary="$1"
  restore_main
  run_stage status node .ombutocode/src/headless.js status --json
  copy_out
  write_stages_json
  log "$summary"
  log "artefacts: $LOGS"
  echo "OMBUTO_SUMMARY: $summary"
  exit 0
}

# ---------------------------------------------------------------------------
# Toolchain
# ---------------------------------------------------------------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1; then
  log "node is not on PATH — the setup script did not install nvm/node"
  record toolchain 1 "$(now_iso)" "$(now_iso)" "" ""
  echo "OMBUTO_SUMMARY: node missing"
  exit 0
fi

log "start: model=$OMBUTO_MODEL agent=$OMBUTO_AGENT max_seconds=$OMBUTO_MAX_SECONDS logs=$LOGS fake=${OMBUTO_FAKE_AGENT:-0}"
log "node $(node --version), claude: $(command -v claude || echo missing)"

if [ ! -f "$APP/.ombutocode/src/headless.js" ]; then
  log "Ombuto Code is not installed in $APP (missing .ombutocode/src/headless.js)"
  record install 1 "$(now_iso)" "$(now_iso)" "" ""
  write_stages_json
  echo "OMBUTO_SUMMARY: ombuto not installed"
  exit 0
fi

# ---------------------------------------------------------------------------
# Fake agent (dry runs): point every Ombuto template variant at fake-claude.
# ---------------------------------------------------------------------------
if [ "${OMBUTO_FAKE_AGENT:-}" = "1" ]; then
  FAKE=/installed-agent/fake-claude
  # Re-use the shipped claude templates (same args and stdin prompts) with the
  # command swapped, so the fake sees exactly the prompts the real agent would.
  # resolveAgentTemplateConfig reads CLAUDE_COMMAND_TEMPLATE and
  # CLAUDE_<VARIANT>_COMMAND_TEMPLATE (TEST, EVAL, MERGE_RESOLVE, EPIC_EVAL).
  eval "$(node - "$FAKE" "$APP/.ombutocode/codingagent-templates.json" <<'EOF'
const [fake, file] = process.argv.slice(2);
const templates = require(file);
const quote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const lines = [];
for (const key of Object.keys(templates)) {
  if (key !== 'claude' && !key.startsWith('claude_')) continue;
  const variant = key === 'claude' ? '' : key.slice('claude_'.length).toUpperCase() + '_';
  const tpl = { command: fake, args: templates[key].args, stdin: templates[key].stdin };
  lines.push(`export CLAUDE_${variant}COMMAND_TEMPLATE=${quote(JSON.stringify(tpl))}`);
}
process.stdout.write(lines.join('\n') + '\n');
EOF
)"
  log "fake agent enabled: $FAKE (CLAUDE_COMMAND_TEMPLATE + TEST/EVAL/MERGE_RESOLVE/EPIC_EVAL variants)"
fi

# ---------------------------------------------------------------------------
# Stage: model — CLI model id -> Ombuto model id (codingagents.yml `id`).
# ---------------------------------------------------------------------------
# Besides the lookup this pins codingagents.yml to that one tool+model: the
# scheduler rewrites ticket.assignee to the bare tool name once a run starts
# (coreCallbacks.onRunStarted), after which test/eval/retry runs take the
# tool's first *enabled* model. Disabling every other tool and model keeps
# the whole pipeline on the benchmarked model. The original file is kept in
# $LOGS/codingagents.yml.orig.
model_stage() {
  node - "$APP" "$OMBUTO_AGENT" "$OMBUTO_MODEL" "$LOGS" <<'EOF'
const fs = require('fs');
const path = require('path');
const [root, toolId, cliModel, logs] = process.argv.slice(2);
const yaml = require(path.join(root, '.ombutocode', 'src', 'node_modules', 'js-yaml'));
const ymlPath = path.join(root, '.ombutocode', 'codingagents', 'codingagents.yml');
const raw = fs.readFileSync(ymlPath, 'utf8');
const cfg = yaml.load(raw);
const tool = (cfg.tools || []).find((t) => t.id === toolId);
if (!tool) { console.error(`tool "${toolId}" not in codingagents.yml`); process.exit(1); }
if (!cliModel) { console.error('OMBUTO_MODEL is empty — pass --model to tb run'); process.exit(1); }
const models = tool.models || [];
const match = models.find((m) => m.model_id === cliModel) || models.find((m) => m.id === cliModel);
if (!match) {
  console.error(`no model in codingagents.yml for tool "${toolId}" with model_id "${cliModel}". Known: ${models.map((m) => `${m.id} -> ${m.model_id}`).join(', ')}`);
  process.exit(1);
}
fs.writeFileSync(path.join(logs, 'codingagents.yml.orig'), raw);
for (const t of cfg.tools || []) {
  t.enabled = t.id === toolId;
  for (const m of t.models || []) m.enabled = t.id === toolId && m.id === match.id;
}
match.enabled = true;
fs.writeFileSync(ymlPath, yaml.dump(cfg, { lineWidth: 120, noRefs: true }));
process.stdout.write(JSON.stringify({ tool: toolId, cliModel, ombutoModel: match.id, modelId: match.model_id, pinned: true }) + '\n');
EOF
}
if ! run_stage model model_stage; then
  finish "FAILED at model stage: no Ombuto model for '$OMBUTO_MODEL' (see $LOGS/model.stderr.log)"
fi
OMBUTO_MODEL_ID="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ombutoModel)' "$LOGS/model.json")"
export OMBUTO_MODEL_YML_ID="$OMBUTO_MODEL_ID"
log "model: $OMBUTO_MODEL -> $OMBUTO_AGENT:$OMBUTO_MODEL_ID"

# The eval/test phases take their model from headless settings (there is no
# env override for eval_default_model), so pin it to the same model.
mkdir -p "$APP/.ombutocode/data"
node - "$APP/.ombutocode/data/headless-settings.json" "$OMBUTO_MODEL_ID" <<'EOF'
const fs = require('fs');
const [file, model] = process.argv.slice(2);
let data = {};
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
data.eval_default_model = model;
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
EOF

# ---------------------------------------------------------------------------
# Stage: git — Ombuto builds in worktrees, which only see committed content.
# ---------------------------------------------------------------------------
git_stage() {
  cd "$APP" || return 1
  git config --global --add safe.directory "$APP" 2>/dev/null || true
  git config --global --add safe.directory '*' 2>/dev/null || true
  if [ -z "$(git config user.name)" ]; then git config user.name "${GIT_COMMITTER_NAME:-Ombuto Code}"; fi
  if [ -z "$(git config user.email)" ]; then git config user.email "${GIT_COMMITTER_EMAIL:-ombuto@bench.invalid}"; fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git init -q -b main || { git init -q && git checkout -q -b main; } || return 1
    echo "initialised git repository"
  fi
  # Harness scratch files and Ombuto's own runtime state must never be
  # committed, stashed or merged along with the ticket work.
  mkdir -p .git/info
  {
    echo 'test_output/'
    echo '.tbench-testing/'
    echo '.ombutocode/run-manifest.json'
    echo '.ombutocode/data/headless-settings.json'
    echo '.ombutocode/.instance.lock'
  } >> .git/info/exclude
  git add -A . || return 1
  if ! git rev-parse --verify -q HEAD >/dev/null; then
    git commit -q -m "Initial state of the task repository" || return 1
    echo "created initial commit $(git rev-parse --short HEAD)"
  elif ! git diff --cached --quiet; then
    git commit -q -m "Commit task repository state and Ombuto Code workbench" || return 1
    echo "committed pending changes as $(git rev-parse --short HEAD)"
  else
    echo "working tree already clean at $(git rev-parse --short HEAD)"
  fi
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "main" ]; then
    if git show-ref --verify --quiet refs/heads/main; then
      git checkout -q main || return 1
    else
      git branch -m "$branch" main || return 1
    fi
    echo "renamed/switched branch $branch -> main"
  fi
  echo "tracked files: $(git ls-files | wc -l) (under node_modules: $(git ls-files | grep -c node_modules))"
  git log --oneline -3
}
if ! run_stage git git_stage; then
  finish "FAILED at git stage (see $LOGS/git.stderr.log)"
fi

# ---------------------------------------------------------------------------
# Stage: epic
# ---------------------------------------------------------------------------
if [ -f "$APP/INSTRUCTION.md" ]; then
  SPEC="$APP/INSTRUCTION.md"
else
  SPEC="$APP/.ombutocode/bench-instruction.md"
  printf '%s\n' "$INSTRUCTION" > "$SPEC"
  echo '.ombutocode/bench-instruction.md' >> "$APP/.git/info/exclude"
fi
printf '%s\n' "$INSTRUCTION" > "$LOGS/instruction.txt"
log "epic input: $SPEC"

if ! run_stage epic node .ombutocode/src/headless.js epic create \
    --input "$SPEC" --agent "$OMBUTO_AGENT" --model "$OMBUTO_MODEL_ID" --json; then
  finish "FAILED at epic stage (see $LOGS/epic.json / epic.stderr.log)"
fi
EPIC_PATH="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(String((r.result&&r.result.epicPath)||""))' "$LOGS/epic.json")"
if [ -z "$EPIC_PATH" ]; then
  finish "FAILED: epic create returned no epicPath"
fi
log "epic: $EPIC_PATH"

# ---------------------------------------------------------------------------
# Stage: tickets
# ---------------------------------------------------------------------------
# OMBUTO_CLOSEOUT (all|eval|none, default eval): which of the Ticket Generation
# skill's mandatory closeout tickets to keep. Benchmark repositories have no
# help docs or code map, so only the epic-level evaluation closeout is useful.
if ! run_stage tickets node .ombutocode/src/headless.js tickets create \
    --epic "$EPIC_PATH" --assignee "$OMBUTO_AGENT:$OMBUTO_MODEL_ID" --status todo \
    --closeout "${OMBUTO_CLOSEOUT:-eval}" \
    --agent "$OMBUTO_AGENT" --model "$OMBUTO_MODEL_ID" --json; then
  finish "FAILED at tickets stage (see $LOGS/tickets.json / tickets.stderr.log)"
fi
# tickets create rewrites the epic's Status: line; commit it so worktrees see it.
(cd "$APP" && git add -A docs && git commit -q -m "docs: mark $(basename "$EPIC_PATH" .md) as TICKETS" >/dev/null 2>&1 || true)

# ---------------------------------------------------------------------------
# Stage: run (scheduler until drained)
# ---------------------------------------------------------------------------
run_stage run node .ombutocode/src/headless.js run --until drained \
  --max-seconds "$OMBUTO_MAX_SECONDS" --profile benchmark --json
RUN_CODE=$?
case "$RUN_CODE" in
  0) finish "OK: pipeline drained (epic $EPIC_PATH)";;
  3) finish "TIMEOUT: run hit --max-seconds $OMBUTO_MAX_SECONDS (exit 3)";;
  *) finish "FAILED at run stage (exit $RUN_CODE, see $LOGS/run.json / run.stderr.log)";;
esac
