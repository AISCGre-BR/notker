export interface CommandHandlers {
  newProjectCmd?: () => void | Promise<void>;
  openFile: () => void | Promise<void>;
  saveFile: () => void | Promise<void>;
  exportGabc?: () => void | Promise<void>;
  exportAllGabcCmd?: () => void | Promise<void>;
  format: () => void | Promise<void>;
  exportOverlay: () => void | Promise<void>;
  importOverlay: () => void | Promise<void>;
  toggleFamily: () => void | Promise<void>;
  openSearch: () => void | Promise<void>;
  openOverlayPanel: () => void | Promise<void>;
  togglePreview: () => void | Promise<void>;
  toggleSplit: () => void | Promise<void>;
  toggleLegend: () => void | Promise<void>;
  // F4: mover o neuma sob o cursor (também há atalhos Alt+setas). Opcionais para
  // não obrigar quem só testa o registro de comandos.
  moveUp?: () => void | Promise<void>;
  moveDown?: () => void | Promise<void>;
  moveLeft?: () => void | Promise<void>;
  moveRight?: () => void | Promise<void>;
  moveReset?: () => void | Promise<void>;
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
