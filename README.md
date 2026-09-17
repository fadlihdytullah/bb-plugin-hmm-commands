# Hmm Commands

Hmm Commands keeps reusable instructions close to every BB agent conversation.
The Commands button appears in the new-thread composer and in existing thread
headers. Open it to save a command, copy its prompt, or insert it into the
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
labelled **Open command manager**. You can also press **Cmd+Shift+J** (or
**Ctrl+Shift+J**), or open the Command Palette with **Cmd+Shift+P** and choose
**Hmm Commands: open command manager**. Use **New command**
to reveal the form. Filter saved commands by name or prompt with the search
field, then use the compact **Insert**, **Copy**, or **Delete** actions from the
scrollable command table. The dialog becomes a bottom drawer on
narrow viewports and keeps the same actions available.

## Verify

```sh
npm run typecheck
npm run build
```
