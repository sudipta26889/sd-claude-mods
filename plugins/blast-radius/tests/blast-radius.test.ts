import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// These tests cover the preCheck setting added in this repository. The classifier, the
// measuring step and the panel are the upstream mod's and are not changed here.

const CHECK = 'my-check'
const options = { preCheck: CHECK }
const RISKY = 'rm -rf /tmp/build'

type Reply = { exitCode: number; stdout: string }
type Verdict = { result?: unknown; deny?: string }

const reply = ({ exitCode, stdout }: Reply) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const isCheck = (argv: readonly string[]) => argv[0] === 'sh' && argv[2] === `${CHECK} "$1" "$2"`

// Stands for the host: records every command, answers the pre-check as told, and lets the
// measuring step find nothing. The panel cannot open, so a held command ends as a refusal
// straight away instead of waiting for a button.
const host = (on: On, check: () => Reply) => {
  const ran: string[][] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])

    return reply(isCheck(e.argv) ? check() : { exitCode: 0, stdout: '' })
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.open', () => {
    throw new Error('no surface in a test')
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))

  return ran
}

// The rest of the chain: what runs the command when the mod lets it through.
const beneath = (on: On) => {
  const got: string[] = []
  on('tool.call', (_, e) => {
    got.push(String((e as { command?: unknown }).command))

    return { result: 'ran' } as never
  })

  return got
}

const toasts = (on: On) => {
  const seen: string[] = []
  on('ui.toast', (_, e) => {
    seen.push(e.text)

    return { value: undefined }
  })

  return seen
}

const run = ($: unknown, command: string) =>
  ($ as { tool: { call: (input: unknown) => Promise<Verdict> } }).tool.call({ tool: 'Bash', command })

const checks = (ran: string[][]) => ran.filter(isCheck)

test('approve clears the command with no panel', { options }, async ($, on) => {
  const ran = host(on, () => ({ exitCode: 0, stdout: 'approve\n' }))
  const got = beneath(on)
  const seen = toasts(on)
  const verdict = await run($, RISKY)

  expect(verdict.result).toBe('ran')
  expect(got).toEqual([RISKY])
  expect(ran).toEqual([['sh', '-c', `${CHECK} "$1" "$2"`, 'blast-radius', 'rm', RISKY]])
  expect(seen).toEqual(['Blast Radius: cleared by your preCheck, running it'])
})

test('the kind of risk is the first argument', { options }, async ($, on) => {
  const ran = host(on, () => ({ exitCode: 0, stdout: 'approve' }))
  beneath(on)
  toasts(on)
  await run($, 'git reset --hard HEAD~1')

  expect(checks(ran)[0]?.slice(3)).toEqual(['blast-radius', 'git-reset', 'git reset --hard HEAD~1'])
})

test('the command reaches the check whole, as one argument', { options }, async ($, on) => {
  const command = 'rm -rf "$TMPDIR/x y"; echo \'done\' && $(true)\nrm -f z'
  const ran = host(on, () => ({ exitCode: 0, stdout: 'approve' }))
  beneath(on)
  toasts(on)
  await run($, command)

  expect(checks(ran)[0]?.[5]).toBe(command)
  expect(checks(ran)[0]?.length).toBe(6)
})

const HELD: [string, Reply][] = [
  ['hold', { exitCode: 0, stdout: 'hold\n' }],
  ['nothing', { exitCode: 0, stdout: '' }],
  ['approve with a failing exit', { exitCode: 1, stdout: 'approve\n' }],
  ['a longer word', { exitCode: 0, stdout: 'approved\n' }],
  ['approve with more text', { exitCode: 0, stdout: 'approve\nand then some\n' }],
  ['approve in another case', { exitCode: 0, stdout: 'APPROVE\n' }],
]

for (const [name, answer] of HELD) {
  test(`a check that says ${name} leaves the command held`, { options }, async ($, on) => {
    const ran = host(on, () => answer)
    const got = beneath(on)
    const seen = toasts(on)
    const verdict = await run($, RISKY)

    expect(got).toEqual([])
    expect(verdict.deny).toContain('Blast Radius held this command and did not run it')
    expect(checks(ran).length).toBe(1)
    expect(seen).toEqual([])
  })
}

test('a check that cannot run leaves the command held', { options }, async ($, on) => {
  on('process.run', (_, e) => {
    if (isCheck(e.argv)) {
      throw new Error('timed out')
    }

    return reply({ exitCode: 0, stdout: '' })
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.open', () => {
    throw new Error('no surface in a test')
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  const got = beneath(on)
  const verdict = await run($, RISKY)

  expect(got).toEqual([])
  expect(verdict.deny).toContain('did not run it')
})

for (const [name, opts] of [
  ['no setting', {}],
  ['an empty setting', { preCheck: '   ' }],
] as const) {
  test(`${name} runs no check and holds as before`, { options: opts }, async ($, on) => {
    const ran = host(on, () => ({ exitCode: 0, stdout: 'approve\n' }))
    const got = beneath(on)
    const verdict = await run($, RISKY)

    expect(ran.filter((argv) => argv[0] === 'sh')).toEqual([])
    expect(got).toEqual([])
    expect(verdict.deny).toContain('did not run it')
  })
}

test('a command with no risk runs no check', { options }, async ($, on) => {
  const ran = host(on, () => ({ exitCode: 0, stdout: 'approve\n' }))
  const got = beneath(on)
  const verdict = await run($, 'ls -la')

  expect(ran).toEqual([])
  expect(got).toEqual(['ls -la'])
  expect(verdict.result).toBe('ran')
})

test('a toast that fails still runs the cleared command', { options }, async ($, on) => {
  host(on, () => ({ exitCode: 0, stdout: 'approve\n' }))
  const got = beneath(on)
  on('ui.toast', () => {
    throw new Error('no toast')
  })
  const verdict = await run($, RISKY)

  expect(got).toEqual([RISKY])
  expect(verdict.result).toBe('ran')
})
