// src/app/text-slot.ts
/** Um arquivo de texto da pasta de dados do app (AppData). `read` devolve null se não existe. */
export interface TextSlot {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}
