Hmm Commands is a small prompt library for BB agents. It places a Commands
action in the agent composer and in existing thread headers, so reusable
instructions are available before and after a thread starts.

The manager opens from the Command action or with `Cmd+Shift+J` (`Ctrl+Shift+J`
on Windows and Linux), which toggles it open and closed from the composer, the
thread header, or the Command Palette (`Toggle commands`, shortcut shown on the
right). The header carries the title, command count, List/Stats tabs, and close.
Search and a compact `New` button share one row; the new-command form is
collapsed until requested, and saved commands appear as compact rows. Search is
focused on open and matches names and prompt text; Enter with a non-empty query
inserts the first match. Each row reveals inline actions on hover or keyboard
focus; they stay visible on touch screens. The manager is centered 15% from
the top of BB’s main chat container.

Save a command with a short name and a prompt body. The manager keeps each
saved prompt in the plugin's own SQLite database, refreshes open BB clients
through a realtime signal, and provides four direct actions:

- Copy the prompt to the system clipboard.
- Insert it into the active agent composer, preserving any draft text.
- Edit its name and prompt in the same form used to create it.
- Delete it after an inline confirmation.

Every insert increments the command's use count. The **Statistics** tab shows
the top 5 most used commands and the top 5 least used ones, each with its
count; copying does not count as a use.

Insertion only edits the draft, closes the manager, and returns focus to the
prompt input. It never
submits the agent turn. The dialog stays centered on narrow windows instead of becoming a
drawer, and list actions use larger touch targets on coarse-pointer screens.
