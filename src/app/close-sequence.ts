// src/app/close-sequence.ts
/** Sequência de fechar a janela (testável). Regra de ouro: NUNCA prende a janela — o
 *  wrapper do Tauri só chama destroy() se o handler não lançar, então cada passo que pode
 *  falhar tem o seu try/catch e a função sempre resolve. `prevent: true` só quando o
 *  usuário escolheu continuar (cancelou a pergunta do guia ou das alterações). */
export interface CloseDeps {
  /** Espera uma gravação em andamento terminar (ok ou erro). */
  awaitSaving(): Promise<unknown>;
  /** Guia de novo projeto com rascunho: true = pode descartar. Ausente fora do guia. */
  confirmGuide?(): Promise<boolean>;
  /** Pergunta "Salvar alterações?"; false = o usuário cancelou. */
  resolveUnsaved(): Promise<boolean>;
  /** Nota em debounce / nome digitado na vista Neumas. */
  flushView(): void;
  flushNames(): Promise<void>;
  stopRecovery(): void;
  clearRecovery(): Promise<void>;
}

export async function runCloseSequence(d: CloseDeps): Promise<{ prevent: boolean }> {
  const step = async (name: string, f: () => unknown): Promise<boolean> => {
    try { await f(); return true; } catch (e) { console.error(`[notker] fechar (${name}):`, e); return false; }
  };
  await step("gravação em andamento", d.awaitSaving);
  if (d.confirmGuide) {
    let keepGuide = false;
    // Erro na pergunta → fecha (o rascunho do guia é o que há de menos valioso).
    if (!(await step("guia", async () => { keepGuide = !(await d.confirmGuide!()); }))) keepGuide = false;
    if (keepGuide) return { prevent: true };
  }
  let proceed = true;
  // false = a guarda falhou: o retrato de recuperação fica (única rede).
  const decided = await step("alterações", async () => { proceed = await d.resolveUnsaved(); });
  if (!proceed) return { prevent: true };
  await step("vista Neumas", d.flushView);
  await step("nomes", d.flushNames);
  await step("recuperação (parar)", d.stopRecovery);
  if (decided) await step("recuperação (apagar)", d.clearRecovery);
  return { prevent: false };
}
