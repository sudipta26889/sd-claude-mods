import type { Register } from 'claude-code'

// Reads the raw text, quotes included, so `bash -c "git push"` is caught. A commit
// message that says "git push" is held too, which costs one extra question and only
// while a job is running. The {0,8} keeps backtracking small on long option runs.
const GIT_PUSH =
  /(?:^|[\s"'`;&|(/])git(?:\s+(?:-[Cc]|--git-dir|--work-tree|--namespace)\s+(?:"[^"]*"|'[^']*'|\S+)|\s+-\S+){0,8}\s+push(?=$|[\s"'`;&|)])/

const TIMEOUT_MS = 15_000

// Fixed text: neither the command nor its output may reach this warning.
const UNCHECKED =
  'deploy-guard could not check for a running job, so this push was not held. Check its jobCheck setting.'

export const isGitPush = (command: string): boolean =>
  GIT_PUSH.test(command.replace(/\\\r?\n/g, ' '))

export const register: Register = (on, options) => {
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const { command } = e.input as { command?: unknown }
    if (typeof command !== 'string' || !isGitPush(command)) {
      return next(e)
    }

    const jobCheck = options.jobCheck as string
    if (!jobCheck.trim()) {
      throw new Error('jobCheck is not set')
    }

    // Exit 0 and 1 are grep's and pgrep's found and not found, and ssh's own failure
    // is 255. A check killed by a signal also reads as 1, so it counts as no job.
    const { exitCode, stdout } = await $.process.run(['sh', '-c', jobCheck], {
      timeoutMs: TIMEOUT_MS,
    })
    if (exitCode > 1) {
      throw new Error('jobCheck failed')
    }
    if (exitCode === 1) {
      return next(e)
    }

    // A rule that already refuses this push must not be softened into a question.
    const verdict = await next(e)
    if (verdict.decision === 'deny') {
      return verdict
    }

    const job = stdout.trim().split('\n')[0]?.slice(0, 200)
    const reason = `deploy-guard: a job is running${job ? ` (${job})` : ''}. A push may deploy and break it.`

    // Where the push would have asked anyway, the dialog shows its own words, not this
    // reason, so the toast is what says why.
    try {
      $.ui.toast(reason, { timeoutMs: 15000 })
    } catch {
      // The hold must not depend on the toast.
    }

    // A plugin's ask goes to a person, past allow rules and classifiers. Where nobody
    // can be asked, as under claude -p, the engine turns it into a refusal.
    return { decision: 'ask', reason }
  }).catch(($, e, next) => {
    // A broken guard must not block every push, so it warns and lets them through.
    if (!next.called) {
      try {
        $.ui.toast(UNCHECKED, { timeoutMs: 15000 })
      } catch {
        // The push still goes on when the warning cannot be shown.
      }
    }

    return next(e)
  })
}
