import { randomUUID } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const commandSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prompt: z.string(),
    position: z.number().int().nonnegative(),
  })
  .strict();

export type Command = z.infer<typeof commandSchema>;

export const rpcContract = defineRpcContract({
  commands_list: {
    input: z.object({}).strict(),
    output: z.object({ commands: z.array(commandSchema) }).strict(),
  },
  commands_create: {
    input: z
      .object({
        name: z.string().trim().min(1).max(80),
        prompt: z.string().trim().min(1).max(20_000),
      })
      .strict(),
    output: commandSchema,
  },
  commands_delete: {
    input: z.object({ commandId: z.string().trim().min(1).max(200) }).strict(),
    output: z.object({ deleted: z.boolean() }).strict(),
  },
});

const COMMANDS_CHANGED = "commands-changed";

interface CommandRow {
  id: string;
  name: string;
  prompt: string;
  position: number;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function validateName(rawName: string): string {
  const name = normalizeName(rawName);
  if (name.length === 0) throw new Error("Command name cannot be empty");
  if (name.length > 80) throw new Error("Command name cannot exceed 80 characters");
  return name;
}

function validatePrompt(rawPrompt: string): string {
  const prompt = rawPrompt.trim();
  if (prompt.length === 0) throw new Error("Command prompt cannot be empty");
  if (prompt.length > 20_000) {
    throw new Error("Command prompt cannot exceed 20,000 characters");
  }
  return prompt;
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS commands (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       prompt TEXT NOT NULL,
       position INTEGER NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS commands_name_unique
       ON commands (lower(name))`,
  ]);

  const listCommands = (): Command[] =>
    db
      .prepare("SELECT id, name, prompt, position FROM commands ORDER BY position ASC, id ASC")
      .all() as CommandRow[];

  const createCommand = (rawName: string, rawPrompt: string): Command => {
    const name = validateName(rawName);
    const prompt = validatePrompt(rawPrompt);
    const duplicate = db
      .prepare("SELECT 1 FROM commands WHERE lower(name) = lower(?)")
      .get(name);
    if (duplicate !== undefined) throw new Error("A command with that name already exists");

    const maxPosition = db
      .prepare("SELECT MAX(position) AS position FROM commands")
      .get() as { position: number | null };
    const command: Command = {
      id: randomUUID(),
      name,
      prompt,
      position: (maxPosition.position ?? -1) + 1,
    };
    db.prepare("INSERT INTO commands (id, name, prompt, position) VALUES (?, ?, ?, ?)").run(
      command.id,
      command.name,
      command.prompt,
      command.position,
    );
    bb.realtime.publish(COMMANDS_CHANGED, { at: Date.now() });
    return command;
  };

  const deleteCommand = (commandId: string): boolean => {
    const result = db.prepare("DELETE FROM commands WHERE id = ?").run(commandId);
    if (result.changes === 0) return false;
    db.transaction(() => {
      listCommands().forEach((command, index) => {
        db.prepare("UPDATE commands SET position = ? WHERE id = ?").run(index, command.id);
      });
    })();
    bb.realtime.publish(COMMANDS_CHANGED, { at: Date.now() });
    return true;
  };

  bb.rpc.register(rpcContract, {
    commands_list: () => ({ commands: listCommands() }),
    commands_create: ({ name, prompt }) => createCommand(name, prompt),
    commands_delete: ({ commandId }) => ({ deleted: deleteCommand(commandId) }),
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
