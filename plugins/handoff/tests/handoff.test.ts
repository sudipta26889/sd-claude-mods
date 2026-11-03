import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SUMMARY = 'Goal: finish the example widget.'
const FILE = '/fake-home/.claude/handoffs/-work-example-project.md'
const FIXED = 'handoff failed, so nothing was handed off. This conversation was kept.'

type Fork = { isAnswered: true; text: string } | { isAnswered: false; reason: string }

// Stands for the engine beneath the plugin, recording what the mod did to it.
const world = (on: On, opts: {
  fork?: Fork
  forkThrows?: boolean
  exitCode?: number
  clearFails?: boolean
  file?: string
  env?: Record<string, string>
  refuses?: () => boolean
} = {}) => {
  const seen = {
    forks: 0,
    saves: [] as { argv: readonly string[]; stdin?: string }[],
    clears: 0,
    prompts: [] as (readonly string[] | undefined)[],
    toasts: [] as string[],
    logs: [] as string[],
  }
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { HOME: '/fake-home', ...opts.env })
  on('session.root', () => ({ value: '/work/example/project' }))
  on('model.fork', () => {
    seen.forks += 1
    if (opts.forkThrows) {
      throw new Error(`leaky ${SUMMARY}`)
    }

    return { value: opts.fork ?? { isAnswered: true, text: SUMMARY } } as never
  })
  on('process.run', (_, e) => {
    seen.saves.push({ argv: e.argv, stdin: e.init?.stdin })

    return { value: { exitCode: opts.exitCode ?? 0, stdout: '', stderr: '' } } as never
  })
  on('fs.exists', () => ({ value: opts.file !== undefined }))
  on('fs.read', () => ({ value: opts.file ?? '' }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    seen.logs.push(e.text)

    return { value: undefined }
  })
  on('command.run', { command: 'clear' }, () => {
    if (opts.clearFails) {
      throw new Error('no clear here')
    }
    seen.clears += 1

    return { text: '' }
  })
  on('prompt.submit', (_, e) => {
    if (opts.refuses?.()) {
      return { drop: 'refused' }
    }
    seen.prompts.push(e.context)

    return { text: e.text }
  })

  return { seen, clock }
}

const prompt = { text: 'what next', wait: false, origin: { kind: 'composer' } } as const

test('/handoff saves the summary, clears, and sends it with the next prompt only', async ($, on) => {
  const { seen, clock } = world(on)
  const { text } = await $.command.run({ command: 'handoff', args: '' } as never)

  expect(text).toContain('fresh conversation')
  expect(seen.forks).toBe(1)
  expect(seen.saves.length).toBe(1)
  expect(seen.saves[0]?.argv.slice(-2)).toEqual(['/fake-home/.claude/handoffs', FILE])
  expect(seen.saves[0]?.stdin).toContain(SUMMARY)
  expect(seen.saves[0]?.stdin).toContain('/work/example/project')
  // A command.run hook may not run a command, so the clear waits until it ends.
  expect(seen.clears).toBe(0)

  await clock.advance(1000)
  expect(seen.clears).toBe(1)
  expect(seen.logs[0]).toContain(FILE)
  expect(seen.toasts).toEqual([])

  await $.prompt.submit(prompt)
  await $.prompt.submit(prompt)
  expect(seen.prompts[0]?.at(-1)).toContain(SUMMARY)
  expect(seen.prompts[1]).toBeUndefined()
})

test('CLAUDE_CONFIG_DIR moves the file', async ($, on) => {
  const { seen } = world(on, { env: { CLAUDE_CONFIG_DIR: '/fake-config' } })
  await $.command.run({ command: 'handoff', args: '' } as never)

  expect(seen.saves[0]?.argv.at(-1)).toBe('/fake-config/handoffs/-work-example-project.md')
})

for (const reason of ['nothing-to-fork', 'api-error'] as const) {
  test(`no summary (${reason}) saves nothing and keeps the conversation`, async ($, on) => {
    const { seen, clock } = world(on, { fork: { isAnswered: false, reason } })
    const { text } = await $.command.run({ command: 'handoff', args: '' } as never)
    await clock.advance(1000)

    expect(text).toContain(reason)
    expect(text).toContain('kept')
    expect(seen.saves).toEqual([])
    expect(seen.clears).toBe(0)
    await $.prompt.submit(prompt)
    expect(seen.prompts[0]).toBeUndefined()
  })
}

test('a failed save keeps the conversation', async ($, on) => {
  const { seen, clock } = world(on, { exitCode: 1 })
  const { text } = await $.command.run({ command: 'handoff', args: '' } as never)
  await clock.advance(1000)

  expect(text).toContain('could not save')
  expect(text).toContain('kept')
  expect(seen.clears).toBe(0)
})

test('a thrown error warns in fixed text and keeps the conversation', async ($, on) => {
  const { seen, clock } = world(on, { forkThrows: true })
  const { text } = await $.command.run({ command: 'handoff', args: '' } as never)
  await clock.advance(1000)

  // Exact, so nothing from the session or the error can be added to it.
  expect(text).toBe(FIXED)
  expect(seen.clears).toBe(0)
})

test('a failed clear warns, and the summary is not added to the old conversation', async ($, on) => {
  const { seen, clock } = world(on, { clearFails: true })
  await $.command.run({ command: 'handoff', args: '' } as never)
  await clock.advance(1000)

  expect(seen.toasts).toEqual([
    'handoff saved the summary but could not start a fresh conversation. Run /clear, then /handoff load.',
  ])
  await $.prompt.submit(prompt)
  expect(seen.prompts[0]).toBeUndefined()
})

test('/handoff load sends the saved file with the next prompt, without a model call', async ($, on) => {
  const { seen } = world(on, { file: `Handoff from /work\n\n${SUMMARY}\n` })
  const { text } = await $.command.run({ command: 'handoff', args: 'load' } as never)

  expect(text).toContain(FILE)
  expect(seen.forks).toBe(0)
  expect(seen.clears).toBe(0)
  await $.prompt.submit(prompt)
  expect(seen.prompts[0]?.at(-1)).toContain(SUMMARY)
})

test('/handoff load with nothing saved says so', async ($, on) => {
  world(on)
  const { text } = await $.command.run({ command: 'handoff', args: 'load' } as never)

  expect(text).toContain('found nothing')
  expect(text).toContain(FILE)
})

test('other arguments only show the usage', async ($, on) => {
  const { seen } = world(on)
  const { text } = await $.command.run({ command: 'handoff', args: 'please' } as never)

  expect(text).toContain('/handoff load')
  expect(seen.forks).toBe(0)
})

test('a prompt refused beneath keeps the summary for the next try', async ($, on) => {
  let refuse = true
  const { seen } = world(on, { file: SUMMARY, refuses: () => refuse })
  await $.command.run({ command: 'handoff', args: 'load' } as never)

  await $.prompt.submit(prompt)
  expect(seen.prompts).toEqual([])
  refuse = false
  await $.prompt.submit(prompt)
  expect(seen.prompts[0]?.at(-1)).toContain(SUMMARY)
})

test('with nothing to hand off, a prompt passes untouched', async ($, on) => {
  const { seen } = world(on)
  await $.prompt.submit(prompt)

  expect(seen.prompts).toEqual([undefined])
})
