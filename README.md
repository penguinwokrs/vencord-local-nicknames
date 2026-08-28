# LocalNicknames

日本語版は [README.ja.md](README.ja.md) にあります。

An [Equicord](https://github.com/Equicord/Equicord) UserPlugin that lets you give other
Discord users a nickname that exists **only inside your own client**.

The nickname you set is used as that user's display name everywhere, no matter which
server you are looking at them in. No server API is involved: the nickname is invisible
to everyone else and is never sent to Discord (with one exception, via Discord's own
nickname dialog — see [Known limitations](#known-limitations)).

> The interface is English by default and switches to Japanese when Discord's language is
> set to Japanese. Detection uses `LocaleStore.locale`; every other locale gets English.
> This covers the plugin's own description in the plugin list too — it is a getter, resolved
> when the settings screen renders rather than baked in at load time.

## How it works

The plugin applies **no webpack patches of its own.** It wraps six functions at runtime
and substitutes the nickname on the way out:

| Wrapped function | Surfaces it covers |
| --- | --- |
| `UsernameUtils.getName` | DMs, profiles, friends list |
| `UsernameUtils.useName` | The same, via the hook path |
| `GuildMemberStore.getNick` | Some guild surfaces |
| `RelationshipStore.getNickname` | The friend-nickname path |
| `GuildMemberStore.getMember` | Guild surfaces in general — Discord reads this, not `getNick` |
| `GuildMemberStore.getMembers` | The `@`-mention autocomplete candidate list |

`GuildMemberStore.getTrueMember` is deliberately **not** wrapped; see
[Known limitations](#known-limitations).

Avoiding webpack patches is the point: patches break whenever Discord's internals shift,
and every one of them is a maintenance liability.

## Usage

Right-click a user → `Set local nickname` → type it → `OK`.

For a user who has no nickname yet, the input is **pre-filled with their original display
name**, so you can edit it instead of retyping it.

To remove a nickname, right-click → `Clear local nickname`, or leave the input empty and
press `OK`.

The profile of a user with a nickname gains a `Local nickname` section listing their
`Original name` and `Nickname`. Setting a nickname otherwise hides the original name
completely, so this is where you can check it. It appears both in the DM sidebar profile
and in the profile modal.

The saved list lives under Settings → Plugins → LocalNicknames → the gear icon.

## Name resolution priority

```
local nickname > server nickname > friend nickname > display name > username
```

## Live updates

Setting or clearing a nickname updates message headers, the DM list, the friends list and
profiles immediately, without a reload. (The member list is the exception — see
[Known limitations](#known-limitations).)

Under the hood this only calls `emitChange()` on the three stores whose reads are
intercepted (`GuildMemberStore`, `RelationshipStore` and `UserStore`), telling subscribed
components to read again. No real data is touched, and nothing is sent to Discord.

## Installation

Equicord has no runtime plugin loader, so you build an Equicord that contains this plugin
and point Equibop at the result.

```bash
./tools/setup.sh     # clone Equicord, install deps, link this repo into src/equicordplugins/
./tools/build.sh     # build Equicord
./tools/deploy.sh    # copy the output to /mnt/c/Users/<you>/EquicordCustom
```

Then, in Equibop, set Settings → **Equicord Location** to `C:\Users\<you>\EquicordCustom`
and restart Equibop. You only need to do this once.

Point it at the folder that *contains* the generated `equibop\` folder, not at `equibop\`
itself.

Both the clone directory and the deploy directory can be overridden:

```bash
EQUICORD_DIR=/path/to/Equicord DEPLOY_DIR=/mnt/c/Users/you/EquicordCustom ./tools/deploy.sh
```

### About `tools/gen-tsconfig.sh`

The `tsconfig.json` at the repository root is generated and git-ignored. Do not edit or
commit it if you see it.

It exists because of how Equicord builds. Equicord's esbuild resolves each source file to
its real path (following symlinks) and then walks *up* from there looking for a
`tsconfig.json`. This repository is only symlinked into `src/equicordplugins/` from
outside Equicord's tree, so that walk never reaches Equicord's own `tsconfig.json` — the file that
defines path aliases such as `@utils/*`. `tools/gen-tsconfig.sh` generates a
`tsconfig.json` at this repository's root that points at Equicord's real aliases, which
ends the search at the right place.

Both `tools/setup.sh` and `tools/build.sh` call it automatically, so you normally never
run it yourself.

One known limitation: the script hard-codes a mirrored copy of Equicord's path alias list
(currently 14 — the 13 inherited from Vencord plus Equicord's own `@equicordplugins/*`).
If Equicord adds or renames an alias, this will not follow, and esbuild will fail with
something like `Could not resolve '@some/alias'`.

## Updating

Once you change the Equicord location away from the default, Equibop stops fetching
Equicord for you. Update with:

```bash
./tools/update.sh    # pull Equicord, rebuild, redeploy
```

## Tests

Only the pure logic is covered by automated tests.

```bash
./tools/test.sh
```

Type checking and linting run on the Equicord side:

```bash
cd "$HOME/projects/github.com/Equicord/Equicord" && pnpm testTsc && pnpm lint
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

- **Unit tests** — `./tools/test.sh` on Node 22.
- **Type check, lint and build** — clones Equicord, links this repository into
  `src/equicordplugins/`, then runs `pnpm testTsc`, `pnpm lint` and a full build.
- **Bundle verification** — greps the built `renderer.js` for this plugin's code. A green
  build proves nothing on its own; this repository has already had a case where type
  checking, linting, building and deploying all succeeded while the plugin did nothing at
  all, because the sources were in the wrong directory.

## Versioning and releases

Versions are managed with git tags. Pushing a tag matching `v*` triggers
`.github/workflows/release.yml`, which creates a GitHub release with **automatically
generated release notes**. The categories are configured in `.github/release.yml`.

```bash
git tag -a v1.2.3 -m "v1.2.3"
git push origin v1.2.3
```

There is no `package.json` in this repository (see the note in the design document about
why one must not be added), so tags are the single source of truth for the version.

## Known limitations

- **Discord's internals can change.** If they do, some or all surfaces may stop working.
  The plugin will not crash; it logs a `[LocalNicknames]` warning to the DevTools console
  instead.
- **The member list on the right does not update immediately.** Every other surface does.
  Switch channels or press Ctrl+R and it will be correct. This is not a missing store
  notification — sending `emitChange()` to all 506 Flux stores changes nothing. The member
  list is a virtualised list that computes its row data only when the list is built.
  Patching the row component would fix it, at the cost of the zero-patch property, so it
  is deliberately left alone.
- **Restoring names on disable is not verified on a real client.** `removeNameOverrides`
  is not covered by unit tests and has never been exercised in practice, so disabling the
  plugin might leave names overridden, or leave the profile section in place. If that
  happens, Ctrl+R or a client restart always returns everything to normal, because the
  modules are re-loaded and the wraps disappear with them. No data is lost and nothing is
  sent to Discord. One caveat: a nickname saved while in that state can record the wrong
  "original name", and a reload does not fix that — setting the nickname again does.
- **`ShowMeYourName` interop is untested.** Equicord ships its own version whose settings
  differ substantially from the Vencord one: there is no single `mode` switch
  (`user-nick` / `nick-user` / `user`), but per-surface boolean toggles plus a custom name
  template built from `includedNames` and `nameSeparator`. So Vencord-era expectations
  such as "username and nickname are shown together by default" do not carry over, and how
  the two plugins combine depends on your Equicord settings. The combined display relies
  on the message header's `author.nick` being derived correctly from the
  `GuildMemberStore.getNick` this plugin replaces. Neither plugin crashes either way.
- **Cloud Settings Sync uploads your nicknames.** If you enable Equicord's Cloud Settings
  Sync, your whole settings blob — including `plugins.LocalNicknames.nicknames` — is
  uploaded to whichever Equicord cloud backend you configured. That is not Discord, but
  the user IDs and the names you chose do leave your machine. Know where yours points
  before enabling it.
- **Equicord treats it as a bundled plugin.** With upstream submission in mind, the plugin
  is linked into `src/equicordplugins/localNicknames` rather than `src/userplugins/`. As a
  result `SupportHelper` no longer reports `Has UserPlugins`, and in the client the plugin
  is indistinguishable from one Equicord ships. That is harmless for a personal build, but
  be aware the marker that says "this is a user plugin" is gone.
- **Upstream contribution is out of scope.** Equicord's `CONTRIBUTING.md` allows
  AI assistance at the level of inline completion but requires that pull requests be
  substantially human-written, and forbids AI-generated PR descriptions and READMEs. This
  plugin's development does not meet that bar, so it is maintained as a local-only
  UserPlugin.
- **Discord's built-in nickname dialogs carry a send risk.** Because this plugin replaces
  `GuildMemberStore.getNick` and `RelationshipStore.getNickname`, those dialogs could in
  principle be pre-filled with a local nickname, and saving would send it to Discord as a
  real nickname — overwriting a friend's real nickname (friend profile → "Edit Nickname")
  or a member's server nickname (right-click a member with the Manage Nicknames
  permission → "Change Nickname"). **Opening the dialog is not itself risky**; only saving
  sends anything.

  Whether the field is actually pre-filled has since been checked on a real client.
  **In both dialogs the input value stays empty** — verified against a user who did have a
  local nickname. The **placeholder**, however, does show the local nickname while the
  plugin is enabled (it shows the real display name when disabled). A placeholder is not a
  value, so it is never saved and carries no send risk on its own — but it is easy to
  misread as "the name is already in there". The warning above is about what *you* type
  and save, and this observation does not retract it. Check the field's contents before
  saving in either dialog.

  `GuildMemberStore.getMember` and `getMembers` are wrapped as well (the latter because
  the `@`-mention autocomplete builds its candidate list from it), but `getTrueMember` —
  the accessor that returns the real, unmodified member, and a plausible source for those
  dialogs — is deliberately left alone, to avoid widening this risk any further.

## Manual verification checklist

For everything automated tests cannot cover. Build, deploy, restart Equibop, then work
through it.

1. The context menu entry appears in all four places: member list, message, DM list, profile
2. The modal's OK / Cancel / Esc / Enter all behave as expected
3. After saving, the message header changes without a reload (the member list needs a
   channel switch or reload — confirm that too)
4. The same user shows the same nickname in a different server (test with a user who has a
   server nickname set)
5. The DM list, voice channels, mentions and profiles are all substituted
6. Saving an empty field restores the standard display
7. `Clear local nickname` from the menu also restores the standard display
8. The entry does not appear for yourself, and your own server-profile nickname field is
   untouched
9. The settings screen lists entries and the delete button works
10. Settings survive an Equibop restart
11. Combined display with `ShowMeYourName` is not broken
12. Give a friend a nickname, open their profile → "Edit Nickname", and check what the
    field contains (**do not press save**)
13. In a server where you can manage nicknames, right-click a member who has a nickname →
    "Change Nickname", and check the field the same way (**do not press save**)
14. Disable LocalNicknames in Settings → Plugins and confirm the member list, message
    headers, DM list, mentions and profiles all revert to Discord's own display, with no
    `[LocalNicknames]` restore-failure messages in the console
15. Re-enable it and confirm nicknames come back everywhere
16. Repeat the disable/enable cycle once more (some bugs only surface on the second pass)
17. Opening `Set local nickname` for a user with no nickname pre-fills the input with their
    original display name; opening it for a user who already has one shows the current
    nickname instead
18. The profile of a user with a nickname shows the `Local nickname` section with
    `Original name` and `Nickname`. Check both the DM sidebar profile and the profile modal.
    Users without a nickname get no section
19. Switch Discord's language to Japanese and confirm every string above switches too,
    including the plugin's description in Settings → Plugins; switch to a third language
    and confirm it falls back to English

Items 1–13, 17 and 18 have been verified. **Items 14–16 are deliberately skipped** — see
the restore limitation above; in short, a failure is always recoverable with a reload or a
restart, so it carries no unrecoverable cost.

Also check:

- Open DevTools (Ctrl+Shift+I) right after enabling the plugin and confirm no
  `[LocalNicknames]` warnings or errors. If there are any, the message names which of the
  six paths failed.
- Type a single character into the modal's input and confirm it appears as typed.
- Scroll a large server's member list hard and confirm rendering is no heavier than with
  the plugin disabled.

## License

GPL-3.0-or-later, matching Vencord and Equicord.
