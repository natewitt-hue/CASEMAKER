# Agent budget

How Claude and Codex sessions spend tokens without burning them. This is agent kit v1. Its source of truth is `~/.claude/agent-kit/` on Nate's PC, and every repo keeps a copy of it. The kit is plain files with no account settings, so it behaves the same under every Anthropic or OpenAI account, every Windows user and every machine that has the files.

## Why

The 2026-11-02 review of every BookedInIowa transcript found:

| Finding | Number |
|---|---|
| Claude spend inside subagents | 78% |
| Calls per builder or fixer agent | 300 to 900 |
| Context resent on each of those calls | about 175k tokens |
| Most expensive single fix round | 29M weighted tokens |
| Critic, verify and fix agents, share of Claude spend | a third |
| Codex input in BookedInIowa in five days | 11.2B tokens |
| Codex input spent on agents waiting for other agents | 20% |
| Startup load before any work: session, subagent | 85k, 60k tokens |

Cost is calls times context. Capping context alone saved little. The waste was agents that never stopped, critics that never agreed the work was done, and Codex agents that spawned agents and polled them.

## The rules

1. **Typed agents do the work.** Build, fix and wiring work goes to `builder`. Critic, review and verify work goes to `critic`. A project may use its own typed agents instead, such as ATLAS's `implementer`. Typed agents carry a turn cap and a short tool list, and they cannot spawn agents.
2. **One critic pass against a written bar.** The critic grades against the project's written quality bar and checks the real target, not only a preview. It returns bugs, polish and owner questions as three separate lists. Only bugs reopen approved work. Polish is batched for the wave, and owner questions go to the owner. A later pass may only confirm that the bugs were fixed.
3. **Short agents, fresh starts.** An agent writes a state file and returns. To continue, the parent starts a fresh agent from that file, instead of letting one agent grind on.
4. **Work cheaply inside an agent.** Read a file once. Start one background server and check its port, with no sleep loops. Take screenshots only of finished states, at phone and desktop width. Run the check once, and treat a second red as a report.
5. **Codex runs one level deep.** The root session may spawn up to four workers, and workers spawn none. Waits block for up to ten minutes and don't poll. Context compacts at 350k. Codex works in a worktree, never in a repo's main checkout. A status question is answered from the project's status doc before anyone re-explores the code.
6. **Main sessions end on time.** When `session_budget.py` warns, finish the current task, write a handoff and start fresh.

## What enforces it

| Rule | Enforced by |
|---|---|
| Typed agents for build, fix and critic work | `agent_budget.py` denies untyped or general-purpose dispatches of that work |
| Agent turn cap | `maxTurns` in `builder` (150) and `critic` (60), plus the hook. The hook warns at 120 calls, says stop at 160, and allows only Write and Edit past 220. |
| Small agent context | The `tools:` allowlist and `autoCompactWindow: 160000` in the agent files |
| Codex depth, threads, waits, compaction | `.codex/config.toml` in the repo, plus `~/.codex/config.toml` machine-wide |
| One critic pass, three lists | The `critic` agent's instructions, plus this doc |
| Working habits | The `builder` agent's instructions, plus this doc |

## Overrides

- To change a repo's caps, add `.claude/agent-budget.json`, for example `{"warn": 120, "stop": 160, "hard": 220}`. To turn the guard off for a repo, use `{"enabled": false}`.
- A session that started before the agent files existed can't see `builder`. Start a new session. As a last resort, begin the dispatch description with `[no-builder]`.
- A dispatch that isn't build, fix or critic work, such as research or a lookup, is never blocked.

## Adding the kit to a repo

Run this from Git Bash:

```bash
bash ~/.claude/agent-kit/install.sh /path/to/repo
```

It adds the hook, the `builder` and `critic` agents, the hook registration in `.claude/settings.json`, `.codex/config.toml` and this doc. It never overwrites an existing agent, Codex config or doc, so a repo's own versions are kept. Commit what it adds.

On Nate's PC the machine-wide copies also cover a repo that hasn't run the installer. A repo's own copy wins over the machine-wide one, so nothing is counted twice.
