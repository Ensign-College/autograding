import {describe, expect, it} from 'vitest'
import {run, runAll, Test, TestOutputError, TestTimeoutError, TestError} from '../src/runner'

const cwd = process.cwd()

const makeTest = (overrides: Partial<Test>): Test => ({
  name: 'test',
  setup: '',
  run: 'echo hello',
  input: '',
  output: '',
  comparison: 'included',
  timeout: 1,
  points: 1,
  ...overrides,
})

describe('run (single test)', () => {
  it('passes on exit code alone when no output or input is expected', async () => {
    await expect(run(makeTest({run: 'true'}), cwd)).resolves.toBeUndefined()
  })

  it('throws TestError on a non-zero exit code', async () => {
    await expect(run(makeTest({run: 'exit 1'}), cwd)).rejects.toBeInstanceOf(TestError)
  })

  it('runs setup before run, sharing the working directory', async () => {
    const test = makeTest({
      setup: 'echo setup-side-effect > /dev/null',
      run: 'echo hello world',
      output: 'hello world',
      comparison: 'exact',
    })
    await expect(run(test, cwd)).resolves.toBeUndefined()
  })

  it('fails when setup fails', async () => {
    const test = makeTest({setup: 'exit 3', run: 'echo hello'})
    await expect(run(test, cwd)).rejects.toBeInstanceOf(TestError)
  })

  describe('comparison: exact', () => {
    it('passes on an exact match (line endings normalized, trimmed)', async () => {
      const test = makeTest({run: 'echo hello', output: 'hello', comparison: 'exact'})
      await expect(run(test, cwd)).resolves.toBeUndefined()
    })

    it('fails when output differs', async () => {
      const test = makeTest({run: 'echo hello there', output: 'hello', comparison: 'exact'})
      await expect(run(test, cwd)).rejects.toBeInstanceOf(TestOutputError)
    })
  })

  describe('comparison: included', () => {
    it('passes when expected output is a substring', async () => {
      const test = makeTest({run: 'echo hello there world', output: 'there', comparison: 'included'})
      await expect(run(test, cwd)).resolves.toBeUndefined()
    })

    it('fails when expected output is absent', async () => {
      const test = makeTest({run: 'echo hello', output: 'goodbye', comparison: 'included'})
      await expect(run(test, cwd)).rejects.toBeInstanceOf(TestOutputError)
    })
  })

  describe('comparison: regex', () => {
    it('passes when output matches the pattern', async () => {
      const test = makeTest({run: 'echo score is 42', output: 'score is \\d+', comparison: 'regex'})
      await expect(run(test, cwd)).resolves.toBeUndefined()
    })

    it('fails when output does not match the pattern', async () => {
      const test = makeTest({run: 'echo score is unknown', output: 'score is \\d+', comparison: 'regex'})
      await expect(run(test, cwd)).rejects.toBeInstanceOf(TestOutputError)
    })
  })

  it('preloads stdin input', async () => {
    const test = makeTest({run: 'cat', input: 'piped input', output: 'piped input', comparison: 'exact'})
    await expect(run(test, cwd)).resolves.toBeUndefined()
  })

  it('throws TestTimeoutError when the command exceeds the timeout', async () => {
    // timeout is in minutes; 0.01 minutes = 600ms
    const test = makeTest({run: 'sleep 5', timeout: 0.01})
    await expect(run(test, cwd)).rejects.toBeInstanceOf(TestTimeoutError)
  }, 15000)
})

describe('runAll', () => {
  it('accumulates points and reports per-test results', async () => {
    const tests = [
      makeTest({name: 'passes', run: 'echo ok', output: 'ok', points: 3}),
      makeTest({name: 'fails output', run: 'echo wrong', output: 'right', comparison: 'exact', points: 5}),
      makeTest({name: 'errors', run: 'exit 2', points: 2}),
    ]
    const summary = await runAll(tests, cwd)

    expect(summary.pointsEarned).toBe(3)
    expect(summary.pointsAvailable).toBe(10)
    expect(summary.hasPoints).toBe(true)
    expect(summary.allPassed).toBe(false)
    expect(summary.tests).toHaveLength(3)

    const [pass, fail, error] = summary.tests
    expect(pass).toMatchObject({name: 'passes', status: 'pass', pointsEarned: 3, pointsAvailable: 3, message: null})
    expect(fail).toMatchObject({name: 'fails output', status: 'fail', pointsEarned: 0, pointsAvailable: 5})
    expect(fail.message).toContain('Expected:')
    expect(fail.message).toContain('Actual:')
    expect(error).toMatchObject({name: 'errors', status: 'error', pointsEarned: 0, pointsAvailable: 2})
    expect(error.message).toContain('Exit with code')
    for (const result of summary.tests) {
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('continues running remaining tests after a failure', async () => {
    const tests = [
      makeTest({name: 'first', run: 'exit 1', points: 1}),
      makeTest({name: 'second', run: 'echo ok', output: 'ok', points: 1}),
    ]
    const summary = await runAll(tests, cwd)
    expect(summary.tests.map((t) => t.status)).toEqual(['error', 'pass'])
    expect(summary.pointsEarned).toBe(1)
  })

  it('classifies timeouts distinctly', async () => {
    const tests = [makeTest({name: 'slow', run: 'sleep 5', timeout: 0.01, points: 1})]
    const summary = await runAll(tests, cwd)
    expect(summary.tests[0].status).toBe('timeout')
    expect(summary.tests[0].pointsEarned).toBe(0)
  }, 15000)

  it('includes zero-point tests in results without affecting the score', async () => {
    const tests = [
      makeTest({name: 'no points pass', run: 'true', points: undefined}),
      makeTest({name: 'no points fail', run: 'exit 1', points: undefined}),
      makeTest({name: 'scored', run: 'true', points: 4}),
    ]
    const summary = await runAll(tests, cwd)
    expect(summary.tests).toHaveLength(3)
    expect(summary.tests[0]).toMatchObject({status: 'pass', pointsEarned: 0, pointsAvailable: 0})
    expect(summary.tests[1]).toMatchObject({status: 'error', pointsEarned: 0, pointsAvailable: 0})
    expect(summary.pointsEarned).toBe(4)
    expect(summary.pointsAvailable).toBe(4)
  })

  it('reports allPassed and hasPoints=false for an unscored passing suite', async () => {
    const summary = await runAll([makeTest({name: 'only', run: 'true', points: undefined})], cwd)
    expect(summary.allPassed).toBe(true)
    expect(summary.hasPoints).toBe(false)
    expect(summary.pointsAvailable).toBe(0)
  })

  it('truncates long failure messages to about 2000 characters', async () => {
    const tests = [
      makeTest({
        name: 'big output',
        // ~6000 chars of actual output that will not match
        run: 'printf "x%.0s" $(seq 1 6000)',
        output: 'this will not match',
        comparison: 'exact',
        points: 1,
      }),
    ]
    const summary = await runAll(tests, cwd)
    const message = summary.tests[0].message
    expect(message).not.toBeNull()
    expect((message as string).length).toBeLessThanOrEqual(2100)
    expect(message).toContain('(truncated)')
  })
})
