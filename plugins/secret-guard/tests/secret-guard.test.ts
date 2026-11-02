import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// Fakes are split so the repository's secret scan stays clean. None is real.
const FILL = 'EXAMPLEexample0123456789EXAMPLE'
const CASES = [
  ['sk- style API key', 'sk' + '-' + FILL],
  ['sk- style API key', 'sk' + '-ant-api03-' + FILL],
  ['Slack token', 'xo' + 'xb-1234-' + FILL],
  ['Google OAuth client secret', 'GOC' + 'SPX-' + FILL],
  ['GitHub token', 'gh' + 'p_' + FILL],
  ['GitHub token', 'gh' + 's_' + FILL],
  ['GitHub token', 'github' + '_pat_' + FILL],
  ['URL with embedded password', 'postgres://admin' + ':' + FILL + '@db.example.com/app'],
  ['URL with embedded password', 'redis://' + ':' + FILL + '@cache.example.com:6379'],
  ['URL with embedded password', 'https://bot' + ':' + FILL + '@git.example.com/x.git'],
  ['Portainer webhook URL', 'https://ops.example.com/api/stacks' + '/webhooks/' + '0a1b2c3d-4e5f-6789-abcd-ef0123456789'],
  ['client_secret JSON', '{"client' + '_secret": "' + FILL + '"}'],
  ['client_secret JSON', '{\\"client' + '_secret\\":\\"' + FILL + '\\"}'],
] as const

const CLEAN = [
  'Please refactor the task-runner and the risk-assessment module.',
  'Open https://example.com:8080/docs and read the postgres://localhost/app notes.',
  'Use postgres://app:${DB_PASS}@db.example.com/app from the environment.',
  'Portainer stack webhooks live under /api/stacks/webhooks/ in its API.',
  'The client_secret field goes in the JSON file.',
]

// Stands for the engine beneath the plugin, recording what got through.
const engine = (on: On) => {
  const entered: string[] = []
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  return entered
}

const typed = (text: string, kind: 'composer' | 'peer' = 'composer') =>
  ({ text, wait: false, origin: { kind } }) as const

for (const [type, secret] of CASES) {
  test(`stops ${type} (${secret.slice(0, 8).replace(/./g, '.')})`, async ($, on) => {
    const entered = engine(on)
    const result = await $.prompt.submit(typed(`here you go: ${secret} thanks`))

    expect(entered).toEqual([])
    expect(result.drop).toContain(type)
    expect(result.drop).toContain('allow-secret:')
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain(FILL)
  })
}

for (const text of CLEAN) {
  test(`passes: ${text.slice(0, 30)}`, async ($, on) => {
    const entered = engine(on)
    const result = await $.prompt.submit(typed(text))

    expect(entered).toEqual([text])
    expect(result.drop).toBeUndefined()
  })
}

const SECRET = CASES[0][1]

test('allow-secret: sends the prompt without the prefix', async ($, on) => {
  const entered = engine(on)
  await $.prompt.submit(typed(`allow-secret: ${SECRET}`))

  expect(entered).toEqual([SECRET])
})

test('allow-secret: only counts at the start', async ($, on) => {
  const entered = engine(on)
  const result = await $.prompt.submit(typed(`${SECRET} allow-secret:`))

  expect(entered).toEqual([])
  expect(result.drop).toBeDefined()
})

test('a peer session message is not dropped', async ($, on) => {
  const entered = engine(on)
  await $.prompt.submit(typed(SECRET, 'peer'))

  expect(entered).toEqual([SECRET])
})
