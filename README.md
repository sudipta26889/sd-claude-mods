# sd-claude-mods

Personal Claude Code mods, installable on any computer with one command. Mods install per computer, not per Claude account.

## Not part of develop-like-sudipta

sd-claude-mods and develop-like-sudipta are two separate things. You install each one on its own.

| | sd-claude-mods | develop-like-sudipta |
| --- | --- | --- |
| What it is | Mods that change how Claude Code behaves | A plugin of engineering skills, agents, commands and hooks |
| Repo | [sudipta26889/sd-claude-mods](https://github.com/sudipta26889/sd-claude-mods) | [sudipta26889/claude-plugin-develop-like-sudipta](https://github.com/sudipta26889/claude-plugin-develop-like-sudipta) |
| Install | The `curl` line under [Install](#install) | `/plugin marketplace add sudipta26889/claude-plugin-develop-like-sudipta`, then `/plugin install develop-like-sudipta` |
| What it changes | Stops prompts that look like they contain a secret | How Claude approaches development work |

- Installing or updating develop-like-sudipta does not install these mods.
- Installing these mods does not change that plugin.
- Neither depends on the other.

Mods install per computer, not per Claude account, so each computer needs the install once. If you switch Claude account on a computer, the mods should keep working. That has not been tested.

### Check, update and remove

**See what is installed:** run `claude plugin list`. In a session, `/plugin` also shows a line such as `1 mod active · secret-guard`.

**Update:** this happens by itself after [Install](#install). To update by hand, run both lines, then restart Claude Code. Updating `sd-core` does not update `secret-guard`.

```bash
claude plugin update sd-core@sd-claude-mods
claude plugin update secret-guard@sd-claude-mods
```

**Remove everything:** this removes both plugins and the marketplace.

```bash
claude plugin marketplace remove sd-claude-mods
```

**Remove the plugins and keep the marketplace:**

```bash
claude plugin uninstall sd-core@sd-claude-mods --prune -y
```

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

**No GitHub SSH key?** Installs from `/plugin` and plugin updates need `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, because they do not fall back to HTTPS on their own. `bootstrap.sh` adds it to the `env` block of `settings.json` when it finds no working key.

**Auto-update** is on after `bootstrap.sh`. `marketplace.json` has no field for it, so the script sets `"autoUpdate": true` on this marketplace under `extraKnownMarketplaces` in your user `settings.json`. Merged changes arrive in the background within about ten minutes of your first message in a session, and load after `/reload-plugins` or at your next launch. To confirm it is on, open `/plugin`, Marketplaces, `sd-claude-mods`: the row reads Disable auto-update. `DISABLE_UPDATES`, `DISABLE_AUTOUPDATER` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turn plugin auto-update off.

## Mods

| Plugin | What it does |
| --- | --- |
| `sd-core` | The set of mods every computer gets. Holds no code, only `dependencies`. |
| `secret-guard` | Stops a prompt that looks like it contains a secret. |

Optional mods stay out of `sd-core`, because Claude Code refuses to disable a plugin that an enabled plugin depends on. Install those by name: `claude plugin install <mod>@sd-claude-mods`.

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

No version numbers: plugin manifests and marketplace entries omit `version`, so installs track commits. Entry and manifest names must match. Per-computer values go in `userConfig`, never in the repository.

`main` is protected: every change goes through a pull request that passes the `check` job. Installed computers track `main`, so merging is releasing.

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
