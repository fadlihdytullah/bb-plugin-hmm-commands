import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Command } from "lucide-react";
import {
  definePluginApp,
  useComposer,
  useSidebarSplitLayout,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { useCommands } from "@/hooks/use-commands";
import type { Command as SavedCommand } from "./server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  COARSE_POINTER_HEADER_ICON_BUTTON_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { CompactViewportOverrideProvider } from "@/components/ui/hooks/use-compact-viewport";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { usePortalScopeProps } from "@/lib/portal-scope";

const TOGGLE_COMMAND_MANAGER_EVENT = "hmm-commands:toggle-manager";
const STATS_LIMIT = 5;

let closeOpenManager: (() => void) | null = null;

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
  const splitLayout = useSidebarSplitLayout();
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

  const scopeThreadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const focusedThreadId = splitLayout?.panes.find((pane) => pane.isFocused)?.threadId;

  useEffect(() => {
    const toggleManager = (event: Event) => {
      if (event.defaultPrevented) return;
      if (focusedThreadId !== undefined && focusedThreadId !== scopeThreadId) return;
      event.preventDefault();
      if (closeOpenManager) closeOpenManager();
      else setOpen(true);
    };
    window.addEventListener(TOGGLE_COMMAND_MANAGER_EVENT, toggleManager);
    return () => {
      window.removeEventListener(TOGGLE_COMMAND_MANAGER_EVENT, toggleManager);
    };
  }, [focusedThreadId, scopeThreadId]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    closeOpenManager = close;
    return () => {
      if (closeOpenManager === close) closeOpenManager = null;
    };
  }, [open]);

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
      toast.success(editingId === null ? "Saved" : "Updated");
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
    toast.success("Inserted");
  };

  const copyCommand = async (commandPrompt: string) => {
    if (await writeClipboard(commandPrompt)) {
      toast.success("Copied");
      return;
    }
    toast.error("Could not copy command");
  };

  const deleteCommand = async (commandId: string) => {
    try {
      await remove(commandId);
      setDeleteTarget(null);
      toast.success("Deleted");
    } catch (cause) {
      toast.error("Could not delete command", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const iconButton = "size-6 text-muted-foreground";

  const dialog = (
    <CompactViewportOverrideProvider isCompactViewport={false}>
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
        hideCloseButton
        className={`flex max-h-[min(560px,calc(100dvh-2rem))] max-w-xl flex-col gap-0 overflow-hidden rounded-xl p-0 ${
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
        <DialogDescription className="sr-only">
          Saved prompts you can insert into this agent.
        </DialogDescription>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 pl-4 pr-1.5">
          <DialogTitle className="text-xs font-semibold tracking-tight">Commands</DialogTitle>
          {commands.length > 0 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground/60">{commands.length}</span>
          ) : null}
          <div role="tablist" aria-label="Command views" className="ml-auto flex gap-0.5">
            {(["commands", "stats"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors ${
                  view === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "commands" ? "List" : "Stats"}
              </button>
            ))}
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label="Close">
              <Icon name="X" aria-hidden="true" className="size-3.5" />
            </Button>
          </DialogClose>
        </div>

        {view === "stats" ? (
          <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:grid-cols-2">
            <UsageList title="Most used" commands={mostUsed} empty="Nothing inserted yet." />
            <UsageList title="Least used" commands={leastUsed} empty="No other commands." />
          </div>
        ) : (
        <>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-4">
          <Icon name="Search" aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/60" />
          <input
            type="search"
            value={query}
            placeholder="Search commands…"
            aria-label="Search commands"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              const first = visibleCommands[0];
              if (normalizedQuery !== "" && first) insertCommand(first);
            }}
          />
          {query === "" ? null : (
            <button
              type="button"
              aria-label="Clear search"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <Icon name="X" aria-hidden="true" className="size-3" />
            </button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="-mr-1 h-6 shrink-0 rounded-md px-2 text-[11px]"
            aria-expanded={showForm}
            aria-controls="new-command-form"
            onClick={() => (showForm ? closeForm() : setShowForm(true))}
          >
            <Icon name={showForm ? "X" : "Plus"} aria-hidden="true" className="size-3" />
            {showForm ? "Close" : "New"}
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {showForm ? (
            <form
              id="new-command-form"
              onSubmit={saveCommand}
              className="grid gap-2 border-b border-border/60 bg-muted/30 p-3"
            >
              <Input
                id="command-name"
                aria-label="Name"
                value={name}
                maxLength={80}
                autoFocus
                placeholder="Name"
                disabled={busy}
                className="h-8 text-xs"
                onChange={(event) => setName(event.target.value)}
              />
              <textarea
                id="command-prompt"
                aria-label="Prompt"
                value={prompt}
                maxLength={20_000}
                rows={3}
                placeholder="Prompt"
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={closeForm}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy || name.trim() === "" || prompt.trim() === ""}
                >
                  {busy ? "Saving…" : editingId === null ? "Add" : "Save"}
                </Button>
              </div>
            </form>
          ) : null}

          {isLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
          ) : error !== null ? (
            <div className="m-3 flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2">
              <p role="alert" className="text-xs text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                Retry
              </Button>
            </div>
          ) : commands.length === 0 ? (
            <div className="grid place-items-center gap-1.5 py-10 text-center">
              <Command className="size-5 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-xs font-medium">No commands yet</p>
              <p className="text-xs text-muted-foreground">Press New to save your first prompt.</p>
            </div>
          ) : visibleCommands.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No match for “{query.trim()}”.
            </p>
          ) : (
            <ul aria-label="Saved commands">
              {visibleCommands.map((command) => (
                <li key={command.id} className="border-b border-border/40 last:border-b-0">
                  <div className="group flex h-9 items-center gap-3 pl-4 pr-2 hover:bg-muted/50">
                    <span className="w-36 shrink-0 truncate text-xs font-medium" title={command.name}>
                      {command.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={command.prompt}>
                      {command.prompt}
                    </span>
                    {deleteTarget === command.id ? (
                      <div
                        role="group"
                        aria-label={`Confirm deletion of ${command.name}`}
                        className="flex shrink-0 items-center gap-1"
                      >
                        <span className="mr-1 text-xs text-destructive">Delete?</span>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setDeleteTarget(null)}>
                          Cancel
                        </Button>
                        <Button type="button" variant="destructive" size="sm" className="h-6 px-2 text-[11px]" onClick={() => void deleteCommand(command.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} ${iconButton}`}
                          aria-label={`Insert ${command.name}`}
                          onClick={() => insertCommand(command)}
                        >
                          <Icon name="CornerDownLeft" aria-hidden="true" className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} ${iconButton}`}
                          aria-label={`Copy ${command.name}`}
                          onClick={() => void copyCommand(command.prompt)}
                        >
                          <Icon name="Copy" aria-hidden="true" className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} ${iconButton}`}
                          aria-label={`Edit ${command.name}`}
                          onClick={() => startEdit(command)}
                        >
                          <Icon name="Edit" aria-hidden="true" className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`${COARSE_POINTER_ROW_ACTION_SIZE_CLASS} ${iconButton} hover:text-destructive`}
                          aria-label={`Delete ${command.name}`}
                          onClick={() => setDeleteTarget(command.id)}
                        >
                          <Icon name="Trash2" aria-hidden="true" className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </>
        )}
      </DialogContent>
      )}
    </Dialog>
    </CompactViewportOverrideProvider>
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

  app.commands.register({
    id: "toggle-commands",
    title: "Toggle commands",
    defaultShortcut: { key: "j", mod: true, shift: true },
    run: () => {
      window.dispatchEvent(new Event(TOGGLE_COMMAND_MANAGER_EVENT, { cancelable: true }));
    },
  });
});
