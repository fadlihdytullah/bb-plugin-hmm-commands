import { createPortal } from "react-dom";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Command } from "lucide-react";
import {
  definePluginApp,
  useComposer,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { useCommands } from "@/hooks/use-commands";
import type { Command as SavedCommand } from "./server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  COARSE_POINTER_HEADER_ICON_BUTTON_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { usePortalScopeProps } from "@/lib/portal-scope";

const OPEN_COMMAND_MANAGER_EVENT = "hmm-commands:open-manager";
const STATS_LIMIT = 5;

function UsageList({
  title,
  commands,
  empty,
}: {
  title: string;
  commands: readonly SavedCommand[];
  empty: string;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold">{title}</h3>
      {commands.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="rounded-md border border-border/60 text-xs">
          {commands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-2.5 py-1.5 last:border-b-0"
            >
              <span className="truncate font-medium" title={command.name}>{command.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {command.useCount} {command.useCount === 1 ? "use" : "uses"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function appendPrompt(current: string, prompt: string): string {
  const trimmed = current.trimEnd();
  return trimmed.length === 0 ? prompt : `${trimmed}\n\n${prompt}`;
}

async function writeClipboard(text: string): Promise<boolean> {
  const body = typeof document === "undefined" ? undefined : document.body;
  if (body) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    body.removeChild(textarea);
    if (copied) return true;
  }

  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CommandManager() {
  const composer = useComposer();
  const { commands, isLoading, error, refresh, create, update, remove, recordUse } = useCommands();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"commands" | "stats">("commands");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const focusComposerOnClose = useRef(false);
  const setPortalHostRef = useCallback(
    (node: HTMLDivElement | null) => setPortalHost(node),
    [],
  );
  const chatContainer =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>('main[data-sidebar="inset"]');
  const portalScopeProps = usePortalScopeProps();
  const isChatScoped = chatContainer !== null && portalHost !== null;

  useEffect(() => {
    // Thread view mounts two instances (composer action + header action);
    // first listener claims the event so only one dialog opens.
    const openManager = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key.toLowerCase() !== "j" ||
        !event.shiftKey ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }
      openManager(event);
    };

    window.addEventListener(OPEN_COMMAND_MANAGER_EVENT, openManager);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(OPEN_COMMAND_MANAGER_EVENT, openManager);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setView("commands");
      setShowForm(false);
      setName("");
      setPrompt("");
      setEditingId(null);
      setQuery("");
      setBusy(false);
      setDeleteTarget(null);
    }
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCommands =
    normalizedQuery === ""
      ? commands
      : commands.filter(
          (command) =>
            command.name.toLowerCase().includes(normalizedQuery) ||
            command.prompt.toLowerCase().includes(normalizedQuery),
        );

  const mostUsed = commands
    .filter((command) => command.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || a.position - b.position)
    .slice(0, STATS_LIMIT);
  const leastUsed = commands
    .filter((command) => !mostUsed.includes(command))
    .sort((a, b) => a.useCount - b.useCount || a.position - b.position)
    .slice(0, STATS_LIMIT);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setPrompt("");
  };

  const startEdit = (command: SavedCommand) => {
    setEditingId(command.id);
    setName(command.name);
    setPrompt(command.prompt);
    setDeleteTarget(null);
    setShowForm(true);
  };

  const saveCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || name.trim() === "" || prompt.trim() === "") return;
    setBusy(true);
    try {
      if (editingId === null) await create(name, prompt);
      else await update(editingId, name, prompt);
      closeForm();
      toast.success(editingId === null ? "Command saved" : "Command updated");
    } catch (cause) {
      toast.error("Could not save command", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setBusy(false);
    }
  };

  const insertCommand = (command: SavedCommand) => {
    composer.updateText((current) => appendPrompt(current, command.prompt));
    void recordUse(command.id).catch(() => undefined);
    focusComposerOnClose.current = true;
    setOpen(false);
    toast.success("Command inserted into prompt");
  };

  const copyCommand = async (commandPrompt: string) => {
    if (await writeClipboard(commandPrompt)) {
      toast.success("Command copied");
      return;
    }
    toast.error("Could not copy command");
  };

  const deleteCommand = async (commandId: string) => {
    try {
      await remove(commandId);
      setDeleteTarget(null);
      toast.success("Command deleted");
    } catch (cause) {
      toast.error("Could not delete command", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${COARSE_POINTER_HEADER_ICON_BUTTON_CLASS} text-muted-foreground`}
          aria-label="Open command manager"
          aria-keyshortcuts="Meta+Shift+J Control+Shift+J"
        >
          <Command className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      {chatContainer !== null && portalHost === null && open ? null : (
      <DialogContent
        className={`max-h-[min(680px,calc(100dvh-2rem))] max-w-2xl overflow-hidden p-0 ${
          isChatScoped ? "!absolute !top-[15%] !translate-y-0" : ""
        }`}
        overlayClassName={isChatScoped ? "!absolute" : undefined}
        portalContainer={isChatScoped ? portalHost : null}
        onCloseAutoFocus={(event) => {
          if (focusComposerOnClose.current) event.preventDefault();
        }}
        onAfterCloseAutoFocus={() => {
          if (!focusComposerOnClose.current) return;
          focusComposerOnClose.current = false;
          composer.focus();
        }}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>Commands</DialogTitle>
              <DialogDescription>
                Save reusable instructions, then copy or insert one into this agent’s prompt.
                Shortcut: ⌘⇧J.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showForm}
              aria-controls="new-command-form"
              onClick={() => (showForm ? closeForm() : setShowForm(true))}
            >
              <Icon name={showForm ? "X" : "Plus"} aria-hidden="true" />
              {showForm ? "Close" : "New command"}
            </Button>
          </div>
          <div role="tablist" aria-label="Command views" className="mt-3 flex gap-1">
            {(["commands", "stats"] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                role="tab"
                size="sm"
                variant={view === tab ? "secondary" : "ghost"}
                aria-selected={view === tab}
                onClick={() => setView(tab)}
              >
                {tab === "commands" ? "Commands" : "Statistics"}
              </Button>
            ))}
          </div>
        </DialogHeader>

        {view === "stats" ? (
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 pb-4 sm:grid-cols-2">
            <UsageList
              title={`Top ${STATS_LIMIT} most used`}
              commands={mostUsed}
              empty="No command inserted yet."
            />
            <UsageList
              title={`Top ${STATS_LIMIT} least used`}
              commands={leastUsed}
              empty="No other commands."
            />
          </div>
        ) : (
        <div className="grid min-h-0 gap-4 overflow-y-auto px-5 pb-4">
          {showForm ? (
            <form
              id="new-command-form"
              onSubmit={saveCommand}
              className="grid gap-2.5 border-b border-border/60 pb-4"
            >
              <div className="grid gap-1.5">
                <label htmlFor="command-name" className="text-xs font-medium">
                  Name
                </label>
                <Input
                  id="command-name"
                  value={name}
                  maxLength={80}
                  autoFocus
                  placeholder="Review this change"
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="command-prompt" className="text-xs font-medium">
                  Prompt
                </label>
                <textarea
                  id="command-prompt"
                  value={prompt}
                  maxLength={20_000}
                  rows={4}
                  placeholder="Review the current diff and report correctness issues first."
                  disabled={busy}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || name.trim() === "" || prompt.trim() === ""}
                >
                  <Icon name={editingId === null ? "Plus" : "Check"} aria-hidden="true" />
                  {busy ? "Saving…" : editingId === null ? "Add command" : "Save changes"}
                </Button>
              </div>
            </form>
          ) : null}

          <section aria-labelledby="saved-commands-heading" className="grid gap-2">
            <div className="relative mb-2">
              <Icon
                name="Search"
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                placeholder="Search commands"
                aria-label="Search commands"
                className="pl-8"
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  const first = visibleCommands[0];
                  if (normalizedQuery !== "" && first) insertCommand(first);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <h3 id="saved-commands-heading" className="text-xs font-semibold">
                Saved commands
              </h3>
              {commands.length > 0 ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {normalizedQuery === ""
                    ? commands.length
                    : `${visibleCommands.length} / ${commands.length}`}
                </span>
              ) : null}
            </div>

            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading commands…</p>
            ) : error !== null ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2">
                <p role="alert" className="text-xs text-destructive">{error}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            ) : commands.length === 0 ? (
              <div className="grid place-items-center gap-2 py-8 text-center">
                <Command className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No saved commands</p>
                <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                  Add the first instruction you want to reuse across agent conversations.
                </p>
              </div>
            ) : visibleCommands.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No commands match “{query.trim()}”.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
                <table className="w-full table-fixed text-xs" aria-label="Saved commands">
                  <thead className="sticky top-0 z-10 bg-background text-left text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th scope="col" className="w-40 px-2.5 py-1.5 font-medium">Name</th>
                      <th scope="col" className="px-2.5 py-1.5 font-medium">Prompt</th>
                      <th scope="col" className="w-32 px-2.5 py-1.5 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCommands.map((command) => (
                      <Fragment key={command.id}>
                        <tr className="group border-b border-border/40 last:border-b-0 hover:bg-muted/50">
                          <td className="truncate px-2.5 py-1 font-medium" title={command.name}>
                            {command.name}
                          </td>
                          <td className="truncate px-2.5 py-1 text-muted-foreground" title={command.prompt}>
                            {command.prompt}
                          </td>
                          <td className="px-1.5 py-0.5">
                            <div
                              className={`flex items-center justify-end gap-0.5 ${
                                deleteTarget === command.id
                                  ? ""
                                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
                              }`}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} text-muted-foreground`}
                                aria-label={`Insert ${command.name} into prompt`}
                                onClick={() => insertCommand(command)}
                              >
                                <Icon name="CornerDownLeft" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} text-muted-foreground`}
                                aria-label={`Copy ${command.name}`}
                                onClick={() => void copyCommand(command.prompt)}
                              >
                                <Icon name="Copy" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} text-muted-foreground`}
                                aria-label={`Edit ${command.name}`}
                                onClick={() => startEdit(command)}
                              >
                                <Icon name="Edit" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} text-muted-foreground hover:text-destructive`}
                                aria-label={`Delete ${command.name}`}
                                aria-expanded={deleteTarget === command.id}
                                onClick={() => setDeleteTarget(command.id)}
                              >
                                <Icon name="Trash2" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {deleteTarget === command.id ? (
                          <tr className="border-b border-border/40 bg-destructive/10 last:border-b-0">
                            <td colSpan={3} className="px-2.5 py-1">
                              <div
                                role="group"
                                aria-label={`Confirm deletion of ${command.name}`}
                                className="flex items-center justify-between gap-3"
                              >
                                <p className="font-medium text-destructive">Delete this command?</p>
                                <div className="flex items-center gap-2">
                                  <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void deleteCommand(command.id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        )}
      </DialogContent>
      )}
    </Dialog>
  );

  if (chatContainer === null || !open) return dialog;

  return (
    <>
      {dialog}
      {createPortal(
        <div {...portalScopeProps} style={{ display: "contents" }}>
          <div ref={setPortalHostRef} className="absolute inset-0 z-50" />
        </div>,
        chatContainer,
      )}
    </>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "commands",
    scopes: ["new-thread", "thread"],
    actions: [{ id: "open-commands", component: CommandManager }],
  });

  app.slots.experimental_threadHeaderAction({
    id: "commands",
    title: "Commands",
    component: CommandManager,
  });

  app.slots.commandPaletteAction({
    id: "open-commands",
    title: "Hmm Commands: open command manager",
    run: () => {
      window.dispatchEvent(new Event(OPEN_COMMAND_MANAGER_EVENT, { cancelable: true }));
    },
  });
});
