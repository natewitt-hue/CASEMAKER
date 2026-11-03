#!/usr/bin/env python
"""Agent budget guard (PreToolUse + PostToolUse). Agent kit v1.

One script, two homes. They are kept byte-identical:
  - machine-wide: ~/.claude/hooks/agent_budget.py, run with --scope user from
    ~/.claude/settings.json. Covers every project for every Anthropic account
    on this Windows user.
  - per repo: <repo>/.claude/hooks/agent_budget.py, from the repo's
    .claude/settings.json. Travels with the repo to other machines.
When both exist, the user-scope run stands down, so nothing is counted twice.

Why: the 2026-11-02 BookedInIowa token review found 78% of Claude spend inside
subagents. Builders and fixers ran 300 to 900 calls each at ~175k context per
call; one fix round cost 29M weighted tokens. Nothing told an agent to stop.

What it does (subagents only; the main session is left to session_budget.py):
  1. PreToolUse on Agent/Task: build, fix, critic, review or verify work must
     go to a typed agent (builder, critic, or the project's own typed agents
     such as ATLAS's implementer). Untyped or general-purpose dispatches of that
     work are denied. Research, lookups and other dispatches pass.
  2. Every subagent tool call is counted per agent_id. At `warn` calls the
     agent is told to wrap up; at `stop` it is told to stop; past `hard` every
     tool except Write and Edit is denied so it writes its state file and
     returns. Typed agents also carry maxTurns; this is the backstop.

Per-project override: <repo>/.claude/agent-budget.json, e.g.
  {"warn": 120, "stop": 160, "hard": 220, "guard_dispatch": true}
Set "enabled": false to turn the guard off for a project.

Account-free: counts live in the OS temp dir. Fails open: any error exits 0
with no output. ASCII-only output (Windows hooks use cp1252).
Check it with:  py agent_budget.py --selftest
"""
import json
import os
import re
import sys
import tempfile
import time

DEFAULTS = {"enabled": True, "warn": 120, "stop": 160, "hard": 220,
            "guard_dispatch": True}
ALLOWED_AFTER_HARD = {"Write", "Edit"}
ESCAPE = "[no-builder]"
OPEN_TYPES = {"", "general-purpose", "gp", "fork", "claude"}
GUARDED_WORK = re.compile(
    r"\b(build|builds|implement|fix|fixes|fixing|wire|wiring|port|polish|"
    r"critic|critique|review|re-?review|verify|verification|qa|audit pass|"
    r"round \d+|pass \d+)\b",
    re.I,
)
STATE_DIR = os.path.join(tempfile.gettempdir(), "bii-agent-budget")
HOME_AGENTS = os.path.join(os.path.expanduser("~"), ".claude", "agents")


def _root(data):
    return os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ""


def _config(data):
    cfg = dict(DEFAULTS)
    try:
        with open(os.path.join(_root(data), ".claude", "agent-budget.json"),
                  encoding="utf-8") as fh:
            cfg.update(json.load(fh))
    except Exception:
        pass
    return cfg


def _typed_agents_available(data):
    """builder and critic exist in this repo or machine-wide."""
    for d in (os.path.join(_root(data), ".claude", "agents"), HOME_AGENTS):
        if (os.path.isfile(os.path.join(d, "builder.md"))
                and os.path.isfile(os.path.join(d, "critic.md"))):
            return True
    return False


def _project_copy_exists(data):
    p = os.path.join(_root(data), ".claude", "hooks", "agent_budget.py")
    try:
        return (os.path.isfile(p) and os.path.normcase(os.path.abspath(p))
                != os.path.normcase(os.path.abspath(__file__)))
    except Exception:
        return False


def _count_path(data):
    key = "%s_%s" % (data.get("session_id") or "nosession", data.get("agent_id"))
    key = re.sub(r"[^A-Za-z0-9_.-]", "_", key)[:180]
    return os.path.join(STATE_DIR, key + ".cnt")


def _bump(path):
    """Append one byte and return the file size: safe for parallel agents."""
    os.makedirs(STATE_DIR, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, b".")
    finally:
        os.close(fd)
    return os.path.getsize(path)


def _peek(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def _cleanup():
    try:
        cutoff = time.time() - 3 * 86400
        for name in os.listdir(STATE_DIR):
            p = os.path.join(STATE_DIR, name)
            if os.path.getmtime(p) < cutoff:
                os.remove(p)
    except Exception:
        pass


def _deny(reason):
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                   "permissionDecision": "deny",
                                   "permissionDecisionReason": reason}}


def check_dispatch(data, cfg):
    if not cfg.get("guard_dispatch", True):
        return None
    ti = data.get("tool_input") or {}
    sub = str(ti.get("subagent_type") or "").strip().lower()
    desc = ti.get("description") or ""
    if ESCAPE in desc.lower() or sub not in OPEN_TYPES:
        return None
    if not GUARDED_WORK.search(desc) or not _typed_agents_available(data):
        return None
    return _deny(
        "Agent budget rule: build, fix and wiring work goes to a typed agent "
        "(subagent_type \"builder\", or this project's own implementer); "
        "critic, review and verify work goes to \"critic\" (or the project's "
        "own critic). Typed agents carry a turn cap and a small tool list and "
        "cannot spawn agents. Re-dispatch with the right subagent_type and a "
        "prompt that names the files, the check to pass and the state file to "
        "write. Research and lookups can use Explore. If the Agent tool says "
        "builder or critic is not found, this session started before they "
        "existed: start a new session, or as a last resort begin the "
        "description with [no-builder]."
    )


def pre(data, cfg):
    if data.get("tool_name") in ("Agent", "Task"):
        out = check_dispatch(data, cfg)
        if out:
            return out
    if not data.get("agent_id"):
        return None
    n = _peek(_count_path(data))
    hard = int(cfg["hard"])
    if n >= hard and data.get("tool_name") not in ALLOWED_AFTER_HARD:
        return _deny(
            "Agent budget exhausted (%d tool calls, cap %d). Only Write and "
            "Edit still run. Write your state file now (what is done, what is "
            "left, files touched, checks run and their results), then return "
            "your report. The parent starts a fresh agent for the rest."
            % (n, hard))
    return None


def post(data, cfg):
    if not data.get("agent_id"):
        return None
    n = _bump(_count_path(data))
    if n in (1, 50):
        _cleanup()
    warn, stop, hard = int(cfg["warn"]), int(cfg["stop"]), int(cfg["hard"])
    msg = None
    if n == warn:
        msg = ("Agent budget: %d tool calls used. Finish the current step, run "
               "the check once, and plan to return within about %d calls. Do "
               "not start new scope." % (n, stop - warn))
    elif n == stop:
        msg = ("Agent budget: %d tool calls. Stop working now. Write your state "
               "file (done, left, files, check results) and return your "
               "report. At %d calls every tool but Write and Edit is denied."
               % (n, hard))
    if msg:
        return {"hookSpecificOutput": {"hookEventName": "PostToolUse",
                                       "additionalContext": msg}}
    return None


def run(data, scope):
    if scope == "user" and _project_copy_exists(data):
        return None
    cfg = _config(data)
    if not cfg.get("enabled", True):
        return None
    ev = data.get("hook_event_name")
    if ev == "PreToolUse":
        return pre(data, cfg)
    if ev == "PostToolUse":
        return post(data, cfg)
    return None


def main(scope):
    try:
        out = run(json.loads(sys.stdin.read() or "{}"), scope)
        if out:
            sys.stdout.write(json.dumps(out))
            sys.stdout.flush()
    except Exception:
        pass
    return 0


def selftest():
    global STATE_DIR, HOME_AGENTS
    STATE_DIR = tempfile.mkdtemp(prefix="bii-budget-test-")
    proj = tempfile.mkdtemp(prefix="bii-budget-proj-")
    os.makedirs(os.path.join(proj, ".claude", "agents"))
    for n in ("builder.md", "critic.md"):
        open(os.path.join(proj, ".claude", "agents", n), "w").close()
    HOME_AGENTS = os.path.join(STATE_DIR, "no-home-agents")
    os.environ["CLAUDE_PROJECT_DIR"] = proj
    ok = True

    def expect(cond, label):
        nonlocal ok
        print(("PASS " if cond else "FAIL ") + label)
        ok = ok and bool(cond)

    def d(**k):
        return dict({"session_id": "s1", "hook_event_name": "PreToolUse"}, **k)

    def agent(desc, sub=None):
        ti = {"description": desc, "prompt": "x"}
        if sub:
            ti["subagent_type"] = sub
        return run(d(tool_name="Agent", tool_input=ti), "project")

    r = agent("Fix round PlumbingTriage")
    expect(r and r["hookSpecificOutput"]["permissionDecision"] == "deny", "deny untyped fix")
    expect(agent("Critic pass: Eagle Electric", "general-purpose"), "deny general-purpose critic")
    expect(agent("Build LawnQuote", "builder") is None, "allow builder")
    expect(agent("Critic pass: Eagle", "critic") is None, "allow critic")
    expect(agent("Implement board fix", "implementer") is None, "allow project typed agent")
    expect(agent("Find Iowa roofing prices") is None, "allow research")
    expect(agent("review the docs layout", "Explore") is None, "allow typed Explore")
    expect(agent("[no-builder] Fix round X") is None, "escape marker passes")
    os.environ["CLAUDE_PROJECT_DIR"] = STATE_DIR
    expect(agent("Fix round X") is None, "no builder anywhere: guard stands down")
    os.environ["CLAUDE_PROJECT_DIR"] = proj
    expect(run(d(tool_name="Bash", tool_input={}), "project") is None, "main session never counted")
    cfg = dict(DEFAULTS)
    msgs = [i + 1 for i in range(cfg["hard"])
            if run(d(hook_event_name="PostToolUse", tool_name="Bash", agent_id="a1"), "project")]
    expect(msgs == [cfg["warn"], cfg["stop"]], "warnings at warn and stop (got %s)" % msgs)
    r = run(d(tool_name="Bash", agent_id="a1"), "project")
    expect(r and "exhausted" in r["hookSpecificOutput"]["permissionDecisionReason"], "deny Bash past hard cap")
    expect(run(d(tool_name="Write", agent_id="a1"), "project") is None, "allow Write past hard cap")
    expect(run(d(tool_name="Bash", agent_id="a2"), "project") is None, "other agent unaffected")
    with open(os.path.join(proj, ".claude", "agent-budget.json"), "w") as fh:
        json.dump({"hard": 5}, fh)
    for _ in range(5):
        run(d(hook_event_name="PostToolUse", tool_name="Bash", agent_id="a3"), "project")
    expect(run(d(tool_name="Bash", agent_id="a3"), "project"), "project override lowers hard cap")
    with open(os.path.join(proj, ".claude", "agent-budget.json"), "w") as fh:
        json.dump({"enabled": False}, fh)
    expect(agent("Fix round X") is None, "project can disable the guard")
    os.makedirs(os.path.join(proj, ".claude", "hooks"))
    open(os.path.join(proj, ".claude", "hooks", "agent_budget.py"), "w").close()
    os.remove(os.path.join(proj, ".claude", "agent-budget.json"))
    expect(run(d(tool_name="Agent", tool_input={"description": "Fix X"}), "user") is None,
           "user scope stands down when repo has its own copy")
    expect(run(d(tool_name="Agent", tool_input={"description": "Fix X"}), "project"),
           "project scope still guards")
    print("ALL PASS" if ok else "SOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(main("user" if "--scope" in sys.argv and "user" in sys.argv else "project"))
