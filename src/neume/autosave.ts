/** autosave.ts — escrita debounced com promessa VERDADEIRA e flush.
 *  `schedule()` agenda a escrita (coalescendo rajadas) e devolve uma promessa que
 *  só resolve/rejeita quando a escrita que cobre essa mudança termina — é o que o
 *  indicador "salvo ✓" do painel precisa. `flush()` escreve já o que estiver
 *  pendente (antes de importar/exportar/fechar a janela). `write` lê o estado
 *  ATUAL no momento em que roda; quem chama mantém esse estado em dia. */
export interface Autosave {
  schedule(): Promise<void>;
  flush(): Promise<void>;
}

export function createAutosave(write: () => Promise<void>, ms: number): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiters: { res: () => void; rej: (e: unknown) => void }[] = [];
  let inflight: Promise<void> = Promise.resolve();

  function run(): Promise<void> {
    timer = null;
    const batch = waiters;
    waiters = [];
    // encadeia após a escrita anterior: escritas nunca se cruzam
    inflight = inflight.catch(() => {}).then(write).then(
      () => batch.forEach((w) => w.res()),
      (e) => { batch.forEach((w) => w.rej(e)); throw e; },
    );
    return inflight;
  }

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      const p = new Promise<void>((res, rej) => waiters.push({ res, rej }));
      timer = setTimeout(() => { void run().catch(() => {}); }, ms);
      return p;
    },
    flush() {
      if (timer) { clearTimeout(timer); return run(); }
      return inflight;
    },
  };
}
