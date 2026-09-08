"""
Ombuto Code as an installed agent.

Ombuto Code (https://github.com/FrancoisBotha/ombutocode) is an agentic
engineering workbench: it turns a specification into an epic, breaks the epic
into tickets, and runs a scheduler that implements, tests, evaluates and
squash-merges each ticket through Claude Code (`claude --print`). This adapter
installs the pinned Ombuto release into the task's /app repository and drives
the four headless CLI stages from a single bash script
(`ombuto-run.sh`, written into /installed-agent by the setup script).

The harness scores the /app working tree afterwards; per-stage JSON output,
Ombuto's run manifest and its run logs are copied into the mounted agent-logs
directory (`/agent-logs/ombuto/`) so trajectories can be inspected on the host.
"""

import os
import shlex
from pathlib import Path

from terminal_bench.agents.agent_name import AgentName
from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)
from terminal_bench.terminal.models import TerminalCommand


class OmbutoAgent(AbstractInstalledAgent):
    # Ombuto Code release tag (git tag on GitHub; the matching
    # `create-ombutocode` npm version is the tag without the leading "v").
    DEFAULT_VERSION = "v0.2.15"
    # @anthropic-ai/claude-code version Ombuto drives.
    DEFAULT_CLAUDE_VERSION = "latest"
    # Ombuto's own wall-clock budget for `run --until drained`. Kept a little
    # under the usual 7200 s task budget so Ombuto trips first and still writes
    # its manifest before the harness kills the session.
    DEFAULT_MAX_SECONDS = 7000

    @staticmethod
    def name() -> str:
        return AgentName.OMBUTO.value

    def __init__(self, model_name: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._model_name = model_name
        self._version = kwargs.get("version") or self.DEFAULT_VERSION
        self._claude_version = str(
            kwargs.get("claude_version") or self.DEFAULT_CLAUDE_VERSION
        )
        self._max_seconds = str(
            kwargs.get("max_seconds")
            or os.environ.get("OMBUTO_MAX_SECONDS")
            or self.DEFAULT_MAX_SECONDS
        )
        # Optional closeout tickets appended by ticket generation
        # (all|eval|none). Default none, matching the product default.
        self._closeout = str(
            kwargs.get("closeout") or os.environ.get("OMBUTO_CLOSEOUT") or "none"
        )

    def _get_template_variables(self) -> dict[str, str]:
        version = str(self.version or self.DEFAULT_VERSION)
        agent_dir = Path(__file__).parent
        return {
            "version": version,
            # npm package version of the pinned installer (tag minus "v").
            "installer_version": version[1:] if version.startswith("v") else version,
            "claude_version": self._claude_version,
            # The harness only copies the rendered setup script into the
            # container, so the run script and the dry-run stub travel inside
            # it as heredocs. Passed as variables (not {% include %}) so their
            # contents are never parsed as Jinja.
            "run_script": (agent_dir / "ombuto-run.sh").read_text(),
            "fake_agent_script": (agent_dir / "fake-claude.js").read_text(),
        }

    @property
    def _env(self) -> dict[str, str]:
        env: dict[str, str] = {
            # Ombuto: the per-ticket test/eval phases and the planning stages
            # default to this tool when no --agent is given.
            "OMBUTOCODE_EVAL_DEFAULT_AGENT": "claude",
            "OMBUTO_MAX_SECONDS": self._max_seconds,
            "OMBUTO_CLOSEOUT": self._closeout,
            # Ombuto commits epics, ticket branches and squash-merges, so git
            # needs an identity in the container.
            "GIT_AUTHOR_NAME": os.environ.get("GIT_AUTHOR_NAME", "Ombuto Code"),
            "GIT_AUTHOR_EMAIL": os.environ.get(
                "GIT_AUTHOR_EMAIL", "ombuto@bench.invalid"
            ),
            "GIT_COMMITTER_NAME": os.environ.get(
                "GIT_COMMITTER_NAME", "Ombuto Code"
            ),
            "GIT_COMMITTER_EMAIL": os.environ.get(
                "GIT_COMMITTER_EMAIL", "ombuto@bench.invalid"
            ),
        }

        # Same credential passthrough as the claude-code adapter.
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
        if api_key:
            env["ANTHROPIC_API_KEY"] = api_key
        elif auth_token:
            env["ANTHROPIC_API_KEY"] = auth_token
        if auth_token:
            env["ANTHROPIC_AUTH_TOKEN"] = auth_token
        base_url = os.environ.get("ANTHROPIC_BASE_URL")
        if base_url:
            env["ANTHROPIC_BASE_URL"] = base_url

        # CLI model id (e.g. claude-sonnet-4-6). ombuto-run.sh maps it to the
        # Ombuto model id from codingagents.yml and fails loudly on no match.
        if self._model_name:
            env["OMBUTO_MODEL"] = self._model_name.removeprefix("anthropic/")
        elif "OMBUTO_MODEL" in os.environ:
            env["OMBUTO_MODEL"] = os.environ["OMBUTO_MODEL"]

        # Dry-run switch: OMBUTO_FAKE_AGENT=1 on the host makes ombuto-run.sh
        # point every Ombuto agent template at /installed-agent/fake-claude, a
        # stub that satisfies each phase's output contract without calling any
        # model. Used to exercise the pipeline at zero API cost.
        # Experiment knobs passed straight through when set on the host.
        for key in ("OMBUTOCODE_MAX_EVAL_RETRIES", "OMBUTO_CLOSEOUT"):
            if os.environ.get(key):
                env[key] = os.environ[key]

        if os.environ.get("OMBUTO_FAKE_AGENT"):
            env["OMBUTO_FAKE_AGENT"] = os.environ["OMBUTO_FAKE_AGENT"]

        return env

    @property
    def _install_agent_script_path(self) -> Path:
        return self._get_templated_script_path("ombuto-setup.sh.j2")

    def _run_agent_commands(self, instruction: str) -> list[TerminalCommand]:
        escaped_instruction = shlex.quote(instruction)
        return [
            TerminalCommand(
                command=f"bash /installed-agent/ombuto-run.sh {escaped_instruction}",
                min_timeout_sec=0.0,
                max_timeout_sec=float("inf"),
                block=True,
                append_enter=True,
            ),
        ]
