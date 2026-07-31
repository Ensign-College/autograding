// Action entry point. Adapted from github-education-resources/autograding
// src/autograding.ts (MIT, archived).
import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import {Test, runAll} from './runner'
import {writeResults} from './results'
import {setCheckRunOutput} from './output'

const DEFAULT_CONFIG_PATH = '.github/classroom/autograding.json'

const run = async (): Promise<void> => {
  const startedAt = new Date().toISOString()
  try {
    const cwd = process.env['GITHUB_WORKSPACE']
    if (!cwd) {
      throw new Error('No GITHUB_WORKSPACE')
    }

    const configPath = core.getInput('config-path') || DEFAULT_CONFIG_PATH
    const data = fs.readFileSync(path.resolve(cwd, configPath))
    const json = JSON.parse(data.toString())

    const summary = await runAll(json.tests as Array<Test>, cwd)
    const finishedAt = new Date().toISOString()

    // Write the structured results file first — the workflow uploads it as an
    // artifact even when the run concludes 'failure'.
    const gradingRunId = core.getInput('grading-run-id') || null
    const sha = core.getInput('sha') || process.env['GITHUB_SHA'] || null
    const resultsPath = writeResults(summary, {gradingRunId, sha, startedAt, finishedAt})

    const pointsText = `${summary.pointsEarned}/${summary.pointsAvailable}`
    core.setOutput('points', pointsText)
    core.setOutput('results-path', resultsPath)

    // Student-facing check-run feedback; non-fatal by construction.
    if (summary.hasPoints) {
      core.info(`Points ${pointsText}`)
      await setCheckRunOutput(`Points ${pointsText}`)
    }

    // Fail the action AFTER the results file exists, so the workflow run
    // concludes 'failure' while the artifact still carries full results.
    if (!summary.allPassed) {
      const failedTests = summary.tests.filter((t) => t.status !== 'pass')
      core.setFailed(
        `${failedTests.length} of ${summary.tests.length} test(s) failed: ${failedTests
          .map((t) => t.name)
          .join(', ')}`,
      )
    }
  } catch (error) {
    // If there is any error we'll fail the action with the error message
    if (error instanceof Error) {
      core.setFailed(`Autograding failure: ${error.message}`)
    } else {
      core.setFailed(`Autograding failure: an unknown error occurred`)
    }
  }
}

// Don't auto-execute in the test environment
if (process.env['NODE_ENV'] !== 'test' && !process.env['VITEST']) {
  run()
}

export default run
