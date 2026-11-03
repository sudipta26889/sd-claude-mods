import type { On, PromptSubmitResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { correction } from '../hooks/register'

const BAND = {
  plugin: 'reflect',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const typed = (text: string, kind: 'composer' | 'peer' = 'composer') =>
  ({ text, wait: false, origin: { kind } }) as const

// Stands for the engine beneath the plugin, which draws nothing of its own here.
const engine = (on: On, answer: PromptSubmitResult | null = null) => {
  on('prompt.submit', (_, e) => answer ?? { text: e.text })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
}

const reflect = async ($: Engine, args: string) =>
  (
    await $.command.run({
      command: 'reflect',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })
  ).text

for (const [text, rule] of [
  ["Never call it a pilot. It's a paying customer.", 'Never call it a pilot.'],
  ['ok, stop adding comments', 'ok, stop adding comments'],
  ['That is wrong.\nAlways use the venv.', 'Always use the venv.'],
  ["please don't ever push to main", "please don't ever push to main"],
  ['From now on use short names', 'From now on use short names'],
] as const) {
  test(`finds: ${rule}`, () => {
    expect(correction(text)).toBe(rule)
  })
}

for (const text of [
  'Fix the login bug.',
  'Never mind, carry on.',
  'Stop the server.',
  'Should I never do this?',
  'Never?',
  'Always.',
  'Does it never end',
  `Never ${'x'.repeat(200)}`,
  `Never do this. ${'x'.repeat(2000)}`,
]) {
  test(`ignores: ${text.slice(0, 30)}`, () => {
    expect(correction(text)).toBe(null)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`Save stores the rule only when pressed, on ${surface}`, async ($, on) => {
    engine(on)
    mock.store(on)
    await $.prompt.submit(typed('Never call it a pilot.'))

    expect(await reflect($, '')).toBe('No saved rules.')

    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /pilot/ }))?.text).toContain('Never call it a pilot.')
    await ui.press({ key: 'save' })

    expect(await reflect($, '')).toBe('1. Never call it a pilot.')
    expect(await ui.find({ key: 'save' })).toBeUndefined()
    await ui.unmount()
  })

  test(`Dismiss stores nothing, on ${surface}`, async ($, on) => {
    engine(on)
    mock.store(on)
    await $.prompt.submit(typed('Never call it a pilot.'))
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'dismiss' })

    expect(await reflect($, '')).toBe('No saved rules.')
    expect(await ui.find({ key: 'save' })).toBeUndefined()
    await ui.unmount()
  })
}

const offered = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const button = await ui.find({ key: 'save' })
  await ui.unmount()

  return button !== undefined
}

test('the next prompt ends an ignored offer', async ($, on) => {
  engine(on)
  mock.store(on)
  await $.prompt.submit(typed('Never call it a pilot.'))
  expect(await offered($)).toBe(true)
  await $.prompt.submit(typed('Fix the login bug.'))
  expect(await offered($)).toBe(false)
})

test('a rule already saved is not offered again', async ($, on) => {
  engine(on)
  mock.store(on, { rules: ['Never call it a pilot.'] })
  await $.prompt.submit(typed('Never call it a pilot.'))
  expect(await offered($)).toBe(false)
})

test('a stopped prompt is not offered', async ($, on) => {
  mock.store(on)
  engine(on, { drop: 'stopped' })
  const result = await $.prompt.submit(typed('Never call it a pilot.'))
  expect(result.drop).toBe('stopped')
  expect(await offered($)).toBe(false)
})

test('a message from another session is not offered', async ($, on) => {
  engine(on)
  mock.store(on)
  await $.prompt.submit(typed('Never call it a pilot.', 'peer'))
  expect(await offered($)).toBe(false)
})

test('the offer keeps what other mods draw in the band', async ($, on) => {
  engine(on)
  mock.store(on)
  await $.prompt.submit(typed('Never call it a pilot.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ key: 'save' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

const composed = async ($: Engine) =>
  $.prompt.compose({
    model: 'm',
    promptModel: 'm',
    surfaces: [],
    tools: [],
    outputStyle: null,
    traits: [],
  })

test('saved rules go last in the system prompt', async ($, on) => {
  mock.store(on, { rules: ['Never do A.', 'Always do B.'] })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  const { sections } = await composed($)

  expect(sections.map(one => one.id)).toEqual(['intro', 'reflect:rules'])
  expect(sections[1]?.text).toContain('- Never do A.\n- Always do B.')
  expect(sections[1]?.scope).toBe('session')
})

test('no rules, no section', async ($, on) => {
  mock.store(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))

  expect((await composed($)).sections.map(one => one.id)).toEqual(['intro'])
})

test('/reflect lists, adds and removes', async ($, on) => {
  mock.store(on, { rules: ['Never do A.'] })

  expect(await reflect($, '')).toBe('1. Never do A.')
  await reflect($, 'add Always   do B.')
  expect(await reflect($, '')).toBe('1. Never do A.\n2. Always do B.')
  await reflect($, 'remove 1')
  expect(await reflect($, '')).toBe('1. Always do B.')
  expect(await reflect($, 'remove 9')).toContain('Usage')
  expect(await reflect($, '')).toBe('1. Always do B.')
})

test('a broken store still sends the prompt and warns with fixed text', async ($, on) => {
  const warnings: string[] = []
  let sent = 0
  on('ui.toast', (_, e) => {
    warnings.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    sent += 1

    return { text: e.text }
  })
  on('store.get', () => {
    throw new Error('store is broken')
  })
  const result = await $.prompt.submit(typed('Never call it a pilot.'))

  expect(sent).toBe(1)
  expect(result.drop).toBeUndefined()
  expect(warnings).toEqual([
    'reflect failed, so this prompt was sent but not checked for a rule to save.',
  ])
})

test('a broken store still composes the prompt and warns', async ($, on) => {
  const warnings: string[] = []
  on('ui.toast', (_, e) => {
    warnings.push(e.text)

    return { value: undefined }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  on('store.get', () => {
    throw new Error('store is broken')
  })

  expect((await composed($)).sections.map(one => one.id)).toEqual(['intro'])
  expect(warnings).toEqual(['reflect failed, so saved rules were not given to Claude this session.'])
})
