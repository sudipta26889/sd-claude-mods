import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { isGitPush } from '../hooks/register'

const PUSHES = [
  'git push',
  'git push origin main --force',
  'cd app && git push',
  'git add . ; git commit -m wip; git push',
  'git -C "my dir" push',
  'git -c http.proxy=x push',
  'git --git-dir=.git push',
  '/usr/bin/git push',
  'FOO=1 git push',
  'sudo git push',
  'if true; then git push; fi',
  'out=$(git push)',
  'bash -c "git push"',
  'git \\\n  push',
  // Held on purpose: the check reads quoted text too. See the comment in the mod.
  'git commit -m "git push fix"',
]

const OTHERS = [
  'git status',
  'git pull',
  'git stash push',
  'git commit -m "push it"',
  'git log --author push',
  'legit push',
  'git pushx',
  'echo push',
  'ls git',
]

for (const command of PUSHES) {
  test(`is a push: ${command}`, () => {
    expect(isGitPush(command)).toBe(true)
  })
}

for (const command of OTHERS) {
  test(`is not a push: ${command}`, () => {
    expect(isGitPush(command)).toBe(false)
  })
}

const CHECK = 'check-the-job'
const options = { jobCheck: CHECK }

// Stands for the host: runs nothing, records each check, answers as told.
const host = (on: On, exitCode: number, stdout = '') => {
  const ran: string[][] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])

    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return ran
}

const permissions = (on: On, decision: 'allow' | 'deny' = 'allow') =>
  on('tool.check', () => ({ decision, reason: 'beneath' }))

const toasts = (on: On) => {
  const seen: string[] = []
  on('ui.toast', (_, e) => {
    seen.push(e.text)

    return { value: undefined }
  })

  return seen
}

const push = { tool: 'Bash', input: { command: 'git push' } }

const WARNING =
  'deploy-guard could not check for a running job, so this push was not held. Check its jobCheck setting.'

test('a running job holds the push and names the job', { options }, async ($, on) => {
  permissions(on)
  const ran = host(on, 0, 'nightly-import\nsecond line\n')
  const warnings = toasts(on)
  const verdict = await $.tool.check(push)

  expect(ran).toEqual([['sh', '-c', CHECK]])
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('(nightly-import)')
  expect(verdict.reason).not.toContain('second line')
  expect(warnings).toEqual([verdict.reason])
})

test('a running job with no output still holds the push', { options }, async ($, on) => {
  permissions(on)
  host(on, 0)
  toasts(on)
  const verdict = await $.tool.check(push)

  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('a job is running.')
})

test('no running job leaves the push to the normal rules', { options }, async ($, on) => {
  permissions(on)
  host(on, 1)
  const warnings = toasts(on)

  expect((await $.tool.check(push)).decision).toBe('allow')
  expect(warnings).toEqual([])
})

test('other commands run no check', { options }, async ($, on) => {
  permissions(on)
  const ran = host(on, 0)

  expect((await $.tool.check({ tool: 'Bash', input: { command: 'git status' } })).decision).toBe('allow')
  expect(ran).toEqual([])
})

test('a rule that denies the push is not softened', { options }, async ($, on) => {
  permissions(on, 'deny')
  host(on, 0)
  toasts(on)

  expect((await $.tool.check(push)).decision).toBe('deny')
})

test('a failing check warns and lets the push through', { options }, async ($, on) => {
  permissions(on)
  host(on, 255, 'private output')
  const warnings = toasts(on)

  expect((await $.tool.check(push)).decision).toBe('allow')
  expect(warnings).toEqual([WARNING])
})

test('a check that cannot run warns and lets the push through', { options }, async ($, on) => {
  permissions(on)
  on('process.run', () => {
    throw new Error('timed out')
  })
  const warnings = toasts(on)

  expect((await $.tool.check(push)).decision).toBe('allow')
  expect(warnings).toEqual([WARNING])
})

test('no check set warns on a push and runs nothing', async ($, on) => {
  permissions(on)
  const ran = host(on, 0)
  const warnings = toasts(on)

  expect((await $.tool.check(push)).decision).toBe('allow')
  expect(ran).toEqual([])
  expect(warnings).toEqual([WARNING])
})

test('a warning that fails still lets the push through', async ($, on) => {
  permissions(on)
  on('ui.toast', () => {
    throw new Error('no toast here')
  })

  expect((await $.tool.check(push)).decision).toBe('allow')
})
