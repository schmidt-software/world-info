# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Language

- Chat with the user is in German.
- Everything that goes into the repository is in English: code, comments, log and console messages, documentation, commit messages, branch names, PR titles and descriptions, issue text.
- Do not use emoticons or emojis in generated text.

## Repository handling

- Never push directly to `main`. All changes reach `main` through pull requests.
- Always work on a branch named by change type: `feature/...`, `bugfix/...`, `docs/...`, `chore/...`.
- Mark pull requests with `WIP` in the title until the user says to remove it.
- Make atomic commits: one logical change per commit (a feature, a fix and a docs update are separate commits). Stage selectively when the working tree holds several concerns. Committing on a feature branch does not need prior approval; pushing and opening PRs follows the rules above.
- Never rewrite published history (force push, rebase of pushed branches) without explicit approval.

## Review before merge

- The user reviews every pull request locally before it is merged. After opening a PR, check out its branch and serve the site on port 8123 in the background: `python3 -m http.server 8123 --bind 127.0.0.1 --directory site`, then tell the user it is ready at http://127.0.0.1:8123/.
- Keep the server running until the user approves the merge; stop it only when asked.
- If port 8123 is taken, report it instead of silently switching ports.

## Open plans

Plans that span sessions or machines live in `docs/plans/`. At the start of a session, check this list and remind the user of open plans that relate to the current task.

- `docs/plans/api-key-setup.md`: register with the providers of the key-based snapshot layers, store the keys as repository secrets and verify every layer with real data. Status: open.

## Commit messages

Use the conventional commit format for the subject line: `feat:`, `fix:`, `docs:`, `style:`, `test:`, `ci:`, `chore:`, `breaking:`.

- MEANINGFUL: subjects must be specific. Vague subjects such as "Update", "Fix", "Changes", "WIP", "minor", "cleanup" are violations.
- DESCRIPTIVE: explain WHAT was changed and, where it is not obvious, WHY.

## Pull requests

- Title and description follow the same rules as commit messages: English, specific, explaining what and why.
- Include working code only: no stubs.
- Add or update tests for new behavior.
- Update documentation when behavior, interfaces or setup change.

## Versioning

Follow [Semantic Versioning](https://semver.org/) (`vMAJOR.MINOR.PATCH`) once releases exist:

- MAJOR: breaking changes (removed option, changed API contract)
- MINOR: backwards-compatible new features
- PATCH: backwards-compatible bug fixes and dependency updates

Releases are created by pushing a semver tag, for example `git tag v1.2.3 && git push origin v1.2.3`.

## Identity and privacy

- Never derive names, company names or address details from the user's work e-mail address and write them into repository artifacts (licenses, copyright lines, author fields, READMEs).
- When a name or identity is needed for a public artifact and none is given, ask instead of guessing.
