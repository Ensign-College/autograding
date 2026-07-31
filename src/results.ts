// Writes the structured autograding-results.json consumed by the ExpertFlow
// grading completion worker. Schema version 1 — see docs/GradingPipeline.md.
import fs from 'fs'
import path from 'path'
import {RunSummary, TestResult} from './runner'

export const RESULTS_FILENAME = 'autograding-results.json'

export interface ResultsMeta {
  gradingRunId: string | null
  sha: string | null
  startedAt: string
  finishedAt: string
}

export interface ResultsFile {
  version: 1
  gradingRunId: string | null
  repository: string | null
  sha: string | null
  startedAt: string
  finishedAt: string
  pointsEarned: number
  pointsAvailable: number
  tests: TestResult[]
}

/**
 * Writes autograding-results.json into GITHUB_WORKSPACE and returns its
 * absolute path.
 */
export const writeResults = (summary: RunSummary, meta: ResultsMeta): string => {
  const workspace = process.env['GITHUB_WORKSPACE']
  if (!workspace) {
    throw new Error('No GITHUB_WORKSPACE')
  }

  const payload: ResultsFile = {
    version: 1,
    gradingRunId: meta.gradingRunId,
    repository: process.env['GITHUB_REPOSITORY'] || null,
    sha: meta.sha,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    pointsEarned: summary.pointsEarned,
    pointsAvailable: summary.pointsAvailable,
    tests: summary.tests,
  }

  const resultsPath = path.join(workspace, RESULTS_FILENAME)
  fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2))
  return resultsPath
}
