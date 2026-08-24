import { newAsyncContext, type QuickJSAsyncContext, type QuickJSHandle } from 'quickjs-emscripten';

/**
 * Runtime de execução de scripts JS num sandbox QuickJS-WASM.
 *
 * Stack atual (Etapa 4 — hardened):
 * - Variant ASYNC (asyncify) — necessário pra `await` em funções host
 * - Memory limit (10 MB), stack limit (1 MB) — patológicos morrem cedo
 * - `eval` e `Function` removidos do globalThis do guest — scripts
 *   determinísticos, sem metaprogramação opaca
 * - `setInterruptHandler` ligado a `signal` + timeout
 *
 * Padrão de uso:
 *
 *   await runScript('1 + 1');
 *   await runScript('return ctx.player.hp', buildCtxHandle);
 *   await runScript('ctx.macro.pause("hp baixo")', buildCtxHandle, {
 *     signal: macroAbortController.signal,
 *     timeoutMs: 5000,
 *   });
 */

/** Limite de heap WASM do guest. 10 MB cobre qualquer script legítimo. */
const SCRIPT_MEMORY_LIMIT = 10 * 1024 * 1024;

/** Limite de stack do guest. 1 MB ≈ 3000 frames de profundidade. */
const SCRIPT_STACK_LIMIT = 1024 * 1024;

/**
 * Código de hardening que roda no globalThis do guest ANTES de injetar
 * `ctx` e ANTES do source do usuário. Remove primitivas de avaliação
 * dinâmica para deixar scripts mais determinísticos e auditáveis.
 *
 * Nota: a "escapatória" via `({}).constructor.constructor` permanece
 * possível (constructor chain), mas é inofensiva — o sandbox é a
 * memória WASM linear, não a presença/ausência destes símbolos.
 * Removê-los é higiene, não barreira de segurança.
 */
const GUEST_HARDENING_CODE = `
  delete globalThis.eval;
  delete globalThis.Function;
`;

/**
 * Pausa/retoma o relógio do orçamento de execução. Uma função host bloqueante
 * (ex.: `ctx.alert`, que espera o usuário clicar) chama `pause` antes de
 * esperar e `resume` ao voltar, pra esse tempo não contar contra o `timeoutMs`.
 */
export interface BudgetControls {
  pause(): void;
  resume(): void;
}

/** Constrói o handle `ctx` que vai ser injetado em `globalThis.ctx`. */
export type CtxBuilder = (qctx: QuickJSAsyncContext, budget: BudgetControls) => QuickJSHandle;

export interface RunScriptOptions {
  /**
   * Sinal de cancelamento. Quando dispara, o interrupt handler do QuickJS
   * retorna true na próxima poll de bytecode, encerrando o guest com erro
   * "interrupted" que sobe pro host como exception via `unwrapResult`.
   */
  signal?: AbortSignal;
  /**
   * Tempo máximo de execução (ms). Mesmo mecanismo de cancel via interrupt
   * handler. Conta tempo bruto de instrução JS no guest; tempo bloqueado numa
   * função host (via `BudgetControls.pause`/`resume`, ex.: `ctx.alert`) é
   * descontado.
   */
  timeoutMs?: number;
}

/**
 * Avalia `source` num contexto QuickJS isolado e retorna o valor.
 *
 * Source é envelopado em `(async () => { ... })()` IIFE pra suportar
 * `await` e `return` de qualquer parte do código. Erros de sintaxe ou de
 * execução são propagados como `Error` host-side. O contexto é descartado
 * ao final — sem state entre chamadas.
 */
export const runScript = async (
  source: string,
  buildCtx?: CtxBuilder,
  options: RunScriptOptions = {},
): Promise<unknown> => {
  const qctx = await newAsyncContext();
  try {
    // ── Hardening: limits no runtime ──
    qctx.runtime.setMemoryLimit(SCRIPT_MEMORY_LIMIT);
    qctx.runtime.setMaxStackSize(SCRIPT_STACK_LIMIT);

    // ── Hardening: strip de primitivas dinâmicas no guest globalThis ──
    const hardenResult = qctx.evalCode(GUEST_HARDENING_CODE);
    qctx.unwrapResult(hardenResult).dispose();

    // ── Interrupt handler: pause/timeout abortam em <1 poll ──
    const start = Date.now();
    // Tempo bloqueado numa função host, descontado do orçamento.
    let blockedMs = 0;
    let blockStart: number | null = null;
    const budget: BudgetControls = {
      pause: () => {
        if (blockStart === null) blockStart = Date.now();
      },
      resume: () => {
        if (blockStart !== null) {
          blockedMs += Date.now() - blockStart;
          blockStart = null;
        }
      },
    };
    qctx.runtime.setInterruptHandler(() => {
      if (options.signal?.aborted) return true;
      // No poll fires while blocked (guest is asyncify-suspended), so `blockedMs` is current.
      if (options.timeoutMs !== undefined && Date.now() - start - blockedMs > options.timeoutMs) {
        return true;
      }
      return false;
    });

    if (buildCtx) {
      const ctxHandle = buildCtx(qctx, budget);
      qctx.setProp(qctx.global, 'ctx', ctxHandle);
      ctxHandle.dispose();
    }

    const wrapped = `(async () => { ${source} })()`;
    const evalResult = await qctx.evalCodeAsync(wrapped);
    const promiseHandle = qctx.unwrapResult(evalResult);
    // The IIFE returns a pending guest Promise; `resolvePromise` registers a
    // host-side `.then`, but that callback only fires after the engine drains
    // its microtask queue. Without an explicit drain the host `await` hangs
    // forever — see `resolvePromise` docs in quickjs-emscripten.
    const settledPromise = qctx.resolvePromise(promiseHandle);
    qctx.runtime.executePendingJobs();
    const settled = await settledPromise;
    promiseHandle.dispose();
    const valueHandle = qctx.unwrapResult(settled);
    const value = qctx.dump(valueHandle);
    valueHandle.dispose();
    return value;
  } finally {
    qctx.dispose();
  }
};

/**
 * Traduz mensagens de erro do QuickJS para pt-BR user-facing.
 *
 * QuickJS produz mensagens em inglês (e às vezes obscuras). Este helper
 * mapeia os casos mais comuns para mensagens claras antes de logar /
 * mostrar em toast.
 */
export const translateScriptError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('out of memory')) {
    return 'Script excedeu limite de memória (10 MB)';
  }
  if (raw.includes('stack overflow')) {
    return 'Script excedeu profundidade de recursão (1 MB de stack)';
  }
  if (raw.includes('interrupted')) {
    return 'Script interrompido (timeout ou cancelamento)';
  }
  return raw;
};
