import type { EngineInterface, Register } from 'claude-code'

const PROMPT = `Write a handoff so a fresh session with none of this conversation can carry on exactly where this one stops. Use these headings: Goal, Done so far, Decisions and why, Current state (files, branches, commands, what passes and fails), Next steps, Open questions, Corrections the user gave. Be brief and specific, and keep exact paths and names. Never copy a password, token, key or other secret: name where it lives instead. Reply with the handoff alone.`

const PREAMBLE = 'A handoff from an earlier session in this folder follows. It is your own earlier summary and may be out of date, so check it against the files before you rely on it.'

// Fixed text: neither session content nor an error message may reach a warning.
const KEPT = 'This conversation was kept.'
const FAILED = `handoff failed, so nothing was handed off. ${KEPT}`
const NOT_CLEARED = 'handoff saved the summary but could not start a fresh conversation. Run /clear, then /handoff load.'

// ponytail: one file per project, so a new handoff replaces the last. Different
// folders can share a key (a/b and a-b); the file's first line names its folder.
const handoffFile = async ($: EngineInterface) => {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  const dir = `${config}/handoffs`
  const key = (await $.session.root()).replace(/[^A-Za-z0-9]/g, '-')

  return { dir, file: `${dir}/${key}.md` }
}

export const register: Register = on => {
  // ponytail: a reload forgets this, and /handoff load gets it back from the file.
  let pending: string | undefined

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'handoff',
        description: 'Summarise this conversation and continue in a fresh one',
        argumentHint: '[load]',
      })
    } catch {
      $.ui.toast('handoff could not register /handoff, so it is not available.', { timeoutMs: 15000 })
    }

    return next(e)
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    try {
      const { dir, file } = await handoffFile($)
      const args = e.args.trim()

      if (args === 'load') {
        if (!(await $.fs.exists(file))) {
          return { text: `handoff found nothing saved for this folder at ${file}.` }
        }
        pending = await $.fs.read(file)

        return { text: `handoff loaded ${file}. It goes to the model with your next prompt.` }
      }
      if (args !== '') {
        return { text: 'Use /handoff to hand off, or /handoff load to pick up the saved one.' }
      }

      const reply = await $.model.fork({ prompt: PROMPT })
      if (!reply.isAnswered) {
        return { text: `handoff got no summary (${reply.reason}), so nothing was saved. ${KEPT}` }
      }

      const root = await $.session.root()
      const text = `Handoff from ${root} at ${new Date(await $.clock.now()).toISOString()}\n\n${reply.text}\n`
      const saved = await $.process.run(['sh', `${$.plugin.root}/hooks/save.sh`, dir, file], { stdin: text })
      // Clearing without a saved copy would lose the conversation's context.
      if (saved.exitCode !== 0) {
        return { text: `handoff could not save the summary to ${file}. ${KEPT}` }
      }

      pending = text
      // A command.run hook may not run a command itself, so this starts after it ends.
      $.clock.after(100, () => {
        $.command.run({ command: 'clear' }).then(
          () => $.ui.log(`handoff saved ${file}. It goes to the model with your next prompt.`),
          () => {
            pending = undefined
            $.ui.toast(NOT_CLEARED, { timeoutMs: 15000 })
          },
        )
      })

      return { text: 'handoff saved the summary and is starting a fresh conversation.' }
    } catch {
      return { text: FAILED }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (pending === undefined) {
      return next(e)
    }

    const handoff = pending
    pending = undefined
    const result = await next({ ...e, context: [...(e.context ?? []), `${PREAMBLE}\n\n${handoff}`] })
    // Another hook, such as secret-guard, refused the prompt: keep it for the retry.
    if (result.drop !== undefined) {
      pending = handoff
    }

    return result
  })
}
