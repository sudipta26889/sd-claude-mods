import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Only what a person typed. Other origins, or one added later, offer nothing.
const TYPED = new Set<string>(['composer', 'bridge', 'sdk'])

// ponytail: fixed phrase list, no model call, so it misses other wordings; /reflect add covers those.
const RULE =
  /^(?:(?:please|and|also|so|ok|okay)[,\s]+)*(?:never\b(?!\s*mind)|always\b|stop\s+\w+ing\b|don['’]t\s+ever\b|do\s+not\s+ever\b|from\s+now\s+on\b)/i

// A long prompt is usually a paste, where these words are not said to Claude.
const MAX_PROMPT = 2000
const MAX_RULE = 200

export const correction = (text: string): string | null => {
  if (text.length > MAX_PROMPT) {
    return null
  }

  return (
    text
      .split(/(?<=[.!?])\s+|\n+/)
      .map(sentence => sentence.trim())
      .find(
        sentence =>
          RULE.test(sentence) &&
          sentence.length <= MAX_RULE &&
          /\s/.test(sentence) &&
          !sentence.endsWith('?'),
      ) ?? null
  )
}

export const section = (rules: readonly string[]) =>
  `The user saved these rules. Follow them:\n${rules.map(rule => `- ${rule}`).join('\n')}`

// Fixed text: no prompt or rule may reach these warnings.
const NOT_CHECKED = 'reflect failed, so this prompt was sent but not checked for a rule to save.'
const NOT_LOADED = 'reflect failed, so saved rules were not given to Claude this session.'
const NOT_SAVED = 'reflect could not save that rule. Nothing was changed.'

const pending = atom({ plugin: 'reflect', key: 'pending' } as const, null)

const warn = ($: EngineInterface, text: string) => {
  try {
    $.ui.toast(text, { timeoutMs: 15000 })
  } catch {
    // The prompt still goes through when the warning cannot be shown.
  }
}

const stored = async ($: EngineInterface): Promise<string[]> => {
  const rules = await $.store.get('rules')

  return Array.isArray(rules) ? rules.filter(rule => typeof rule === 'string') : []
}

const save = async ($: EngineInterface, rule: string) => {
  const rules = await stored($)
  if (!rules.includes(rule)) {
    await $.store.set('rules', [...rules, rule])
  }
}

const AFTER_SAVE = 'Saved. It reaches Claude from your next session.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'reflect',
      description: 'List saved rules, or: add <rule>, remove <number>',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    // Never offer a prompt that was stopped, such as by secret-guard.
    if (result.drop === undefined && TYPED.has(e.origin?.kind) && !e.command && !e.isMeta) {
      const rule = correction(e.text)
      const isNew = rule !== null && !(await stored($)).includes(rule)
      await update($, pending, () => (isNew ? rule : null))
    }

    return result
  }).catch(($, e, next) => {
    warn($, NOT_CHECKED)

    return next(e)
  })

  // Nothing is written until Save is pressed. Ignored, the offer ends at the next prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e) // what other mods draw here stays
    const rule = await read($, pending)
    if (rule === null || e.props.hasSurvey) {
      return rest
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>Save as a permanent rule? {rule}</Text>
        <Box gap={1}>
          <Button
            key="save"
            label="Save"
            hotkey="s"
            variant="primary"
            onPress={async () => {
              try {
                await save($, rule)
                await update($, pending, () => null)
                $.ui.toast(AFTER_SAVE)
              } catch {
                warn($, NOT_SAVED)
              }
            }}
          />
          <Button
            key="dismiss"
            label="Dismiss"
            hotkey="d"
            onPress={() => update($, pending, () => null)}
          />
          <Text dimColor>click, or ctrl+x tab then s or d</Text>
        </Box>
        {rest}
      </Box>
    )
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const rules = await stored($)

    return rules.length === 0
      ? result
      : {
          ...result,
          sections: [
            ...result.sections,
            { id: 'reflect:rules', text: section(rules), scope: 'session' as const },
          ],
        }
  }).catch(($, e, next) => {
    warn($, NOT_LOADED)

    return next(e)
  })

  on('command.run', { command: 'reflect' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const words = rest.join(' ')
    const rules = await stored($)

    if (verb === 'add' && words) {
      await save($, words)

      return { text: AFTER_SAVE }
    }
    if (verb === 'remove' && rules[Number(words) - 1] !== undefined) {
      await $.store.set('rules', rules.filter((_, index) => index !== Number(words) - 1))

      return { text: 'Removed. Claude stops getting it from your next session.' }
    }
    if (verb !== '') {
      return { text: 'Usage: /reflect, /reflect add <rule>, /reflect remove <number>' }
    }

    return {
      text:
        rules.length === 0
          ? 'No saved rules.'
          : rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n'),
    }
  })
}
