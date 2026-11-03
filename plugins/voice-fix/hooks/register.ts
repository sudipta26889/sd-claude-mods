import type { Register } from 'claude-code'

// Who dictates: the terminal, Remote Control, and the Desktop app and VS Code, which
// arrive as sdk. Anything else, or an origin added later, is left as it was written.
const SPOKEN = new Set<string>(['composer', 'bridge', 'sdk'])

// Whole words that are not part of a path, URL, flag, email or file name.
const BEFORE = '(?<![\\p{L}\\p{N}_/.@-])'
const AFTER = '(?![\\p{L}\\p{N}_/@-]|\\.[\\p{L}\\p{N}])'

// Matched first and handed back untouched, so pasted code and links stay as they are.
const LEAVE = '```[\\s\\S]*?```|`[^`\\n]*`|\\b[a-z][a-z0-9+.-]{0,30}://\\S+'

const normal = (heard: string) => heard.trim().toLowerCase().replace(/\s+/g, ' ')

export const parseGlossary = (glossary: string) => {
  const swaps = new Map<string, string>()
  let skipped = 0
  for (const entry of glossary.split(',')) {
    if (!entry.trim()) {
      continue
    }
    const [heard, meant, extra] = entry.split('=').map(part => part.trim())
    if (heard && meant && extra === undefined) {
      swaps.set(normal(heard), meant)
    } else {
      skipped += 1
    }
  }

  return { swaps, skipped }
}

export const fixer = (swaps: ReadonlyMap<string, string>) => {
  if (swaps.size === 0) {
    return (text: string) => text
  }
  const heard = [...swaps.keys()]
    // Longest first, so a phrase wins over a word inside it.
    .sort((a, b) => b.length - a.length)
    .map(words => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
  const pattern = new RegExp(`${LEAVE}|${BEFORE}(${heard.join('|')})${AFTER}`, 'giu')

  // One pass, so a replacement is never swapped again.
  return (text: string) =>
    text.replace(pattern, (match, word?: string) =>
      word === undefined ? match : (swaps.get(normal(word)) ?? match),
    )
}

// Fixed text: neither the prompt nor the glossary may reach a warning.
const FAILED = 'voice-fix failed, so this prompt was sent as written.'

export const register: Register = (on, options) => {
  const { swaps, skipped } = parseGlossary(options.glossary as string)
  const fix = fixer(swaps)

  on('session.start', ($, e, next) => {
    if (skipped > 0) {
      $.ui.toast(`voice-fix skipped bad glossary entries: ${skipped}. Each one needs the form heard=meant.`, {
        timeoutMs: 15000,
      })
    }

    return next(e)
  })

  on('prompt.submit', ($, e, next) =>
    SPOKEN.has(e.origin?.kind) ? next({ ...e, text: fix(e.text) }) : next(e),
  ).catch(($, e, next) => {
    if (!next.called) {
      try {
        $.ui.toast(FAILED, { timeoutMs: 15000 })
      } catch {
        // The prompt still goes through when the warning cannot be shown.
      }
    }

    return next(e)
  })
}
