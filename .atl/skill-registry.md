# Skill Registry

Index of LLM-first skills available to agents working in this project. This is an index, not a summary: subagents receive the exact paths below and read the full SKILL.md source of truth. Skipped per scan rules: `sdd-*` phase skills, `_shared`, and `skill-registry` itself.

## Scope

- Project skills: none (greenfield repo, no `skills/`, `.opencode/skills/`, `.claude/skills/`, or other project-level skill dirs).
- User skills scanned: `~/.config/opencode/skills/` and `~/.claude/skills/` (both present and identical). Entries below point at the `~/.config/opencode/skills/` mirror (active runtime for this session).
- Project convention files: none found (no `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `copilot-instructions.md` in the repo root).

## Skills

| Name | Trigger (from description) | Path | Scope |
| ---- | -------------------------- | ---- | ----- |
| branch-pr | Creating, opening, or preparing PRs for review | C:\Users\cseifar\.config\opencode\skills\branch-pr\SKILL.md | user |
| chained-pr | PRs over 400 lines, stacked PRs, review slices; split oversized changes into chained PRs | C:\Users\cseifar\.config\opencode\skills\chained-pr\SKILL.md | user |
| cognitive-doc-design | Writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs | C:\Users\cseifar\.config\opencode\skills\cognitive-doc-design\SKILL.md | user |
| comment-writer | PR feedback, issue replies, reviews, Slack messages, or GitHub comments | C:\Users\cseifar\.config\opencode\skills\comment-writer\SKILL.md | user |
| gentle-ai-bench | bench, journey, driven mode, gentle-ai-bench, journey corpus, bench axis | C:\Users\cseifar\.config\opencode\skills\gentle-ai-bench\SKILL.md | user |
| go-testing | Go tests, go test coverage, Bubbletea teatest, golden files | C:\Users\cseifar\.config\opencode\skills\go-testing\SKILL.md | user |
| issue-creation | Issue creation, bug reports, feature requests, issue approval | C:\Users\cseifar\.config\opencode\skills\issue-creation\SKILL.md | user |
| judgment-day | Judgment day, dual review, adversarial review; blind dual review with scoped fix rounds | C:\Users\cseifar\.config\opencode\skills\judgment-day\SKILL.md | user |
| rdd-defect-workflow | RDD, receipt-driven development, review authority, receipt/lineage, correction/recovery | C:\Users\cseifar\.config\opencode\skills\rdd-defect-workflow\SKILL.md | user |
| systemic-issue-triage | New issue, bug report, triage, backlog, root cause, dead-end, blocked user | C:\Users\cseifar\.config\opencode\skills\systemic-issue-triage\SKILL.md | user |
| work-unit-commits | Commit planning as reviewable work units; implementation, commit splitting, chained PRs | C:\Users\cseifar\.config\opencode\skills\work-unit-commits\SKILL.md | user |
| skill-creator | New skills, agent instructions, documenting AI usage patterns | C:\Users\cseifar\.config\opencode\skills\skill-creator\SKILL.md | user |
| skill-improver | Improve skills, audit skills, refactor skills, skill quality | C:\Users\cseifar\.config\opencode\skills\skill-improver\SKILL.md | user |

Note: an identical mirror of every entry above exists under `C:\Users\cseifar\.claude\skills\<name>\SKILL.md`.