import type { Register } from 'claude-code'

// Bounded quantifiers keep each scan near-linear on very large pastes.
const RULES = [
  { type: 'sk- style API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { type: 'Slack token', pattern: /\bxox[a-z]-[A-Za-z0-9-]{10,}/ },
  { type: 'Google OAuth client secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{10,}/ },
  { type: 'GitHub token', pattern: /\b(?:gh[a-z]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  {
    type: 'URL with embedded password',
    // Skips variable and template placeholders such as ${DB_PASS} and <password>.
    pattern: /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s/:@]{0,256}:(?![$<{])[^\s/@]{1,256}@[^\s/]/i,
  },
  { type: 'Portainer webhook URL', pattern: /\/api\/stacks\/webhooks\/[A-Za-z0-9-]{8,}/ },
  { type: 'client_secret JSON', pattern: /client_secret\\?["']\s*:\s*\\?["'][^"'\\\s]/ },
] as const

const ALLOW = /^\s*allow-secret:[ \t]*/

// Sessions, schedules and plugins cannot answer a refusal, and dropping their
// message loses it. An unknown or future origin stays guarded.
const UNATTENDED = new Set<string>([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'coordinator',
  'observer',
  'observer-activity',
  'auto-continuation',
  'plugin',
])

// Fixed text: neither the prompt nor the error may reach this warning.
const UNCHECKED = 'secret-guard failed, so this prompt was sent but not checked for secrets.'

// Rule labels only: the matched text must never reach a log, toast or message.
export const secretTypes = (text: string): string[] =>
  RULES.filter(rule => rule.pattern.test(text)).map(rule => rule.type)

export const register: Register = on => {
  on('prompt.submit', ($, e, next) => {
    if (UNATTENDED.has(e.origin?.kind)) {
      return next(e)
    }

    const unprefixed = e.text.replace(ALLOW, '')
    if (unprefixed !== e.text) {
      return next({ ...e, text: unprefixed })
    }

    const types = secretTypes(e.text)

    return types.length === 0
      ? next(e)
      : {
          drop:
            `secret-guard stopped this prompt, so it was not sent. It looks like it contains: ${types.join(', ')}. ` +
            'To send it anyway, start the prompt with allow-secret:',
        }
  }).catch(($, e, next) => {
    // A broken guard must not block every prompt, so it warns and lets them through.
    if (!next.called) {
      try {
        $.ui.toast(UNCHECKED, { timeoutMs: 15000 })
      } catch {
        // The prompt still goes through when the warning cannot be shown.
      }
    }

    return next(e)
  })
}
