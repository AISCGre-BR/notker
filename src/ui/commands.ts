export interface CommandHandlers {
  openFile: () => void | Promise<void>;
  saveFile: () => void | Promise<void>;
  format: () => void | Promise<void>;
  exportOverlay: () => void | Promise<void>;
  importOverlay: () => void | Promise<void>;
  toggleFamily: () => void | Promise<void>;
  openSearch: () => void | Promise<void>;
  openOverlayPanel: () => void | Promise<void>;
  togglePreview: () => void | Promise<void>;
  toggleSplit: () => void | Promise<void>;
}
export type CommandId = keyof CommandHandlers;

export interface Commands {
  ids(): CommandId[];
  run(id: string): Promise<void>;
}

export function createCommands(h: CommandHandlers): Commands {
  return {
    ids: () => Object.keys(h) as CommandId[],
    run: async (id) => {
      const fn = (h as unknown as Record<string, (() => void | Promise<void>) | undefined>)[id];
      if (!fn) throw new Error("comando desconhecido: " + id);
      await fn();
    },
  };
}
