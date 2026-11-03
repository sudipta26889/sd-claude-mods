import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { fixer, parseGlossary } from '../hooks/register'

// Made-up words only: nothing here comes from a real glossary.
const glossary = 'zorb=Zorbix, blue berry=Blueberry, blue=Azure, c++ thing=Plusplus, flim=flam, flam=flum, ränder=Render, port-rain/x=Portrain'
const fix = fixer(parseGlossary(glossary).swaps)

const CASES = [
  ['please restart zorb now', 'please restart Zorbix now'],
  ['ZORB and Zorb', 'Zorbix and Zorbix'],
  ['is it zorb?', 'is it Zorbix?'],
  ['zorb.', 'Zorbix.'],
  ['(zorb), "zorb"', '(Zorbix), "Zorbix"'],
  // A phrase beats a word inside it, and spoken spacing does not matter.
  ['a blue berry here', 'a Blueberry here'],
  ['a blue  berry\nthere', 'a Blueberry\nthere'],
  ['a blue sky', 'a Azure sky'],
  // Regex characters in the glossary are literal.
  ['the c++ thing runs', 'the Plusplus runs'],
  ['the port-rain/x runs', 'the Portrain runs'],
  // One pass: a replacement is not swapped again.
  ['flim', 'flam'],
  // Letters beyond ASCII still make word edges.
  ['ränder it', 'Render it'],
  ['färänder it', 'färänder it'],
] as const

const UNTOUCHED = [
  'zorbing and unzorb and zorb2',
  'open src/zorb and zorb.py and zorb-service and zorb_old',
  'mail zorb@example.com or run --zorb',
  'see https://example.com/?q=zorb for details',
  'run `zorb` today',
  '```\nzorb\nblue\n```',
]

for (const [text, fixed] of CASES) {
  test(`swaps: ${text}`, () => {
    expect(fix(text)).toBe(fixed)
  })
}

for (const text of UNTOUCHED) {
  test(`leaves: ${text}`, () => {
    expect(fix(text)).toBe(text)
  })
}

test('a code span does not stop a swap outside it', () => {
  expect(fix('`zorb` and zorb')).toBe('`zorb` and Zorbix')
})

test('a bad entry is counted and the rest still work', () => {
  const { swaps, skipped } = parseGlossary('zorb=Zorbix, nothing, =empty, empty=, a=b=c, , ')

  expect([...swaps]).toEqual([['zorb', 'Zorbix']])
  expect(skipped).toBe(4)
})

test('an empty glossary changes nothing', () => {
  expect(fixer(parseGlossary('').swaps)('zorb')).toBe('zorb')
})

const options = { glossary }

const engine = (on: On) => {
  const entered: string[] = []
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  return entered
}

const typed = (text: string, kind: 'composer' | 'bridge' | 'sdk' | 'peer' = 'composer') =>
  ({ text, wait: false, origin: { kind } }) as const

for (const kind of ['composer', 'bridge', 'sdk'] as const) {
  test(`a prompt from ${kind} is fixed`, { options }, async ($, on) => {
    const entered = engine(on)
    await $.prompt.submit(typed('restart zorb', kind))

    expect(entered).toEqual(['restart Zorbix'])
  })
}

test('another session’s message is left as written', { options }, async ($, on) => {
  const entered = engine(on)
  await $.prompt.submit(typed('restart zorb', 'peer'))

  expect(entered).toEqual(['restart zorb'])
})

test('no glossary sends the prompt as written', async ($, on) => {
  const entered = engine(on)
  await $.prompt.submit(typed('restart zorb'))

  expect(entered).toEqual(['restart zorb'])
})

// Not a string, so the swap throws when it reads it.
const unreadable = () => ({ text: { zorb: 1 }, wait: false, origin: { kind: 'composer' } }) as never

test('a failure sends the prompt and warns with fixed text', { options }, async ($, on) => {
  const warnings: string[] = []
  let sent = 0
  on('ui.toast', (_, e) => {
    warnings.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', () => {
    sent += 1

    return { text: 'sent' }
  })
  await $.prompt.submit(unreadable())

  expect(sent).toBe(1)
  expect(warnings).toEqual(['voice-fix failed, so this prompt was sent as written.'])
})

test('bad glossary entries warn at session start', { options: { glossary: 'zorb=Zorbix, nope' } }, async ($, on) => {
  const warnings: string[] = []
  on('ui.toast', (_, e) => {
    warnings.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => e)
  await $.session.start({ cwd: '/tmp', source: 'startup' } as never)

  expect(warnings.length).toBe(1)
  expect(warnings[0]).toContain('entries: 1.')
  expect(warnings[0]).not.toContain('nope')
})
