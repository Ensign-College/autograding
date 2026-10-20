---
name: document-grading-architecture
description: >-
  Keeps architecture documentation in sync with the grading end-to-end flow
  (Canvas Live Events → SQS → grading dispatch worker → GitHub Actions →
  grading completion worker → Canvas grade passback). Use whenever a change
  touches grading services, grading workers, grading API routes, the
  grading-action, grading Prisma models, or grading AWS infrastructure
  (Lambda handlers, SQS queues, DynamoDB gates), or when the user mentions
  the grading pipeline, autograding, grade passback, or grading architecture.
---

# Document Grading Architecture

After making any change to the grading end-to-end flow, update the
architecture docs before finishing the task. Documentation updates are part
of the change, not a follow-up.

## When this skill applies

A change touches the grading flow if it modifies any of:

**ExpertFlow app** (`/Users/sean.murdock/NextProjects/expertflow`)

- `src/services/grading.service.ts`, `src/services/grading-queue.service.ts`
- `src/services/github-app.service.ts`, and grade passback paths in
  `src/services/canvas-client.service.ts`
- `src/workers/grading-dispatch.worker.ts`,
  `src/workers/grading-completion.worker.ts`, `src/workers/grading-sweeper.ts`
- `src/app/api/github/events/**`
- `src/app/api/internal/grading-dispatch/**`, `grading-completion/**`,
  `grading-sweep/**`
- `prisma/schema.prisma` — `AssignmentGradingConfig`, `GradingRun`,
  `GradingRunStatus`

**Autograding action** (`/Users/sean.murdock/GitHubActions/autograding`)

- `src/**`, `action.yml`, `template-workflow/`, `dist/`

**AWS infra** (`/Users/sean.murdock/TerraformProjects/ExpertFlowAWS`)

- `lambda/handlers/grading_dispatch.cjs`, `grading_completion.cjs`,
  `grading_sweeper.cjs`
- `vercel-aws-sqs/**` (grading queues, DynamoDB `grading-assignments`,
  EventBridge schedules)

## Documentation targets

Update every doc affected by the change; leave the rest untouched.

- `expertflow/docs/GradingPipeline.md` — **canonical grading architecture**.
  Update for any flow, worker, API route, data model, status lifecycle, or
  design-decision change. Keep the mermaid sequence diagram accurate.
- `autograding/README.md` — update for action inputs/outputs, results schema,
  or template-workflow behavior changes.
- `expertflow/docs/LambdaSqsBlueprint.md` — update for queue topology or
  Lambda+SQS pattern changes shared with other flows.
- `ExpertFlowAWS/docs/grading-sqs-flow.md` — update for SQS queue, Lambda
  handler, DynamoDB gate, EventBridge sweeper schedule, or SNS filtering
  changes.

If a change spans app and infra, update docs in **both** repos in the same
task.

## Workflow

1. Identify which stage(s) of the pipeline changed: Canvas event intake →
   SQS/Lambda dispatch gate → dispatch worker → GitHub Actions run →
   completion webhook/worker → sweeper backstop → Canvas grade passback.
2. Read the affected doc(s) from the list above and find the sections
   describing those stages.
3. Update prose, tables, and mermaid diagrams so they match the new
   behavior. Update, don't append: replace stale statements rather than
   adding "as of now" notes.
4. If the change adds or removes an entry point, worker, queue, model, or
   environment variable, update every doc that enumerates it.
5. Record significant design decisions (new gate, changed verification rule,
   new failure mode) in the decisions section of `GradingPipeline.md` with a
   one-line rationale.
6. Validate before finishing:
   - Markdown: run `npx -y markdownlint-cli2 "<changed files>"` and fix
     issues relevant to your edits.
   - Mermaid: extract each edited mermaid block to a temp `.mmd` file and
     run `npx -y @mermaid-js/mermaid-cli -i /tmp/diagram.mmd -o
     /tmp/diagram.svg`; fix syntax until it passes.

## What to document (and what not to)

- Document behavior and contracts: stages, triggers, queue names,
  verification rules (SHA check, workflow blob allowlist), status
  lifecycle, retry/sweeper semantics.
- Do not duplicate code into docs; link to file paths instead.
- Do not document unrelated repos: `gitgrade` is a separate GitHub
  Classroom→Canvas sync product with its own docs. Only touch it if the
  change is explicitly in that repo.
