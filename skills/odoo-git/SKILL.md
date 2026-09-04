---
name: odoo-git
description: >-
  Odoo's git conventions: commit message format ([TAG] module: header, a
  why-first body, reference trailers), which branch a change targets, branch
  naming, and pull request hygiene. Use when writing or amending a commit
  message, choosing the branch a fix or feature goes to, or opening or
  updating a pull request on an Odoo repository.
---

# Odoo git conventions

These conventions apply to every commit and pull request on an Odoo repository
(community, enterprise, and their forks). They are house rules, not general git
advice.

## Commit message

A commit message is a header `[TAG] module: summary`, a blank line, a body that
says **why** the change is made, and reference trailers last, one per line.

```
[FIX] library: keep loans visible after a book is archived

Before this commit, archiving a book hid its open loans from the member's
portal page, because the loan list was searched through the book with the
default active filter. Members lost track of what they still had to return.

After this commit, the loan list searches loans directly, with
active_test disabled on the book relation, so an archived book still shows
its open loans until they are returned.

task-1234
opw-5678
```

```
[IMP] library, *: bugfix and improvements

Fixed the loan list and improved the portal page. Also updated the tests.
```

The second message fails on every part: the tag does not match the content, the
header is not a sentence, the body says what instead of why, and nothing links
it to a task.

### Header

- `[TAG]`, a space, the module's technical name, a colon, a space, then the
  summary. Several modules: `[FIX] library, portal:`. Many modules: the main
  one then `*` (`[REF] library, *:`), or `*` alone for a transversal change.
- The summary completes the sentence "if applied, this commit will ...": an
  imperative verb, no trailing period, about 50 characters and never past 70.
  "bugfix", "improvements", "changes" are not summaries.
- Tags:

  | Tag | Use |
  | --- | --- |
  | `[FIX]` | bug fix, in stable or in master |
  | `[IMP]` | incremental improvement, the default in master |
  | `[REF]` | refactoring, a feature heavily rewritten |
  | `[ADD]` | new module |
  | `[REM]` | removed resources: dead code, views, modules |
  | `[MOV]` | files or code moved without content change, so history follows |
  | `[REV]` | revert of an earlier commit |
  | `[PERF]` | performance |
  | `[CLN]` | cleanup |
  | `[LINT]` | lint pass |
  | `[I18N]` | translation files |
  | `[REL]` | release |
  | `[MERGE]` | merge commit |
  | `[CLA]` | signing the contributor license agreement |

### Body

- Why first: the purpose of the change, what was wrong for whom. The diff
  already shows what changed; describe the what only for a technical choice,
  and then say why that choice. "The PO team asked for it" is not a why.
- "Before this commit, ... After this commit, ..." is a common shape for the
  why and the outcome; use it when it fits.
- Wrap at about 72 characters. Be complete rather than short: for most readers
  the message is the whole change.

### Trailers

- One per line, after the body: `task-123` (task), `opw-123` (support
  ticket), `runbot-123` (runbot error), `Fixes #123` (a GitHub issue this
  closes), `Co-authored-by: Name <email>`.
- Leave the rest to the bots: `closes odoo/odoo#123`, `Signed-off-by`,
  `Related: odoo/enterprise#123` are added at merge; `X-original-commit`,
  `Forward-port-of`, `Part-of` by the forward-port bot. Merge, release, and
  forward-port commits are written by the tooling; keep them as generated.

## Branches and pull requests

- Target: a bug fix goes to the oldest supported stable version that has the
  bug, never to master; a feature or any unstable change goes to master; a
  localization goes to either. A fix merged in a stable version is
  forward-ported to the newer versions by the bots.
- One pull request per patch: never open the same patch against several
  branches. If the forward-port needs manual help, do it in the forward-port
  PR the bot opened.
- Branch name: `<target>-<topic>-<trigram>` (`19.0-loan-archive-fix-abc`,
  `master-library-portal-abc`); the bots suffix their forward-ports with
  `-fw`.
- One logical change per commit, and one module per commit unless the change
  is inseparable; a move is its own `[MOV]` commit before the `[REF]` that
  edits the moved code.
- Rebase on the target branch before submitting and whenever it conflicts;
  squash fixups into the commit they fix. A PR carries only the commits that
  should land, never "address review" commits or merge commits.
- A change to a stable version follows
  [0016](../odoo-guidelines/guidelines/0016_stable_changes.md) of
  odoo-guidelines; a PR description explains why, as the commit message does,
  and links the task or ticket.
- A bug fix comes with a test that reproduces it when one is possible.
- An external contributor signs the CLA in the PR, once.
