# Hmm Commands

Hmm Commands keeps reusable instructions close to every BB agent conversation.
The Commands button appears in the agent composer (new and existing threads)
and in existing thread headers. Open it to save a command, copy its prompt, or insert it into the
active composer draft. The manager is centered 15% from the top of BB’s main chat container.

Commands are stored in the plugin's namespaced SQLite database and stay
available across BB clients. Insertion appends the prompt to the current draft,
preserves the draft's existing text, and focuses the composer without sending
anything.

## Install

From this directory:

```sh
npm install
bb plugin install .
```

After editing the plugin:

```sh
npm run build
bb plugin reload hmm-commands
```

## Use

Open a new-thread composer or an existing thread and choose the command icon
labelled **Open command manager**. **Cmd+Shift+J** (**Ctrl+Shift+J**) toggles it
open and closed from anywhere, including the composer and thread header; the
shortcut is also listed beside **Toggle commands** in the Command Palette.
With split threads, the shortcut opens the manager in the focused pane, so
inserts land in that thread's composer.
The search bar sits on one line with **New**, which reveals the form. The search
field is focused on open; filter saved commands by name or prompt (multi-word, accent-insensitive,
fuzzy on names, best match first), then press **Enter** to insert the first match. Or hover a row to reveal **Insert**,
**Copy**, **Edit**, or **Delete**. Each insert increments the command's use
count; the **Stats** tab lists the top 5 most and least used commands. The
dialog stays centered on narrow windows instead of becoming a bottom drawer.

Requires BB plugin SDK `>=0.5.29`.

## Verify

```sh
npm run typecheck
npm run build
```
