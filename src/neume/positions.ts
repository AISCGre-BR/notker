// src/neume/positions.ts
// Edição PURA (string→string) do posicionamento de um token NABC, conforme
// GregorioNabcRef §184–268:
//   • ajuste horizontal (prefixo): / // (direita)  ` `` (esquerda)
//   • pitch (vertical, sufixo do glifo): h<letra>, letras a–n,p; default hf
// Não altera a identidade do neuma (D7 do spec). Sem dependência de CodeMirror —
// 100% testável. A casca CodeMirror (atalhos/botões) vive em nabc-move.ts.

/** Letras de pitch válidas, em ordem (a–n, depois p; não há 'o'). §258–262. */
const PITCH_ALPHA = "abcdefghijklmnp";

/** Início de um descritor de cauda (su/pp com contagem, ou ls/lt) — encerra o "head". */
const TAIL_RE = /su[a-z]?\d|pp[a-z]?\d|l[st]/;

/** Separa um token em prefixo de deslocamento, "head" (glifo+modif+pitch) e cauda. */
function splitToken(token: string): { prefix: string; head: string; tail: string } {
  const prefix = token.match(/^[/`]+/)?.[0] ?? "";
  const body = token.slice(prefix.length);
  const ti = body.search(TAIL_RE);
  const head = ti >= 0 ? body.slice(0, ti) : body;
  const tail = ti >= 0 ? body.slice(ti) : "";
  return { prefix, head, tail };
}

export interface Position { hshift: number; pitch: string }

/** Lê o deslocamento horizontal (passos, + direita / − esquerda) e a letra de pitch. */
export function parsePosition(token: string): Position {
  const prefix = token.match(/^[/`]+/)?.[0] ?? "";
  const hshift = (prefix.match(/\//g)?.length ?? 0) - (prefix.match(/`/g)?.length ?? 0);
  const pitch = token.slice(prefix.length).match(/h([a-np])/)?.[1] ?? "f";
  return { hshift, pitch };
}

/** Sobe (+1) / desce (−1) a altura, com clamp em a..p; volta a 'f' remove o `h<letra>`. */
export function nudgePitch(token: string, delta: number): string {
  const { prefix, head, tail } = splitToken(token);
  const cur = head.match(/h([a-np])/)?.[1] ?? "f";
  const idx = PITCH_ALPHA.indexOf(cur) < 0 ? PITCH_ALPHA.indexOf("f") : PITCH_ALPHA.indexOf(cur);
  const ni = Math.min(PITCH_ALPHA.length - 1, Math.max(0, idx + delta));
  const letter = PITCH_ALPHA[ni];
  const headNoPitch = head.replace(/h[a-np]/, "");
  const pitch = letter === "f" ? "" : `h${letter}`;
  return prefix + headNoPitch + pitch + tail;
}

/** Empurra o neuma à direita (dir=+1, insere `/`) ou esquerda (dir=−1, `\``); larger = passo maior. */
export function nudgeHShift(token: string, dir: number, larger: boolean): string {
  const prefix = token.match(/^[/`]+/)?.[0] ?? "";
  const body = token.slice(prefix.length);
  const cur = (prefix.match(/\//g)?.length ?? 0) - (prefix.match(/`/g)?.length ?? 0);
  const next = cur + dir * (larger ? 2 : 1);
  const newPrefix = next > 0 ? "/".repeat(next) : "`".repeat(-next);
  return newPrefix + body;
}

/** Remove qualquer deslocamento horizontal e pitch, voltando à forma canônica mínima. */
export function resetPosition(token: string): string {
  const { head, tail } = splitToken(token);
  return head.replace(/h[a-np]/, "") + tail;
}
