# sd-claude-mods

Personal Claude Code mods, installable on any computer with one command. Mods install per computer, not per Claude account.

## Not part of develop-like-sudipta

sd-claude-mods and develop-like-sudipta are two separate things. You install each one on its own.

| | sd-claude-mods | develop-like-sudipta |
| --- | --- | --- |
| What it is | Mods that change how Claude Code behaves | A plugin for development discipline |
| Repo | [sudipta26889/sd-claude-mods](https://github.com/sudipta26889/sd-claude-mods) | [sudipta26889/claude-plugin-develop-like-sudipta](https://github.com/sudipta26889/claude-plugin-develop-like-sudipta) |
| Install | The `curl` line under [Install](#install) | `claude plugin marketplace add sudipta26889/claude-plugin-develop-like-sudipta`, then `claude plugin install develop-like-sudipta@claude-plugin-develop-like-sudipta` |
| What it changes | Stops prompts that look like they contain a secret, and shows plan usage and running agents above the prompt | Adds slash commands, skills, agents and hooks |

- Installing or updating develop-like-sudipta does not install these mods.
- Installing these mods does not change that plugin.
- Neither depends on the other.

Mods install per computer, not per Claude account, so each computer needs the install once. If you switch Claude account on a computer, the mods should keep working. That has not been tested.

### Check, update and remove

**See what is installed:** run `claude plugin list`. In a session, `/plugin` also shows a line such as `3 mods active · secret-guard, usage-meter, agent-radar`.

**Update:** this happens by itself after [Install](#install). To update by hand, run these lines, then restart Claude Code. Updating `sd-core` does not update `secret-guard`.

```bash
claude plugin marketplace update sd-claude-mods
claude plugin update sd-core@sd-claude-mods
claude plugin update secret-guard@sd-claude-mods
claude plugin update usage-meter@sd-claude-mods
claude plugin update agent-radar@sd-claude-mods
```

**New mods:** a merge does not deliver a new mod to a computer that is already set up. Auto-update only updates what is installed. To get a new mod, run the line under [Install](#install) again.

**Remove everything:** this removes every plugin from here and the marketplace.

```bash
claude plugin marketplace remove sd-claude-mods
```

**Remove one mod and keep the marketplace:**

```bash
claude plugin uninstall usage-meter@sd-claude-mods
claude plugin uninstall agent-radar@sd-claude-mods
claude plugin uninstall blast-radius@sd-claude-mods
claude plugin uninstall deploy-guard@sd-claude-mods
claude plugin uninstall voice-fix@sd-claude-mods
claude plugin uninstall reflect@sd-claude-mods
claude plugin uninstall handoff@sd-claude-mods
claude plugin uninstall sd-core@sd-claude-mods --prune -y   # also removes secret-guard
```

Running the install line again puts `usage-meter` and `agent-radar` back, and it installs `sd-core` and `secret-guard` again too. To keep `usage-meter` or `agent-radar` off, use `claude plugin disable <mod>@sd-claude-mods` instead: the install line leaves a disabled mod disabled.

Uninstalling `sd-core` without `--prune` leaves `secret-guard` installed and still stopping prompts. `claude plugin prune` then removes it.

**Turn off `secret-guard` only:** `claude plugin disable secret-guard@sd-claude-mods` is refused while `sd-core` is enabled. Disable `sd-core` first, then `secret-guard`. Enabling `sd-core` turns `secret-guard` back on.

### Where mods run

| Where you run Claude Code | Do mods run? |
| --- | --- |
| Terminal, including an editor's terminal and the JetBrains plugin | Yes |
| Desktop app Code tab and the VS Code extension | Yes |
| Remote Control | Yes, in the session on your computer |
| `claude -p` and the Agent SDK | Hooks run, but nothing is drawn |
| WSL session in the Desktop app | No |
| Cloud session | Not from this install, which stays on your computer |
| Cowork | Not in the docs' list, so do not rely on it |

## Install

Needs `git` and Claude Code v2.1.287 or newer. The repository is public, so no GitHub login is needed.

```bash
curl -fsSL https://raw.githubusercontent.com/sudipta26889/sd-claude-mods/main/scripts/bootstrap.sh | bash
```

Run it again at any time: each step checks before it changes anything.

**If a third-party mod can't be fetched:** the run carries on. A warning names the mod and the command to retry it, and the last line lists what did not install. `secret-guard` still goes on, because `sd-core` does not depend on those mods. Run the install line again to retry.

**No GitHub SSH key?** Installs from `/plugin` and plugin updates need `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, because they do not fall back to HTTPS on their own. `bootstrap.sh` adds it to the `env` block of `settings.json` when it finds no working key.

**Auto-update** is on after `bootstrap.sh`. `marketplace.json` has no field for it, so the script sets `"autoUpdate": true` on this marketplace under `extraKnownMarketplaces` in your user `settings.json`. Merged changes arrive in the background within about ten minutes of your first message in a session, and load after `/reload-plugins` or at your next launch. To confirm it is on, open `/plugin`, Marketplaces, `sd-claude-mods`: the row reads Disable auto-update. `DISABLE_UPDATES`, `DISABLE_AUTOUPDATER` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turn plugin auto-update off.

## Mods

| Plugin | What it does | Installed by | Source | Licence | Reviewed SHA |
| --- | --- | --- | --- | --- | --- |
| `sd-core` | Holds no code. Its only dependency is `secret-guard`, the one mod every computer must have. | `bootstrap.sh` | This repository | MIT | Not applicable |
| `secret-guard` | Stops a prompt that looks like it contains a secret. | `sd-core` | This repository | MIT | Not applicable |
| `usage-meter` | Shows the plan's 5-hour and 7-day usage, the reset countdown and the session's cost above the prompt. | `bootstrap.sh` | [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods/tree/5cef0d32daad002b7936920e47a317fd2fd066f0/mods/usage-meter) | MIT | `5cef0d32daad002b7936920e47a317fd2fd066f0` |
| `agent-radar` | Shows one live line above the prompt per running subagent or background shell. `/radar` shows the details. | `bootstrap.sh` | [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods/tree/5cef0d32daad002b7936920e47a317fd2fd066f0/mods/agent-radar) | MIT | `5cef0d32daad002b7936920e47a317fd2fd066f0` |
| `blast-radius` | Holds a risky shell command and shows what it would change, with Proceed and Cancel buttons. | Optional, by name | [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/569c5283d9a0a7ee7938df85bb32e4f48cbb8c86/claude-code/mods/blast-radius) | Apache-2.0 | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` |
| `deploy-guard` | Holds a `git push` for your yes while a job is running. You say what counts as running. | Optional, by name | This repository | MIT | Not applicable |
| `voice-fix` | Swaps misheard words in a prompt using your own glossary. No model call. | Optional, by name | This repository | MIT | Not applicable |
| `reflect` | Offers to save a correction such as "never do X" as a permanent rule, once you press Save. No model call. | Optional, by name | This repository | MIT | Not applicable |
| `handoff` | `/handoff` summarises the conversation, saves the summary privately, and carries on in a fresh conversation with it. One model call. | Optional, by name | This repository | MIT | Not applicable |

`sd-core` holds only the guard. If a dependency can't be fetched, installing the plugin that needs it fails and the guard stays off, so nothing from another repository goes in `sd-core`. `bootstrap.sh` installs `usage-meter` and `agent-radar` separately. Installing `sd-core` from `/plugin` gets you `secret-guard` only.

`blast-radius` is opt-in, and `bootstrap.sh` does not install it. Install it by name: `claude plugin install blast-radius@sd-claude-mods`.

Third-party mods are fetched from their own repositories at the reviewed commit. None of their code is kept here, and none of it changes until the pinned SHA in `marketplace.json` changes. Mods are not sandboxed, so read a new commit before you pin it.

**`agent-radar` limit:** it shows the last line of a background shell's output above the prompt, so a command that prints a secret shows it on screen.

**`blast-radius` limits:**

- **`claude -p` waits.** Nothing is drawn, so nobody can answer. A risky command waits, and its source refuses the command after 10 minutes. This can stall bots and scripts.
- **It reads only the command text.** It misses forms such as `bash -c "rm -rf x"`. Use permission rules for a hard block.
- **It runs project code for migrations.** It runs the project's own migration status command before you answer, which loads your project's code.

It adds a check and removes none: after Proceed, the normal permission prompt still applies.

## deploy-guard

Optional: `claude plugin install deploy-guard@sd-claude-mods`. Then set `jobCheck` on the install screen or in `/config`. It stays on that computer, never in this repository.

`jobCheck` is a shell command, run before each `git push` the model tries:

| Exit code | Meaning | What happens |
| --- | --- | --- |
| 0 | A job is running | The push is held: you are asked, and the first line of the command's output says which job |
| 1 | No job | The push goes on under your normal permissions |
| Anything else, or over 15 seconds | The check failed | A warning shows and the push goes on |

`grep` and `pgrep` already exit this way, and `ssh` adds 255 when it can't connect, so a check is often one line: `ssh my-server pgrep -f nightly-import`. With `jobCheck` empty, each push warns and goes on.

**Limits:**

- **It reads only the command text.** It misses aliases, scripts such as `./deploy.sh`, `gh pr merge`, and pushes you run yourself, including `!` bash mode. Use permission rules for a hard block.
- **Any text that says `git push` can be held,** such as a commit message or `git push --dry-run`, but only while a job is running.
- **One check for the whole computer.** The check runs in the session's folder and knows nothing about the repository being pushed. A job holds pushes from every repository unless your command tells them apart.
- **`claude -p` and background subagents refuse the push.** Nobody can be asked, so the model gets the reason as an error. A failed check's warning is not drawn under `claude -p`, so it reaches only the debug log.
- **Your command runs as you,** on every push, and adds up to 15 seconds.
- **macOS and Linux only.** It runs through `sh`.
- **A check killed by a signal counts as no job,** because Claude Code reports that as exit code 1.

## voice-fix

Optional: `claude plugin install voice-fix@sd-claude-mods`. Then set `glossary` on the install screen or in `/config`. It stays on that computer, never in this repository.

`glossary` is comma-separated `heard=meant` pairs, such as `zorb=Zorbix, blue berry=Blueberry`. Heard text matches whole words in any case, and a longer phrase wins over a word inside it. Bad entries are skipped, and a warning at session start counts them.

It leaves alone anything in backticks or a code fence, URLs, and words that are part of a path, flag, email or file name, such as `src/zorb`, `--zorb` or `zorb.py`.

**Limits:**

- **It has no sense of meaning.** A word in the glossary is swapped every time, even when you meant that word. Put it in backticks to keep it, and leave real words out of the glossary if you often mean them.
- **The swap is silent.** No message says what changed, and the original text is not sent.
- **Heard and meant text can't contain `,` or `=`.**
- **`claude -p` scripts get swaps too,** because they look the same as the Desktop app and VS Code. Messages from other sessions, schedules, background tasks and plugins do not.
- **An empty glossary does nothing,** with no warning.
- **`!` bash mode and local slash commands such as `/rename` are not covered,** as with `secret-guard`. Images and `@file` contents are not read either.

## reflect

Optional: `claude plugin install reflect@sd-claude-mods`.

When a sentence in your prompt starts with `never`, `always`, `stop` plus a word ending in `-ing`, `don't ever`, `do not ever` or `from now on`, a band above the prompt shows that sentence and asks whether to save it as a permanent rule. Click **Save** or **Dismiss**, or press ctrl+x tab and then `s` or `d`. An offer you ignore ends at your next prompt. Nothing is saved unless you press Save.

Saved rules go into the system prompt of each new session, so a rule reaches Claude from your next session. The current session has already read your sentence.

| Command | What it does |
| --- | --- |
| `/reflect` | Lists saved rules |
| `/reflect add <rule>` | Saves a rule in your own words. Use it to reword a rule, or when no band appeared |
| `/reflect remove <number>` | Removes a rule |

**Tokens:** `reflect` never calls a model, so spotting and saving a rule costs nothing. Each saved rule adds its text to every session's system prompt, so keep rules few.

**Where rules are kept:** in plain text in `plugins/store/reflect_*.json` under your Claude config folder, normally `~/.claude`. Claude Code creates that file with mode 600 in a folder with mode 700. This was checked on v2.1.317, and CI does not check it. Rules go nowhere except your own Claude sessions. An offer you have not saved stays in memory and is never written to disk. `reflect` does not change `CLAUDE.md`, memory or settings.

**Limits:**

- **It matches fixed phrases at the start of a sentence.** It misses other wordings, such as `don't do that`, and it offers sentences that are not corrections, such as `Always the same error.` Prompts over 2,000 characters are skipped as likely pastes, and so are sentences over 200.
- **It saves your exact sentence.** Nothing is cleaned up, so `Never do that.` makes a poor rule. Reword it with `/reflect add`.
- **A saved secret goes to every session.** A prompt that `secret-guard` stops is not offered, but one sent with `allow-secret:` can be. Read the sentence before you press Save.
- **One offer per prompt:** the first matching sentence.
- **Rules stay on one computer.** They are not synced. Uninstalling may leave the file behind, which has not been tested, so run `/reflect remove` first if you want them gone.
- **No band under `claude -p` or in the VS Code extension.** Use `/reflect add` in VS Code. Saved rules still reach `claude -p` sessions. The band was tested live in the terminal only.
- **Another mod can hide the band.** A mod that draws in this space without keeping what other mods draw hides the offer.

## handoff

Optional: `claude plugin install handoff@sd-claude-mods`.

Run `/handoff` when a long conversation has got heavy. One model call writes a summary of the job so far, the summary is saved to a file, and `/clear` runs. The summary then goes to the model, hidden, with your next prompt, so the fresh conversation carries on from there.

To pick it up in another window or later, run `/handoff load` in a new session in the same folder, then type your prompt.

**Where it writes:** `~/.claude/handoffs/<folder>.md`, or under `CLAUDE_CONFIG_DIR` if that is set, where `<folder>` is the project's path with every other character turned into `-`. Session text can contain secrets, so the file is mode 600 in a mode 700 folder. The mod sends it nowhere except to the model, as part of the session. The file stays until the next `/handoff` in that folder replaces it, so delete it yourself when you no longer want it: `rm -r ~/.claude/handoffs`.

If anything fails, a message says so and the conversation is kept: nothing is cleared unless the summary was saved first.

**Limits:**

- **The summary is the model's.** It can miss things, and later requests only know what it kept. It remembers this job, not your general preferences.
- **Secrets are not filtered.** The model is told not to copy them, but nothing checks that, and `secret-guard` does not scan the summary.
- **It costs tokens up front.** The summary call sends the whole conversation, and the summary goes in every later request. It should pay off only in long sessions, and the saving has not been measured.
- **One file per folder.** Two sessions in the same folder replace each other's handoff, and very similar paths, such as `a/b` and `a-b`, share a file. The file's first line names the folder it came from.
- **It needs a finished turn.** With nothing to summarise, such as a first `/handoff` in a session or a single `claude -p` prompt, it says so and saves nothing. A conversation too full for one more model call also fails: use `/compact` instead.
- **A plugin reload forgets the summary waiting for your next prompt.** `/handoff load` gets it back.
- **It needs `sh` and `mktemp`.** Without them, as on Windows without a Unix shell, the save fails and the conversation is kept. That path has not been tested.

## secret-guard

When you submit a prompt that looks like it contains a secret, the prompt is stopped before it is sent. The message names the type of secret that matched, never its value. Your text goes back in the prompt box to edit.

It detects:

- `sk-` style API keys
- Slack `xox?-` tokens
- Google `GOCSPX-` client secrets
- GitHub tokens (`gh?_` and `github_pat_`)
- URLs with an embedded password, such as `postgres://user:<password>@host`
- Portainer webhook URLs
- `client_secret` in JSON

**False positive?** Start the prompt with `allow-secret:`. The prefix is removed and the prompt is sent, and it is then stored like any other prompt, in your local history and transcript.

If the guard itself fails, the prompt is sent unchecked and a warning says so, because a broken guard must not block every prompt. The warning never contains prompt text. A detected secret is still stopped.

### What it does not cover

- **`!` bash mode and local slash commands such as `/rename`.** These do not raise `prompt.submit`, so a secret typed there is not stopped.
- **Slash commands that do raise it.** They can be stopped, but `allow-secret:` cannot be used, because a prefix would stop the line being a command.
- **Images and other attachments.** Only text is scanned.
- **`@file` mentions.** The file's contents are not scanned.
- **Messages from other sessions, schedules, background tasks and plugins.** These are let through, because dropping them would lose the message with nobody there to resend it.
- **Secrets in any other format.** Detection is a fixed pattern list.
- **What is already on disk.** The guard does not clean up earlier prompts or transcripts.

## Develop

`plugins/secret-guard` is a stable path: another repository pins it, so do not rename or move it.

No version numbers: our plugin manifests and marketplace entries omit `version`, so installs track commits. The third-party manifests set their own `version`, which Claude Code reads first, so a new pinned SHA reaches computers only if that `version` also changed. Entry and manifest names must match. Per-computer values go in `userConfig`, never in the repository.

`main` is protected: every change goes through a pull request that passes the `check` job. Installed computers track `main`, so merging is releasing, except that a new mod needs the install line run again.

```bash
claude --plugin-dir plugins/secret-guard     # run a mod from its folder
claude plugin validate .                     # the marketplace
claude plugin validate plugins/secret-guard  # a mod
claude plugin test plugins/secret-guard      # a mod's tests
scripts/bootstrap.test.sh                    # bootstrap, against a stub claude
```

Loading a mod lays its types in `.claude-plugin/types/`, ignored by git. After that, `tsc -p plugins/secret-guard` type-checks it.

Test secrets are fakes split by string concatenation, so the repository's secret scan stays clean. Never use real credentials.

## License

MIT. See [LICENSE](LICENSE).
