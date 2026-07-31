// Adapted from github-education-resources/autograding src/runner.ts (MIT, archived).
// Execution semantics (shell spawn, timeout carry-over, stdin preloading, output
// comparison, ::stop-commands log guard) are preserved; the runner now collects
// structured per-test results instead of failing the action itself.
import {spawn, ChildProcess} from 'child_process'
import {randomUUID} from 'crypto'
import * as os from 'os'
import kill from 'tree-kill'

export type TestComparison = 'exact' | 'included' | 'regex'

export interface Test {
  readonly name: string
  readonly setup: string
  readonly run: string
  readonly input?: string
  readonly output?: string
  /** Timeout in minutes. */
  readonly timeout: number
  readonly points?: number
  readonly comparison: TestComparison
}

export type TestStatus = 'pass' | 'fail' | 'error' | 'timeout'

export interface TestResult {
  name: string
  status: TestStatus
  pointsEarned: number
  pointsAvailable: number
  durationMs: number
  message: string | null
}

export interface RunSummary {
  pointsEarned: number
  pointsAvailable: number
  /** True when at least one test declares points (drives the check-run update). */
  hasPoints: boolean
  allPassed: boolean
  tests: TestResult[]
}

export class TestError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, TestError)
  }
}

export class TestTimeoutError extends TestError {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, TestTimeoutError)
  }
}

export class TestOutputError extends TestError {
  expected: string
  actual: string

  constructor(message: string, expected: string, actual: string) {
    super(`${message}\nExpected:\n${expected}\nActual:\n${actual}`)
    this.expected = expected
    this.actual = actual

    Error.captureStackTrace(this, TestOutputError)
  }
}

const MESSAGE_LIMIT = 2000

// Plain ANSI codes instead of chalk (fewer deps; Actions renders ANSI fine).
const cyan = (text: string): string => `\u001b[36m${text}\u001b[0m`
const green = (text: string): string => `\u001b[32m${text}\u001b[0m`
const red = (text: string): string => `\u001b[31m${text}\u001b[0m`

const log = (text: string): void => {
  process.stdout.write(text + os.EOL)
}

const normalizeLineEndings = (text: string): string => {
  return text.replace(/\r\n/gi, '\n').trim()
}

const indent = (text: unknown): string => {
  let str = '' + String(text)
  str = str.replace(/\r\n/gim, '\n').replace(/\n/gim, '\n  ')
  return str
}

const truncate = (text: string, limit: number = MESSAGE_LIMIT): string => {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n... (truncated)`
}

const waitForExit = async (child: ChildProcess, timeout: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    let timedOut = false

    const exitTimeout = setTimeout(() => {
      timedOut = true
      reject(new TestTimeoutError(`Command timed out in ${timeout} milliseconds`))
      if (typeof child.pid === 'number') kill(child.pid)
    }, timeout)

    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (timedOut) return
      clearTimeout(exitTimeout)

      if (code === 0) {
        resolve(undefined)
      } else {
        reject(new TestError(`Error: Exit with code: ${code} and signal: ${signal}`))
      }
    })

    child.once('error', (error: Error) => {
      if (timedOut) return
      clearTimeout(exitTimeout)

      reject(error)
    })
  })
}

const spawnEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env['PATH'],
  FORCE_COLOR: 'true',
  DOTNET_CLI_HOME: '/tmp',
  DOTNET_NOLOGO: 'true',
  HOME: process.env['HOME'],
})

const runSetup = async (test: Test, cwd: string, timeout: number): Promise<void> => {
  if (!test.setup || test.setup === '') {
    return
  }

  const setup = spawn(test.setup, {
    cwd,
    shell: true,
    env: spawnEnv(),
  })

  // Start with a single new line
  process.stdout.write(indent('\n'))

  setup.stdout.on('data', (chunk) => {
    process.stdout.write(indent(chunk))
  })

  setup.stderr.on('data', (chunk) => {
    process.stderr.write(indent(chunk))
  })

  await waitForExit(setup, timeout)
}

const runCommand = async (test: Test, cwd: string, timeout: number): Promise<void> => {
  const child = spawn(test.run, {
    cwd,
    shell: true,
    env: spawnEnv(),
  })

  let output = ''

  // Start with a single new line
  process.stdout.write(indent('\n'))

  child.stdout.on('data', (chunk) => {
    process.stdout.write(indent(chunk))
    output += chunk
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(indent(chunk))
  })

  // Preload the inputs
  if (test.input && test.input !== '') {
    child.stdin.write(test.input)
    child.stdin.end()
  }

  await waitForExit(child, timeout)

  // Tests with neither expected output nor input pass on exit code alone
  if ((!test.output || test.output == '') && (!test.input || test.input == '')) {
    return
  }

  const expected = normalizeLineEndings(test.output || '')
  const actual = normalizeLineEndings(output)

  switch (test.comparison) {
    case 'exact':
      if (actual != expected) {
        throw new TestOutputError(`The output for test ${test.name} did not match`, expected, actual)
      }
      break
    case 'regex':
      // Note: do not use expected here
      if (!actual.match(new RegExp(test.output || ''))) {
        throw new TestOutputError(`The output for test ${test.name} did not match`, test.output || '', actual)
      }
      break
    default:
      // The default comparison mode is 'included'
      if (!actual.includes(expected)) {
        throw new TestOutputError(`The output for test ${test.name} did not match`, expected, actual)
      }
      break
  }
}

export const run = async (test: Test, cwd: string): Promise<void> => {
  // Timeouts are in minutes, but need to be in ms
  let timeout = (test.timeout || 1) * 60 * 1000 || 30000
  const start = process.hrtime()
  await runSetup(test, cwd, timeout)
  const elapsed = process.hrtime(start)
  // Subtract the elapsed seconds (0) and nanoseconds (1) to find the remaining timeout
  timeout -= Math.floor(elapsed[0] * 1000 + elapsed[1] / 1000000)
  await runCommand(test, cwd, timeout)
}

const classify = (error: unknown): TestStatus => {
  if (error instanceof TestTimeoutError) return 'timeout'
  if (error instanceof TestOutputError) return 'fail'
  return 'error'
}

export const runAll = async (tests: Array<Test>, cwd: string): Promise<RunSummary> => {
  let points = 0
  let availablePoints = 0
  let hasPoints = false
  const results: Array<TestResult> = []

  // https://help.github.com/en/actions/reference/development-tools-for-github-actions#stop-and-start-log-commands-stop-commands
  const token = randomUUID()
  log('')
  log(`::stop-commands::${token}`)
  log('')

  let failed = false

  for (const test of tests) {
    const pointsAvailable = test.points || 0
    if (test.points) {
      hasPoints = true
      availablePoints += test.points
    }
    log(cyan(`📝 ${test.name}`))
    log('')
    const testStart = Date.now()
    try {
      await run(test, cwd)
      const durationMs = Date.now() - testStart
      log('')
      log(green(`✅ ${test.name}`))
      log(``)
      if (test.points) {
        points += test.points
      }
      results.push({
        name: test.name,
        status: 'pass',
        pointsEarned: pointsAvailable,
        pointsAvailable,
        durationMs,
        message: null,
      })
    } catch (error) {
      const durationMs = Date.now() - testStart
      failed = true
      log('')
      log(red(`❌ ${test.name}`))
      log('')
      const message = error instanceof Error ? error.message : `Failed to run test '${test.name}'`
      log(red(indent(message)))
      log('')
      results.push({
        name: test.name,
        status: classify(error),
        pointsEarned: 0,
        pointsAvailable,
        durationMs,
        message: truncate(message),
      })
    }
  }

  // Restart command processing
  log('')
  log(`::${token}::`)

  if (!failed) {
    log('')
    log(green('All tests passed'))
    log('')
    log('✨🌟💖💎🦄💎💖🌟✨🌟💖💎🦄💎💖🌟✨')
    log('')
  }

  return {
    pointsEarned: points,
    pointsAvailable: availablePoints,
    hasPoints,
    allPassed: !failed,
    tests: results,
  }
}
