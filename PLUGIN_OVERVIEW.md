Hmm Commands is a small prompt library for BB agents. It places a Commands
action in the new-thread composer and in existing thread headers, so reusable
instructions are available before and after a thread starts.

The manager opens from the checklist action or with `Cmd+Shift+J` (`Ctrl+Shift+J`
on Windows and Linux). The new-command form is collapsed until it is requested,
and saved commands use compact inline actions. The manager is centered inside
BB’s main chat container.

Save a command with a short name and a prompt body. The manager keeps each
saved prompt in the plugin's own SQLite database, refreshes open BB clients
through a realtime signal, and provides three direct actions:

- Copy the prompt to the system clipboard.
- Insert it into the active agent composer, preserving any draft text.
- Delete it after an inline confirmation.

Insertion only edits the draft and returns focus to the prompt input. It never
submits the agent turn. The responsive dialog becomes a drawer on narrow or
coarse-pointer screens, and list actions use larger touch targets there.
