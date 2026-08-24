import type { QuickJSAsyncContext, QuickJSHandle } from 'quickjs-emscripten';
import type { EntityCategory } from '@shared/types';
import type { ViewItem } from '@shared/types/item-types';
import { chebyshev } from '@shared/lib/movement-math';
import type { ItemUseKind } from '@shared/constants/item-use-kind';
import {
  EQUIP_SLOT_CLASS_TAG,
  EQUIP_SLOT_HELMET,
  EQUIP_SLOT_ARMOR,
  EQUIP_SLOT_PANTS,
  EQUIP_SLOT_GLOVES,
  EQUIP_SLOT_BOOTS,
  EQUIP_SLOT_WEAPON,
  EQUIP_SLOT_OFFHAND,
  EQUIP_SLOT_RING,
  EQUIP_SLOT_AMULET,
  EQUIP_SLOT_ORB,
  EQUIP_SLOT_GEM,
  EQUIP_SLOT_MEDAL,
  EQUIP_SLOT_SPECIAL,
  EQUIP_SLOT_MOUNT,
  EQUIP_SLOT_CAPE,
  EQUIP_SLOT_INCONCLUSIVE_16,
  EQUIP_SLOT_INCONCLUSIVE_17,
} from '@shared/constants/equip-slots';
import { usePlayerStore } from '../stores/player-store';
import { useGameStore } from '../stores/game-store';
import { ACTION_HORIZON_DEFAULT, isEntityActionable, isEntityPresent } from './entity-freshness';
import { getEntityLivePosition } from './entity-position';
import { logMacro } from './macro-log';
import { marshalViewItemToScript } from './script-item-marshal';
import {
  deleteMemoryValue,
  getMemoryValue,
  isMemoryValue,
  setMemoryValue,
  type MemoryValue,
} from './script-memory';
import { getItem } from './item-db';
import { isBagLocked } from '../components/game/personagem/character-tables';
import {
  countFreeSlots,
  countItem,
  findItemEntry,
  hasItem,
  isInventoryFull,
} from './inventory-introspect';

// Mirrors the canonical UI layout (`BAG_COUNT` × `BAG_SIZE` in `character-tables.ts`); product must equal `MAXL_INVENTORY`.
const INVENTORY_BAG_COUNT = 4;
const INVENTORY_BAG_SIZE = 15;

/** Script-facing `useKind` labels (pt-BR, end-user) per internal classifier kind. */
const USE_KIND_LABEL: Record<ItemUseKind, Item['useKind']> = {
  direct: 'direto',
  channel: 'pergaminho',
  menu: 'pergaminho',
  popup: 'popup',
  hud: 'painel',
  equip: 'equipamento',
  blocked: 'bloqueado',
};

/** Um item do personagem (equipamento ou do inventário). */
export interface Item {
  /** Posição do item no equipamento ou na bolsa (`0..14`). */
  readonly slot: number;
  /** Bolsa do item (`0..3`). Só em itens do inventário. */
  readonly bag?: number;
  /** ID do item. */
  readonly itemId: number;
  /** Nome do item, já com sufixos como `+N` e `[G]`. */
  readonly name: string;
  /** Nível de refino (`+1..+16`). */
  readonly refineLevel?: number;
  /** Quantidade na pilha (`1..500`). */
  readonly stackCount?: number;
  /** Item preso (valores na tabela abaixo da página). */
  readonly immovable?: 1 | 2 | 3;

  /** Como o jogo reage ao usar o item (valores na tabela abaixo da página). */
  readonly useKind: 'direto' | 'pergaminho' | 'popup' | 'painel' | 'equipamento' | 'bloqueado';

  /**
   * Usa o item (consome), disparado depois que o script termina. Só existe em
   * consumíveis de uso direto (`useKind === 'direto'`).
   *
   * @example
   * ```js
   * // Usa o melhor Pergaminho da Água(M) disponível, do LV8 ao LV1
   * const inv = ctx.player.inventory;
   * if (inv.has(784)) inv.find(784)?.use();
   * else if (inv.has(783)) inv.find(783)?.use();
   * // …
   * else if (inv.has(777)) inv.find(777)?.use();
   * ```
   */
  use?(): void;

  /**
   * Apaga o item da bolsa (joga fora). **O efeito só acontece depois que o
   * script termina**, não na hora da chamada — igual a `use()`. Enquanto o
   * script ainda roda, o item continua visível no inventário.
   *
   * Só existe em itens do inventário (bolsas), nunca em equipamentos.
   * Alguns itens não podem ser apagados pelo jogo; nesse caso o item volta
   * para a bolsa sozinho. Se o script chamar `delete()` mais de uma vez,
   * vale a **última** chamada (só um item é apagado por execução).
   *
   * @example
   * ```js
   * // Apaga o primeiro Selo Élfico (id 2490) da bolsa
   * const lixo = ctx.player.inventory.find(2490);
   * if (lixo) lixo.delete();
   * ```
   */
  delete?(): void;

  /** Os atributos do item, como no tooltip. Cada um traz `id`, `label` e `value`. */
  readonly stats: ReadonlyArray<{
    /** Identificador do atributo (ex.: `"damage"`, `"hp"`). */
    readonly id: string;
    /** Nome do atributo em português, igual ao tooltip. */
    readonly label: string;
    /** Valor numérico do atributo. */
    readonly value: number;
  }>;

  /**
   * Só existe em pergaminhos (`useKind === 'pergaminho'`). Na caça,
   * `destinations` lista os lugares; em retorno/teleporte/portal, vem vazia.
   */
  readonly scroll?: {
    /** Lugares para onde o pergaminho pode levar. Nomes podem repetir — passe o objeto inteiro para `use`, nunca só o nome. */
    readonly destinations: ReadonlyArray<{
      /** Nome do local (pode repetir). */
      readonly name: string;
      /** Posição X do destino, em tiles. */
      readonly x: number;
      /** Posição Y do destino, em tiles. */
      readonly y: number;
    }>;

    /**
     * Usa o pergaminho. O teleporte dispara depois que o script termina e
     * leva cerca de 5 segundos. Na caça, passe um destino de
     * `scroll.destinations`; no retorno/portal, chame sem argumento.
     *
     * @param destino Destino vindo de `scroll.destinations` (só na caça). Omita no retorno/portal.
     *
     * @example
     * ```js
     * const pergaminho = ctx.player.inventory.find(3437);
     * if (pergaminho?.scroll) {
     *   const pos = pergaminho.scroll.destinations.find((pos) => pos.name == 'Local do Guerreiro Amon');
     *   pergaminho.scroll.use(pos);
     * } else {
     *   throw new Error('Está sem pergaminho de caça Nipple');
     * }
     * ```
     */
    use(destino?: { x: number; y: number }): void;
  };
}

/** Uma peça visível de uma entidade: só id e nome. */
export interface ItemShort {
  /** Número (id) do item. */
  readonly itemId: number;
  /** Nome do item. Pode vir vazio no modelo do corpo de um monstro. */
  readonly name: string;
}

/** Um NPC, monstro ou outro jogador no mapa. */
export interface Entidade {
  /** Identificador da entidade. Vale só enquanto você está conectado: muda a cada novo login. */
  readonly index: number;
  /** Nome da entidade. */
  readonly name: string;
  /** Posição da entidade no mapa atual, em tiles (`x`, `y`). */
  readonly position: Readonly<{ x: number; y: number }>;

  /**
   * O visual da entidade: o modelo do corpo e as peças que ela usa. Os slots
   * são os mesmos de `ctx.player.equipment`.
   */
  readonly appearance: {
    /** Modelo do corpo (que tipo de criatura ou NPC é). */
    readonly body: ItemShort | null;
    /** Capacete à vista. */
    readonly helmet: ItemShort | null;
    /** Peitoral à vista. */
    readonly armor: ItemShort | null;
    /** Calça à vista. */
    readonly pants: ItemShort | null;
    /** Luvas à vista. */
    readonly gloves: ItemShort | null;
    /** Botas à vista. */
    readonly boots: ItemShort | null;
    /** Arma à vista. */
    readonly weapon: ItemShort | null;
    /** Mão secundária à vista. */
    readonly offhand: ItemShort | null;
    /** Brinco à vista. */
    readonly earring: ItemShort | null;
    /** Especial 2 à vista. */
    readonly special2: ItemShort | null;
    /** Especial 1 à vista. */
    readonly special1: ItemShort | null;
    /** Especial 3 à vista. */
    readonly special3: ItemShort | null;
    /** Traje à vista. */
    readonly costume: ItemShort | null;
    /** Fada à vista. */
    readonly fairy: ItemShort | null;
    /** Montaria à vista. */
    readonly mount: ItemShort | null;
    /** Capa à vista. */
    readonly cape: ItemShort | null;
  };

  /**
   * Se a entidade está a até `tiles` passos do personagem.
   *
   * @param tiles Distância máxima, em tiles (passos).
   *
   * @example
   * ```js
   * const lan = ctx.npcs.find((n) => n.name === 'LAN A');
   * if (lan?.isWithin(5)) ctx.macro.goToMarker('ENTER_LAN');
   * ```
   */
  isWithin(tiles: number): boolean;
}

/**
 * O objeto `ctx` que seu macro usa para ler o jogo e tomar decisões.
 *
 * Leituras de `player`, `npcs`, `monsters` e `otherPlayers` são sempre
 * atualizadas: cada acesso traz o estado do jogo naquele instante.
 */
export interface ScriptCtx {
  /** Estado do seu personagem. */
  readonly player: {
    /** HP atual. */
    readonly hp: number;
    /** HP máximo. */
    readonly maxHp: number;
    /** MP atual. */
    readonly mp: number;
    /** MP máximo. */
    readonly maxMp: number;
    /** Posição do personagem no mapa atual, em tiles (`x`, `y`). */
    readonly position: Readonly<{ x: number; y: number }>;
    /** Velocidade de movimento, de `1` a `7`. */
    readonly speed: number;

    /**
     * Distância do personagem até o ponto `(x, y)`, em tiles.
     *
     * @param x Coordenada X do ponto, em tiles.
     * @param y Coordenada Y do ponto, em tiles.
     *
     * @example
     * ```js
     * if (ctx.player.distanceToPos(2100, 2105) <= 5) {
     *   ctx.macro.goToMarker('NEAR_FOUNTAIN');
     * }
     * ```
     */
    distanceToPos(x: number, y: number): number;

    /** Montaria equipada. */
    readonly mount: {
      /** Se há montaria equipada. */
      readonly equipped: boolean;
      /** ID da montaria equipada. */
      readonly itemId: number;
      /** HP atual da montaria. */
      readonly hp: number;
      /** HP máximo da montaria. */
      readonly maxHp: number;
      /** Nível da montaria. */
      readonly level: number;
      /** Vitalidade da montaria. */
      readonly vitality: number;
      /** Ração restante da montaria. */
      readonly feed: number;
      /** Nível de qualidade da montaria. */
      readonly qualityLevel: number;
    };

    /** Equipamentos do personagem, separados por slot. */
    readonly equipment: {
      /** Capacete. */
      readonly helmet: Item | null;
      /** Peitoral. */
      readonly armor: Item | null;
      /** Calça. */
      readonly pants: Item | null;
      /** Luvas. */
      readonly gloves: Item | null;
      /** Botas. */
      readonly boots: Item | null;
      /** Arma. */
      readonly weapon: Item | null;
      /** Mão secundária. */
      readonly offhand: Item | null;
      /** Brinco. */
      readonly earring: Item | null;
      /** Especial 2. */
      readonly special2: Item | null;
      /** Especial 1. */
      readonly special1: Item | null;
      /** Especial 3. */
      readonly special3: Item | null;
      /** Traje. */
      readonly costume: Item | null;
      /** Fada. */
      readonly fairy: Item | null;
      /** Montaria. */
      readonly mount: Item | null;
      /** Capa. */
      readonly cape: Item | null;
      /** Colar. */
      readonly necklace: Item | null;
      /** Cinto. */
      readonly belt: Item | null;
    };

    /**
     * A mochila do personagem, em **4 bolsas de 15 espaços** cada (60 no
     * total).
     *
     * ```js
     * if (!ctx.player.inventory.has(709)) ctx.macro.pause('sem poções');
     *
     * const total = ctx.player.inventory.count(709); // soma a quantidade em todas as bolsas
     * if (total < 50) ctx.macro.goToMarker('REFILL');
     *
     * const primeira = ctx.player.inventory.find(709);
     * if (primeira) ctx.log(`primeira poção: bolsa ${primeira.bag! + 1}, espaço ${primeira.slot + 1}`);
     *
     * const bolsa1 = ctx.player.inventory.bags[0].slots;
     * const ocupados = bolsa1.filter((espaco) => espaco !== null).length;
     * ctx.log(`Bolsa 1: ${ocupados}/15 ocupados`);
     *
     * if (ctx.player.inventory.isFull) ctx.macro.goToMarker('VENDER');
     * ```
     */
    readonly inventory: {
      /** As 4 bolsas do inventário, em ordem: `bags[0]` é a Bolsa 1, `bags[3]` é a Bolsa 4. */
      readonly bags: ReadonlyArray<{
        /** Número da bolsa (`0..3`, exibida como "Bolsa 1..4"). */
        readonly index: number;
        /** `true` quando a bolsa está bloqueada (ainda não liberada). Bolsas bloqueadas são ignoradas por `count`, `find`, `has`, `freeSlots` e `isFull`. */
        readonly locked: boolean;
        /** Os 15 espaços da bolsa; `null` é um espaço vazio. */
        readonly slots: ReadonlyArray<Item | null>;
      }>;
      /**
       * Quantidade total do item, somando as bolsas desbloqueadas (pilhas
       * contam pelo tamanho).
       *
       * @param itemId O número (id) do item que você quer contar.
       */
      count(itemId: number): number;
      /**
       * O primeiro `Item` com o id indicado, na ordem das bolsas.
       *
       * @param itemId O número (id) do item que você procura.
       */
      find(itemId: number): Item | null;
      /**
       * Se você tem o item.
       *
       * @param itemId O número (id) do item a verificar.
       */
      has(itemId: number): boolean;
      /** Espaços vazios nas bolsas desbloqueadas. */
      readonly freeSlots: number;
      /** Se a mochila está cheia. */
      readonly isFull: boolean;
    };
  };

  /** NPCs visíveis na sua tela. */
  readonly npcs: ReadonlyArray<Entidade>;
  /** Monstros perto do seu personagem (cerca de 6 tiles). */
  readonly monsters: ReadonlyArray<Entidade>;
  /** Outros jogadores perto do seu personagem (cerca de 6 tiles). */
  readonly otherPlayers: ReadonlyArray<Entidade>;

  /** Controles do próprio macro. O efeito só vale **depois** que o script termina de rodar, não na hora da chamada. */
  readonly macro: Readonly<{
    /**
     * Pausa o macro assim que o script terminar. O motivo aparece na barra de
     * status. Se você chamar mais de uma vez, vale a última.
     *
     * @param reason Texto curto para mostrar na tela (ex.: `"hp baixo"`).
     *
     * @example
     * ```js
     * if (ctx.player.hp < 100) ctx.macro.pause('hp baixo');
     * ```
     */
    pause(reason?: string): void;

    /**
     * Salta a execução para o marcador com o nome informado, assim que o
     * script terminar.
     *
     * @param name Nome exato do marcador (diferencia maiúsculas de minúsculas).
     *
     * @example
     * ```js
     * if (ctx.player.hp < 100) ctx.macro.goToMarker('SAFE_AREA');
     * ```
     */
    goToMarker(name: string): void;

    /** Controle do ataque automático do macro. */
    readonly attack: Readonly<{
      /**
       * Pausa o ataque automático na hora.
       *
       * @example
       * ```js
       * if (ctx.player.hp < 50) ctx.macro.attack.pause();
       * ```
       */
      pause(): void;

      /**
       * Liga de volta o ataque automático que foi pausado por `pause()`.
       * Não faz nada se o ataque estiver desligado na config.
       *
       * @example
       * ```js
       * if (ctx.player.hp > 500) ctx.macro.attack.start();
       * ```
       */
      start(): void;

      /**
       * Situação do ataque automático agora: `'running'` (atacando),
       * `'paused'` (pausado por script ou pelo macro) ou `'disabled'`
       * (desligado na config).
       *
       * @example
       * ```js
       * if (ctx.macro.attack.status() === 'running') ctx.log('caçando');
       * ```
       */
      status(): 'running' | 'paused' | 'disabled';
    }>;
  }>;

  /**
   * Memória compartilhada entre os scripts do macro: um script guarda um
   * valor aqui e outro script (ou o mesmo, numa volta seguinte) lê depois.
   * Os valores ficam guardados até o app fechar ou você limpar — sobrevivem
   * a pausa, à morte e à reconexão.
   *
   * @example
   * ```js
   * const voltas = (ctx.memory.get('voltas') ?? 0) + 1;
   * ctx.memory.set('voltas', voltas);
   * ctx.log(`Volta ${voltas} concluída`);
   * ```
   */
  readonly memory: Readonly<{
    /**
     * Lê o valor guardado na variável. Devolve `undefined` se ela nunca foi gravada.
     *
     * @param chave Nome da variável (texto).
     */
    get(chave: string): unknown;

    /**
     * Guarda um valor na variável, sobrescrevendo o valor anterior. Aceita
     * números, textos, verdadeiro/falso, listas e objetos simples.
     *
     * @param chave Nome da variável (texto).
     * @param valor Valor a guardar.
     *
     * @example
     * ```js
     * ctx.memory.set('ultimaCidade', 'Armia');
     * ctx.memory.set('chefesMortos', 0);
     * ```
     */
    set(chave: string, valor: unknown): void;

    /**
     * Apaga o valor guardado na variável.
     *
     * @param chave Nome da variável (texto).
     */
    delete(chave: string): void;
  }>;

  /**
   * Escreve uma linha no painel de logs do macro, com o prefixo `[script]`.
   *
   * @param message Texto a registrar (uma linha só).
   */
  log(message: string): void;

  /**
   * Mostra um aviso na tela e **pausa o macro** até você clicar em **Entendi**.
   * **Sempre use com `await`** — o script só continua depois do seu clique.
   *
   * @param message Texto a mostrar no aviso.
   *
   * @example
   * ```js
   * await ctx.alert('Chefe à vista! Confira o setup antes de seguir.');
   * ctx.macro.pause('revisar inventário');
   * ```
   */
  alert(message: string): Promise<void>;
}

export interface BuildCtxOptions {
  /** Override `ctx.log` sink. Default: `logMacro` (global feed). Test mode injects a local-only sink. */
  log?: (level: 'info' | 'error', message: string) => void;

  /** Hook for `ctx.macro.pause(reason)`. Default: noop. Engine wires `pauseMacro`; test mode appends a log line. */
  onPauseRequest?: (reason: string | undefined) => void;

  /** Hook for `ctx.macro.goToMarker(name)`. Default: noop. Engine resolves the marker and signals a jump via `StepResult.jumpTo`. */
  onGoToMarkerRequest?: (name: string) => void;

  /** Hook for `ctx.macro.attack.pause()`. Default: noop. Engine suspends the attack ambient module until `start()`/`stopMacro`. */
  onAttackPauseRequest?: () => void;

  /** Hook for `ctx.macro.attack.start()`. Default: noop. Engine resumes the attack module enabled by config. */
  onAttackStartRequest?: () => void;

  /** Hook for `ctx.macro.attack.status()`. Default: `'disabled'` (e.g. test mode without a running engine). */
  attackStatus?: () => 'running' | 'paused' | 'disabled';

  /** Hook for `item.scroll.use(destino)` on a hunt scroll. Default: noop. Engine resolves the scroll + runs the arm→0x373 sequence after the script. */
  onUseTeleportScrollRequest?: (
    item: { slot: number; bag: number; itemId: number },
    x: number,
    y: number,
  ) => void;

  /** Hook for `item.scroll.use()` on a return scroll. Default: noop. Engine runs the arm→0x373 (+0x20=0) sequence after the script. */
  onUseReturnScrollRequest?: (item: { slot: number; bag: number; itemId: number }) => void;

  /**
   * Hook for `item.use()` on a direct-use consumable (`useKind === 'direct'`).
   * Default: noop. Engine runs `gameApi.useItem` (0x373 Form A) after the script.
   */
  onUseItemRequest?: (item: { slot: number; bag: number; itemId: number }) => void;

  /**
   * Hook for `item.delete()` on an inventory item. Default: noop. Engine runs
   * `gameApi.itemDestroy` (game) after the script. Inventory-only
   * (equipment items never receive a `delete()` method, so this is never called
   * for an equipped item).
   */
  onDeleteItemRequest?: (item: { slot: number; bag: number; itemId: number }) => void;

  /** Hook for `ctx.alert(message)`. Resolves when the user accepts. Default: resolves immediately (e.g. test runs). */
  onAlertRequest?: (message: string) => Promise<void>;
}

/** Build `ctx` for the QuickJS guest. Property getters re-read Zustand on each access (live values). */
export const buildCtxHandle = (
  qctx: QuickJSAsyncContext,
  opts: BuildCtxOptions = {},
): QuickJSHandle => {
  const log = opts.log ?? logMacro;
  const onPauseRequest = opts.onPauseRequest ?? (() => {});
  const onGoToMarkerRequest = opts.onGoToMarkerRequest ?? (() => {});
  const onAttackPauseRequest = opts.onAttackPauseRequest ?? (() => {});
  const onAttackStartRequest = opts.onAttackStartRequest ?? (() => {});
  const attackStatus = opts.attackStatus ?? (() => 'disabled' as const);
  const onUseTeleportScrollRequest = opts.onUseTeleportScrollRequest ?? (() => {});
  const onUseReturnScrollRequest = opts.onUseReturnScrollRequest ?? (() => {});
  const onUseItemRequest = opts.onUseItemRequest ?? (() => {});
  const onDeleteItemRequest = opts.onDeleteItemRequest ?? (() => {});
  const onAlertRequest = opts.onAlertRequest ?? (() => Promise.resolve());
  // ── helper: define a number-valued getter on a handle ──
  // `defineProp.get` expects a host function `(this) => Handle`, NOT a handle —
  // wrapping with `newFunction` first leaves the property installed but
  // unreachable (returns undefined to the guest).
  const defineNumberGetter = (obj: QuickJSHandle, key: string, read: () => number): void => {
    qctx.defineProp(obj, key, {
      get: () => qctx.newNumber(read()),
      enumerable: true,
      configurable: false,
    });
  };

  // ── ctx.player (live getters) ──────────────────────────
  const playerHandle = qctx.newObject();
  defineNumberGetter(playerHandle, 'hp', () => usePlayerStore.getState().currentHp);
  defineNumberGetter(playerHandle, 'maxHp', () => usePlayerStore.getState().maxHp);
  defineNumberGetter(playerHandle, 'mp', () => usePlayerStore.getState().currentMp);
  defineNumberGetter(playerHandle, 'maxMp', () => usePlayerStore.getState().maxMp);
  defineNumberGetter(playerHandle, 'speed', () => usePlayerStore.getState().movementSpeed);

  qctx.defineProp(playerHandle, 'position', {
    get: () => {
      const { position } = usePlayerStore.getState();
      const obj = qctx.newObject();
      const xH = qctx.newNumber(position.x);
      qctx.setProp(obj, 'x', xH);
      xH.dispose();
      const yH = qctx.newNumber(position.y);
      qctx.setProp(obj, 'y', yH);
      yH.dispose();
      return obj;
    },
    enumerable: true,
    configurable: false,
  });

  const distanceToPosFn = qctx.newFunction('distanceToPos', (xH, yH) => {
    if (!xH || qctx.typeof(xH) !== 'number' || !yH || qctx.typeof(yH) !== 'number') {
      log('error', '[script] player.distanceToPos: x e y devem ser numbers');
      return qctx.newNumber(Infinity);
    }
    const tx = qctx.getNumber(xH);
    const ty = qctx.getNumber(yH);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      log('error', '[script] player.distanceToPos: x e y devem ser finitos');
      return qctx.newNumber(Infinity);
    }
    const playerPos = usePlayerStore.getState().position;
    return qctx.newNumber(chebyshev(playerPos, { x: tx, y: ty }));
  });
  qctx.setProp(playerHandle, 'distanceToPos', distanceToPosFn);
  distanceToPosFn.dispose();

  // ── ctx.player.mount (live getters from usePlayerStore.mount) ──────────
  qctx.defineProp(playerHandle, 'mount', {
    get: () => {
      const m = usePlayerStore.getState().mount;
      const obj = qctx.newObject();
      const equippedH = m.equipped ? qctx.true : qctx.false;
      qctx.setProp(obj, 'equipped', equippedH);
      const setNum = (key: string, v: number): void => {
        const h = qctx.newNumber(v);
        qctx.setProp(obj, key, h);
        h.dispose();
      };
      setNum('itemId', m.itemId);
      setNum('hp', m.hp);
      setNum('maxHp', m.maxHp);
      setNum('level', m.level);
      setNum('vitality', m.vitality);
      setNum('feed', m.feed);
      setNum('qualityLevel', m.qualityLevel);
      return obj;
    },
    enumerable: true,
    configurable: false,
  });

  // ── ctx.player.equipment / .inventory (Item projections) ────────
  // Returned handle is owned by caller — must dispose unless it's `qctx.null`.
  const buildScriptItemHandle = (
    view: ViewItem | undefined,
    slot: number,
    bag?: number,
  ): QuickJSHandle => {
    const item = marshalViewItemToScript(view, slot, bag);
    if (!item) return qctx.null;
    const obj = qctx.newObject();
    const setNum = (key: string, v: number): void => {
      const h = qctx.newNumber(v);
      qctx.setProp(obj, key, h);
      h.dispose();
    };
    const setStr = (key: string, v: string): void => {
      const h = qctx.newString(v);
      qctx.setProp(obj, key, h);
      h.dispose();
    };
    setNum('slot', item.slot);
    if (item.bag !== undefined) setNum('bag', item.bag);
    setNum('itemId', item.itemId);
    setStr('name', item.name);
    setStr('useKind', USE_KIND_LABEL[item.useKind]);
    if (item.refineLevel !== undefined) setNum('refineLevel', item.refineLevel);
    if (item.stackCount !== undefined) setNum('stackCount', item.stackCount);
    if (item.immovable !== undefined) setNum('immovable', item.immovable);

    // Scrolls only (menu or channel): a single `scroll` object — the destination
    // list (empty for a channel scroll) + the unified deferred `use` method.
    if (item.scroll) {
      const { kind, destinations } = item.scroll;

      const destsArr = qctx.newArray();
      destinations.forEach((d, i) => {
        const dObj = qctx.newObject();
        const nameH = qctx.newString(d.name);
        qctx.setProp(dObj, 'name', nameH);
        nameH.dispose();
        const xH = qctx.newNumber(d.x);
        qctx.setProp(dObj, 'x', xH);
        xH.dispose();
        const yH = qctx.newNumber(d.y);
        qctx.setProp(dObj, 'y', yH);
        yH.dispose();
        qctx.setProp(destsArr, String(i), dObj);
        dObj.dispose();
      });
      const scrollObj = qctx.newObject();
      qctx.setProp(scrollObj, 'destinations', destsArr);
      destsArr.dispose();

      const target = { slot: item.slot, bag: item.bag ?? 0, itemId: item.itemId };
      const useFn = qctx.newFunction('use', (destH) => {
        // Channel scroll (return/portal): no destination — the server picks the point.
        if (kind === 'channel') {
          onUseReturnScrollRequest(target);
          return qctx.undefined;
        }
        // Hunt scroll: needs a destination object (from `scroll.destinations`).
        const dest = destH ? qctx.dump(destH) : undefined;
        const isObj = !!dest && typeof dest === 'object';
        const x = isObj ? Number((dest as Record<string, unknown>).x) : NaN;
        const y = isObj ? Number((dest as Record<string, unknown>).y) : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          log('error', '[script] scroll.use: na caça, passe um destino de scroll.destinations');
          return qctx.undefined;
        }
        onUseTeleportScrollRequest(target, x, y);
        return qctx.undefined;
      });
      qctx.setProp(scrollObj, 'use', useFn);
      useFn.dispose();

      qctx.setProp(obj, 'scroll', scrollObj);
      scrollObj.dispose();
    }

    // Direct-use consumables only: top-level `item.use()` → deferred useItem.
    if (item.useKind === 'direct') {
      const target = { slot: item.slot, bag: item.bag ?? 0, itemId: item.itemId };
      const useFn = qctx.newFunction('use', () => {
        onUseItemRequest(target);
        return qctx.undefined;
      });
      qctx.setProp(obj, 'use', useFn);
      useFn.dispose();
    }

    // Inventory items only (never equipment): `item.delete()` → deferred
    // itemDestroy (game). Last call wins; fires after the script.
    if (item.bag !== undefined) {
      const target = { slot: item.slot, bag: item.bag, itemId: item.itemId };
      const deleteFn = qctx.newFunction('delete', () => {
        onDeleteItemRequest(target);
        return qctx.undefined;
      });
      qctx.setProp(obj, 'delete', deleteFn);
      deleteFn.dispose();
    }

    const statsArr = qctx.newArray();
    item.stats.forEach((s, i) => {
      const sObj = qctx.newObject();
      const idH = qctx.newString(s.id);
      qctx.setProp(sObj, 'id', idH);
      idH.dispose();
      const labelH = qctx.newString(s.label);
      qctx.setProp(sObj, 'label', labelH);
      labelH.dispose();
      const valH = qctx.newNumber(s.value);
      qctx.setProp(sObj, 'value', valH);
      valH.dispose();
      qctx.setProp(statsArr, String(i), sObj);
      sObj.dispose();
    });
    qctx.setProp(obj, 'stats', statsArr);
    statsArr.dispose();

    return obj;
  };

  // Skips `.dispose()` on `qctx.null` — it's a shared constant, never dispose.
  const setItemProp = (
    parent: QuickJSHandle,
    key: string,
    view: ViewItem | undefined,
    slot: number,
    bag?: number,
  ): void => {
    const h = buildScriptItemHandle(view, slot, bag);
    qctx.setProp(parent, key, h);
    if (h !== qctx.null) h.dispose();
  };

  qctx.defineProp(playerHandle, 'equipment', {
    get: () => {
      const eq = usePlayerStore.getState().equip;
      const obj = qctx.newObject();

      setItemProp(obj, 'helmet', eq[EQUIP_SLOT_HELMET], EQUIP_SLOT_HELMET);
      setItemProp(obj, 'armor', eq[EQUIP_SLOT_ARMOR], EQUIP_SLOT_ARMOR);
      setItemProp(obj, 'pants', eq[EQUIP_SLOT_PANTS], EQUIP_SLOT_PANTS);
      setItemProp(obj, 'gloves', eq[EQUIP_SLOT_GLOVES], EQUIP_SLOT_GLOVES);
      setItemProp(obj, 'boots', eq[EQUIP_SLOT_BOOTS], EQUIP_SLOT_BOOTS);
      setItemProp(obj, 'weapon', eq[EQUIP_SLOT_WEAPON], EQUIP_SLOT_WEAPON);
      setItemProp(obj, 'offhand', eq[EQUIP_SLOT_OFFHAND], EQUIP_SLOT_OFFHAND);
      setItemProp(obj, 'earring', eq[EQUIP_SLOT_RING], EQUIP_SLOT_RING);
      setItemProp(obj, 'special2', eq[EQUIP_SLOT_AMULET], EQUIP_SLOT_AMULET);
      setItemProp(obj, 'special1', eq[EQUIP_SLOT_ORB], EQUIP_SLOT_ORB);
      setItemProp(obj, 'special3', eq[EQUIP_SLOT_GEM], EQUIP_SLOT_GEM);
      setItemProp(obj, 'costume', eq[EQUIP_SLOT_MEDAL], EQUIP_SLOT_MEDAL);
      setItemProp(obj, 'fairy', eq[EQUIP_SLOT_SPECIAL], EQUIP_SLOT_SPECIAL);
      setItemProp(obj, 'mount', eq[EQUIP_SLOT_MOUNT], EQUIP_SLOT_MOUNT);
      setItemProp(obj, 'cape', eq[EQUIP_SLOT_CAPE], EQUIP_SLOT_CAPE);
      setItemProp(obj, 'necklace', eq[EQUIP_SLOT_INCONCLUSIVE_16], EQUIP_SLOT_INCONCLUSIVE_16);
      setItemProp(obj, 'belt', eq[EQUIP_SLOT_INCONCLUSIVE_17], EQUIP_SLOT_INCONCLUSIVE_17);

      return obj;
    },
    enumerable: true,
    configurable: false,
  });

  qctx.defineProp(playerHandle, 'inventory', {
    get: () => {
      const { inventory: inv, bagUnlock } = usePlayerStore.getState();
      const obj = qctx.newObject();

      const bagsArr = qctx.newArray();
      for (let bag = 0; bag < INVENTORY_BAG_COUNT; bag++) {
        const bagObj = qctx.newObject();
        const idxH = qctx.newNumber(bag);
        qctx.setProp(bagObj, 'index', idxH);
        idxH.dispose();
        qctx.setProp(bagObj, 'locked', isBagLocked(bag, bagUnlock) ? qctx.true : qctx.false);

        const slotsArr = qctx.newArray();
        for (let slot = 0; slot < INVENTORY_BAG_SIZE; slot++) {
          const globalIdx = bag * INVENTORY_BAG_SIZE + slot;
          setItemProp(slotsArr, String(slot), inv[globalIdx], slot, bag);
        }
        qctx.setProp(bagObj, 'slots', slotsArr);
        slotsArr.dispose();

        qctx.setProp(bagsArr, String(bag), bagObj);
        bagObj.dispose();
      }
      qctx.setProp(obj, 'bags', bagsArr);
      bagsArr.dispose();

      const freeH = qctx.newNumber(countFreeSlots(inv, bagUnlock));
      qctx.setProp(obj, 'freeSlots', freeH);
      freeH.dispose();
      qctx.setProp(obj, 'isFull', isInventoryFull(inv, bagUnlock) ? qctx.true : qctx.false);

      const readId = (idH: QuickJSHandle | undefined, fnName: string): number | null => {
        if (!idH || qctx.typeof(idH) !== 'number') {
          log('error', `[script] inventory.${fnName}: itemId deve ser number`);
          return null;
        }
        const id = qctx.getNumber(idH);
        if (!Number.isFinite(id)) return null;
        return id;
      };

      const countFn = qctx.newFunction('count', (idH) => {
        const id = readId(idH, 'count');
        if (id === null) return qctx.newNumber(0);
        const { inventory: live, bagUnlock: bu } = usePlayerStore.getState();
        return qctx.newNumber(countItem(live, bu, id));
      });
      qctx.setProp(obj, 'count', countFn);
      countFn.dispose();

      const findFn = qctx.newFunction('find', (idH) => {
        const id = readId(idH, 'find');
        if (id === null) return qctx.null;
        const { inventory: live, bagUnlock: bu } = usePlayerStore.getState();
        const entry = findItemEntry(live, bu, id);
        return entry ? buildScriptItemHandle(entry.item, entry.slot, entry.bag) : qctx.null;
      });
      qctx.setProp(obj, 'find', findFn);
      findFn.dispose();

      const hasFn = qctx.newFunction('has', (idH) => {
        const id = readId(idH, 'has');
        if (id === null) return qctx.false;
        const { inventory: live, bagUnlock: bu } = usePlayerStore.getState();
        return hasItem(live, bu, id) ? qctx.true : qctx.false;
      });
      qctx.setProp(obj, 'has', hasFn);
      hasFn.dispose();

      return obj;
    },
    enumerable: true,
    configurable: false,
  });

  // ── ctx.npcs / ctx.monsters / ctx.otherPlayers ──────────
  // Fresh array per access (getter pattern); shape mirrors BaseEntity.
  // Player position is snapshotted once per array access so that all entries
  // in the same `ctx.npcs[*]` evaluation use the same reference point.
  // NPCs use teleport-fresh only (no distance limit) — they are stationary,
  // non-combat entities that scripts need to discover from any range.
  // Monsters and other players use the action horizon (camera stand-in).
  const buildEntityArrayHandle = (category: EntityCategory): QuickJSHandle => {
    const playerPos = usePlayerStore.getState().position;
    const lastTeleportMs = usePlayerStore.getState().lastTeleportMs;
    const filtered = useGameStore.getState().entities.filter(
      (e) =>
        e.category === category &&
        (category === 'npc'
          ? isEntityPresent(e, lastTeleportMs)
          : isEntityActionable(e, {
              lastTeleportMs,
              playerPos,
              horizon: ACTION_HORIZON_DEFAULT,
            })),
    );
    const arrayHandle = qctx.newArray();
    filtered.forEach((entity, idx) => {
      const obj = qctx.newObject();

      const idxH = qctx.newNumber(entity.index);
      qctx.setProp(obj, 'index', idxH);
      idxH.dispose();

      const nameH = qctx.newString(entity.name);
      qctx.setProp(obj, 'name', nameH);
      nameH.dispose();

      const livePos = getEntityLivePosition(entity);
      const pos = qctx.newObject();
      const px = qctx.newNumber(livePos.x);
      qctx.setProp(pos, 'x', px);
      px.dispose();
      const py = qctx.newNumber(livePos.y);
      qctx.setProp(pos, 'y', py);
      py.dispose();
      qctx.setProp(obj, 'position', pos);
      pos.dispose();

      // appearance: visible-model ids → named slots (mirrors player.equipment).
      // Only monsters/NPCs carry the CreateMob equip snapshot.
      if (entity.category === 'monster' || entity.category === 'npc') {
        const ids = entity.equipModelIds;
        const ap = qctx.newObject();
        const setModelRef = (key: string, id: number | undefined): void => {
          if (!id) {
            qctx.setProp(ap, key, qctx.null);
            return;
          }
          const ref = qctx.newObject();
          const idH = qctx.newNumber(id);
          qctx.setProp(ref, 'itemId', idH);
          idH.dispose();
          const nameH = qctx.newString(getItem(id)?.name ?? '');
          qctx.setProp(ref, 'name', nameH);
          nameH.dispose();
          qctx.setProp(ap, key, ref);
          ref.dispose();
        };
        setModelRef('body', ids[EQUIP_SLOT_CLASS_TAG]);
        setModelRef('helmet', ids[EQUIP_SLOT_HELMET]);
        setModelRef('armor', ids[EQUIP_SLOT_ARMOR]);
        setModelRef('pants', ids[EQUIP_SLOT_PANTS]);
        setModelRef('gloves', ids[EQUIP_SLOT_GLOVES]);
        setModelRef('boots', ids[EQUIP_SLOT_BOOTS]);
        setModelRef('weapon', ids[EQUIP_SLOT_WEAPON]);
        setModelRef('offhand', ids[EQUIP_SLOT_OFFHAND]);
        setModelRef('earring', ids[EQUIP_SLOT_RING]);
        setModelRef('special2', ids[EQUIP_SLOT_AMULET]);
        setModelRef('special1', ids[EQUIP_SLOT_ORB]);
        setModelRef('special3', ids[EQUIP_SLOT_GEM]);
        setModelRef('costume', ids[EQUIP_SLOT_MEDAL]);
        setModelRef('fairy', ids[EQUIP_SLOT_SPECIAL]);
        setModelRef('mount', ids[EQUIP_SLOT_MOUNT]);
        setModelRef('cape', ids[EQUIP_SLOT_CAPE]);
        qctx.setProp(obj, 'appearance', ap);
        ap.dispose();
      }

      const entityPos = livePos;
      const isWithinFn = qctx.newFunction('isWithin', (tilesH) => {
        if (!tilesH || qctx.typeof(tilesH) !== 'number') {
          log('error', '[script] isWithin: tiles deve ser number');
          return qctx.false;
        }
        const tiles = qctx.getNumber(tilesH);
        if (!Number.isFinite(tiles) || tiles < 0) return qctx.false;
        return chebyshev(entityPos, playerPos) <= tiles ? qctx.true : qctx.false;
      });
      qctx.setProp(obj, 'isWithin', isWithinFn);
      isWithinFn.dispose();

      qctx.setProp(arrayHandle, String(idx), obj);
      obj.dispose();
    });
    return arrayHandle;
  };

  // ── ctx.macro.pause + ctx.macro.goToMarker (sync request, lazy effect) ──
  const macroHandle = qctx.newObject();
  const pauseFn = qctx.newFunction('pause', (reasonH) => {
    const reason =
      reasonH && qctx.typeof(reasonH) === 'string' ? qctx.getString(reasonH) : undefined;
    onPauseRequest(reason);
    return qctx.undefined;
  });
  qctx.setProp(macroHandle, 'pause', pauseFn);
  pauseFn.dispose();

  const goToMarkerFn = qctx.newFunction('goToMarker', (nameH) => {
    if (!nameH || qctx.typeof(nameH) !== 'string') {
      log('error', '[script] goToMarker: nome é obrigatório (string)');
      return qctx.undefined;
    }
    onGoToMarkerRequest(qctx.getString(nameH));
    return qctx.undefined;
  });
  qctx.setProp(macroHandle, 'goToMarker', goToMarkerFn);
  goToMarkerFn.dispose();

  // ── ctx.macro.attack.{pause,start,status} (sync, immediate effect) ──
  const attackHandle = qctx.newObject();
  const attackPauseFn = qctx.newFunction('pause', () => {
    onAttackPauseRequest();
    return qctx.undefined;
  });
  qctx.setProp(attackHandle, 'pause', attackPauseFn);
  attackPauseFn.dispose();

  const attackStartFn = qctx.newFunction('start', () => {
    onAttackStartRequest();
    return qctx.undefined;
  });
  qctx.setProp(attackHandle, 'start', attackStartFn);
  attackStartFn.dispose();

  const attackStatusFn = qctx.newFunction('status', () => {
    return qctx.newString(attackStatus());
  });
  qctx.setProp(attackHandle, 'status', attackStatusFn);
  attackStatusFn.dispose();

  qctx.setProp(macroHandle, 'attack', attackHandle);
  attackHandle.dispose();

  // ── ctx.memory.{get,set,delete} (session-wide store) ──
  // Marshals a JSON-serializable host value into a guest handle. May return
  // the shared constants qctx.true/false/null — use disposeJsonHandle below.
  const newJsonHandle = (value: MemoryValue): QuickJSHandle => {
    if (value === null) return qctx.null;
    if (typeof value === 'number') return qctx.newNumber(value);
    if (typeof value === 'string') return qctx.newString(value);
    if (typeof value === 'boolean') return value ? qctx.true : qctx.false;
    if (Array.isArray(value)) {
      const arr = qctx.newArray();
      value.forEach((entry, i) => {
        const h = newJsonHandle(entry);
        qctx.setProp(arr, String(i), h);
        disposeJsonHandle(h);
      });
      return arr;
    }
    const obj = qctx.newObject();
    for (const [k, v] of Object.entries(value)) {
      const h = newJsonHandle(v);
      qctx.setProp(obj, k, h);
      disposeJsonHandle(h);
    }
    return obj;
  };
  // Disposing qctx.true/false/null corrupts the shared runtime constants —
  // newJsonHandle may return them for boolean/null values.
  const disposeJsonHandle = (h: QuickJSHandle): void => {
    if (h !== qctx.true && h !== qctx.false && h !== qctx.null) h.dispose();
  };

  const readMemoryKey = (keyH: QuickJSHandle | undefined, fnName: string): string | null => {
    if (!keyH || qctx.typeof(keyH) !== 'string') {
      log('error', `[script] memory.${fnName}: chave deve ser string`);
      return null;
    }
    return qctx.getString(keyH);
  };

  const memoryHandle = qctx.newObject();

  const memoryGetFn = qctx.newFunction('get', (keyH) => {
    const key = readMemoryKey(keyH, 'get');
    if (key === null) return qctx.undefined;
    const value = getMemoryValue(key);
    if (value === undefined) return qctx.undefined;
    return newJsonHandle(value);
  });
  qctx.setProp(memoryHandle, 'get', memoryGetFn);
  memoryGetFn.dispose();

  const memorySetFn = qctx.newFunction('set', (keyH, valueH) => {
    const key = readMemoryKey(keyH, 'set');
    if (key === null) return qctx.undefined;
    const rejectInvalidValue = (): QuickJSHandle => {
      log(
        'error',
        '[script] memory.set: aceita só números, textos, verdadeiro/falso, listas e objetos simples',
      );
      return qctx.undefined;
    };
    // Reject before dump: qctx.dump converts a guest function to its source
    // STRING, which would otherwise slip past isMemoryValue.
    const valueType = valueH ? qctx.typeof(valueH) : 'undefined';
    if (valueType === 'function' || valueType === 'symbol') return rejectInvalidValue();
    const dumped: unknown = valueH ? qctx.dump(valueH) : undefined;
    // qctx.dump JSON-stringifies guest objects natively and, when that fails
    // (circular reference), falls back to the raw STRING form — so a string
    // result for an object-typed handle means the value was not serializable.
    if (dumped !== null && valueType === 'object' && typeof dumped !== 'object') {
      log('error', '[script] memory.set: valor inválido (referência circular)');
      return qctx.undefined;
    }
    if (!isMemoryValue(dumped)) return rejectInvalidValue();
    setMemoryValue(key, dumped);
    return qctx.undefined;
  });
  qctx.setProp(memoryHandle, 'set', memorySetFn);
  memorySetFn.dispose();

  const memoryDeleteFn = qctx.newFunction('delete', (keyH) => {
    const key = readMemoryKey(keyH, 'delete');
    if (key === null) return qctx.undefined;
    deleteMemoryValue(key);
    return qctx.undefined;
  });
  qctx.setProp(memoryHandle, 'delete', memoryDeleteFn);
  memoryDeleteFn.dispose();

  // ── ctx.log (sync) ─────────────────────────────────────
  const logFn = qctx.newFunction('log', (msgH) => {
    const msg = qctx.getString(msgH);
    log('info', `[script] ${msg}`);
    return qctx.undefined;
  });

  // ── ctx.alert (async — suspends the guest until the user accepts) ──
  const alertFn = qctx.newFunction('alert', (msgH) => {
    const message = msgH && qctx.typeof(msgH) === 'string' ? qctx.getString(msgH) : '';
    const deferred = qctx.newPromise(onAlertRequest(message).then(() => qctx.undefined));
    void deferred.settled.then(() => qctx.runtime.executePendingJobs());
    return deferred.handle;
  });

  // ── assemble ctx object ────────────────────────────────
  const ctxObj = qctx.newObject();
  qctx.setProp(ctxObj, 'player', playerHandle);
  playerHandle.dispose();
  qctx.defineProp(ctxObj, 'npcs', {
    get: () => buildEntityArrayHandle('npc'),
    enumerable: true,
    configurable: false,
  });
  qctx.defineProp(ctxObj, 'monsters', {
    get: () => buildEntityArrayHandle('monster'),
    enumerable: true,
    configurable: false,
  });
  qctx.defineProp(ctxObj, 'otherPlayers', {
    get: () => buildEntityArrayHandle('player_other'),
    enumerable: true,
    configurable: false,
  });
  qctx.setProp(ctxObj, 'macro', macroHandle);
  macroHandle.dispose();
  qctx.setProp(ctxObj, 'memory', memoryHandle);
  memoryHandle.dispose();
  qctx.setProp(ctxObj, 'log', logFn);
  logFn.dispose();
  qctx.setProp(ctxObj, 'alert', alertFn);
  alertFn.dispose();

  return ctxObj;
};

/** Default source for new script steps. */
export const DEFAULT_SCRIPT_SOURCE = `if (ctx.player.hp < 100) {
  ctx.macro.pause('hp baixo');
}
`;

// `SCRIPT_CTX_DTS` é gerado a partir da interface `ScriptCtx` acima pelo
// plugin Vite `tools/vite-plugins/script-ctx-codegen.ts`. O re-export abaixo
// preserva o ponto de import existente (Monaco em `ScriptEditor.tsx`).
// Veja ``.
export { SCRIPT_CTX_DTS } from './script-ctx-dts.generated';
