# ExpertFlow Autograding Action

GitHub Action that runs an assignment's autograding test config and emits structured,
machine-readable results for the ExpertFlow grading pipeline. Adapted from the archived
[`github-education-resources/autograding`](https://github.com/github-education-resources/autograding)
action (MIT). Lives in this repo for review; it will be promoted to
`Ensign-College/autograding` (referenced as `Ensign-College/autograding@v1`)
on approval.

The test config schema and execution semantics are unchanged from the original: `tests[]`
of `{name, setup, run, input, output, comparison: exact|included|regex, timeout (minutes),
points}`, executed via `spawn` with `shell: true`, with stdin preloading and setup/run
timeout carry-over. Failing tests do not stop the suite; the action fails at the end
(after writing results) so the workflow run concludes `failure`.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `grading-run-id` | no | — | ExpertFlow GradingRun id, echoed into the results file for correlation. |
| `sha` | no | `GITHUB_SHA` | Commit SHA being graded. |
| `config-path` | no | `.github/classroom/autograding.json` | Test config path relative to the workspace. |
| `token` | no | — | Token for the check-run update; `GITHUB_TOKEN` env takes precedence. |

## Outputs

| Output | Description |
|---|---|
| `points` | `"<earned>/<available>"`, e.g. `7/10`. |
| `results-path` | Absolute path to the generated `autograding-results.json`. |

The action also updates the workflow's `Autograding` check run with `Points X/Y` as
student-facing feedback; any failure there is non-fatal (logged as a warning).

## Results file (`autograding-results.json`, schema version 1)

Written to `GITHUB_WORKSPACE`; the template workflow uploads it as the
`autograding-results` artifact (with `if: always()`).

```json
{
  "version": 1,
  "gradingRunId": "gr_123",
  "repository": "Ensign-College/python-first-programs-starter-student1",
  "sha": "abc1234...",
  "startedAt": "2026-07-31T18:00:00Z",
  "finishedAt": "2026-07-31T18:00:41Z",
  "pointsEarned": 7,
  "pointsAvailable": 10,
  "tests": [
    {
      "name": "Greeting Message",
      "status": "pass",
      "pointsEarned": 1,
      "pointsAvailable": 1,
      "durationMs": 830,
      "message": null
    }
  ]
}
```

Per-test `status` is `pass | fail | error | timeout` (`fail` = output mismatch, `error` =
non-zero exit or spawn error, `timeout` = exceeded the test's timeout). `message` is the
error / expected-vs-actual excerpt, truncated to ~2000 chars, `null` on pass. Tests
without points still appear with `pointsAvailable: 0`.

## Template workflow

`template-workflow/classroom.yml` is the canonical workflow for assignment templates
(overlay of trusted tests + config, this action, artifact upload). See
`docs/GradingPipeline.md` in the parent repo for the full pipeline design.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build   # ncc bundle -> dist/index.js (committed; the runner executes dist directly)
```

`dist/` must be rebuilt and committed whenever `src/` changes.
