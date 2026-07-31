import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {writeResults, RESULTS_FILENAME} from '../src/results'
import {RunSummary} from '../src/runner'

const summary: RunSummary = {
  pointsEarned: 7,
  pointsAvailable: 10,
  hasPoints: true,
  allPassed: false,
  tests: [
    {
      name: 'Greeting Message',
      status: 'pass',
      pointsEarned: 7,
      pointsAvailable: 7,
      durationMs: 830,
      message: null,
    },
    {
      name: 'Farewell Message',
      status: 'fail',
      pointsEarned: 0,
      pointsAvailable: 3,
      durationMs: 120,
      message: 'The output for test Farewell Message did not match\nExpected:\nbye\nActual:\nhi',
    },
  ],
}

describe('writeResults', () => {
  let tmpDir: string
  let savedWorkspace: string | undefined
  let savedRepository: string | undefined

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autograding-results-'))
    savedWorkspace = process.env['GITHUB_WORKSPACE']
    savedRepository = process.env['GITHUB_REPOSITORY']
    process.env['GITHUB_WORKSPACE'] = tmpDir
    process.env['GITHUB_REPOSITORY'] = 'Ensign-College/example-student1'
  })

  afterEach(() => {
    if (savedWorkspace === undefined) delete process.env['GITHUB_WORKSPACE']
    else process.env['GITHUB_WORKSPACE'] = savedWorkspace
    if (savedRepository === undefined) delete process.env['GITHUB_REPOSITORY']
    else process.env['GITHUB_REPOSITORY'] = savedRepository
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('writes autograding-results.json with the version 1 schema', () => {
    const resultsPath = writeResults(summary, {
      gradingRunId: 'gr_123',
      sha: 'abc1234',
      startedAt: '2026-07-31T18:00:00.000Z',
      finishedAt: '2026-07-31T18:00:41.000Z',
    })

    expect(resultsPath).toBe(path.join(tmpDir, RESULTS_FILENAME))
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
    expect(parsed).toEqual({
      version: 1,
      gradingRunId: 'gr_123',
      repository: 'Ensign-College/example-student1',
      sha: 'abc1234',
      startedAt: '2026-07-31T18:00:00.000Z',
      finishedAt: '2026-07-31T18:00:41.000Z',
      pointsEarned: 7,
      pointsAvailable: 10,
      tests: summary.tests,
    })
  })

  it('writes nulls for missing gradingRunId, sha, and repository', () => {
    delete process.env['GITHUB_REPOSITORY']
    const resultsPath = writeResults(summary, {
      gradingRunId: null,
      sha: null,
      startedAt: '2026-07-31T18:00:00.000Z',
      finishedAt: '2026-07-31T18:00:41.000Z',
    })
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
    expect(parsed.gradingRunId).toBeNull()
    expect(parsed.sha).toBeNull()
    expect(parsed.repository).toBeNull()
  })

  it('throws when GITHUB_WORKSPACE is unset', () => {
    delete process.env['GITHUB_WORKSPACE']
    expect(() =>
      writeResults(summary, {
        gradingRunId: null,
        sha: null,
        startedAt: '2026-07-31T18:00:00.000Z',
        finishedAt: '2026-07-31T18:00:41.000Z',
      }),
    ).toThrow('No GITHUB_WORKSPACE')
  })
})
