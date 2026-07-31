// Adapted from github-education-resources/autograding src/output.ts (MIT, archived).
// Updates the "Autograding" check run with the "Points X/Y" summary as student-facing
// feedback. Every failure in here is non-fatal: grading results are the source of
// truth, so a check-run annotation hiccup must never fail the action.
import * as core from '@actions/core'
import * as github from '@actions/github'

export const setCheckRunOutput = async (text: string): Promise<void> => {
  try {
    // If we have nothing to output, then bail
    if (text === '') return

    // Our action will need to API access the repository so we require a token
    // This will need to be set in the calling workflow, otherwise we'll exit
    const token = process.env['GITHUB_TOKEN'] || core.getInput('token')
    if (!token || token === '') return

    // Create the octokit client
    const octokit = github.getOctokit(token)
    if (!octokit) return

    // The environment contains a variable for current repository. The repository
    // will be formatted as a name with owner (`nwo`); e.g., jeffrafter/example
    // We'll split this into two separate variables for later use
    const nwo = process.env['GITHUB_REPOSITORY'] || '/'
    const [owner, repo] = nwo.split('/')
    if (!owner) return
    if (!repo) return

    // We need the workflow run id
    const runId = parseInt(process.env['GITHUB_RUN_ID'] || '')
    if (Number.isNaN(runId)) return

    // Fetch the workflow run
    const workflowRunResponse = await octokit.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    })

    // Find the check suite run
    const checkSuiteUrl = (workflowRunResponse.data as {check_suite_url: string}).check_suite_url
    const checkSuiteMatch = checkSuiteUrl.match(/[0-9]+$/)
    if (!checkSuiteMatch) return
    const checkSuiteId = parseInt(checkSuiteMatch[0], 10)
    const checkRunsResponse = await octokit.rest.checks.listForSuite({
      owner,
      repo,
      check_name: 'Autograding',
      check_suite_id: checkSuiteId,
    })
    const checkRun = checkRunsResponse.data.total_count === 1 && checkRunsResponse.data.check_runs[0]
    if (!checkRun) return

    // Update the checkrun, we'll assign the title, summary and text even though we expect
    // the title and summary to be overwritten by GitHub Actions (they are required in this call)
    // We'll also store the total in an annotation to future-proof
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRun.id,
      output: {
        title: 'Autograding',
        summary: text,
        text: text,
        annotations: [
          {
            // Using the `.github` path is what GitHub Actions does
            path: '.github',
            start_line: 1,
            end_line: 1,
            annotation_level: 'notice',
            message: text,
            title: 'Autograding complete',
          },
        ],
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to update the Autograding check run (non-fatal): ${message}`)
  }
}
