/**
 * Hunt-scroll ("Pedido de Caça") teleport catalog — static mirror of the
 * client's `Lang/<locale>/PotalPos.txt` (60 lines = 6 region blocks of 10).
 *
 * Each of the 6 scroll ids (`0xd68..0xd6d`) owns one contiguous 10-line block;
 * the **file order** of a block is the 1-based menu index the server resolves to
 * a destination tile (proven byte-exact: Kefra index 9 → `(2269, 3910)`). Names
 * repeat within a block (e.g. 5× "Horizon Cropper") differing only by coords, so
 * the **coordinate is the unique selector** — `name` is a display label only.
 *
 * Transcribed from `resources/PotalPos.txt` (); `_`→space normalized,
 * color token + `[Region]` sub-tag stripped. See
 *
 * This file is DATA ONLY — the "is this item a hunt scroll?" decision lives in
 * `item-use-kind.ts` (`itemUseKind`, cat `0xc3` + catalog membership). The catalog
 * keys are the gate because `0xc3` alone is NOT unique (unnamed id `0xdb4` also
 * has it); the canonical use funnel gates with `0xd67 < id < 0xd6e`.
 */

import { chebyshev } from '@shared/lib/movement-math';

/** One teleport destination: a named hunt spot at a world tile. */
export interface HuntScrollDestination {
  /** Display label (in-game spot name); not unique within a scroll. */
  readonly name: string;
  /** Destination tile X. */
  readonly x: number;
  /** Destination tile Y. */
  readonly y: number;
}

/**
 * Canonical delay between the `0x3AE` channel-arm and the `0x373` flush
 * in the ActionQueue; the renderer's echo timeout must exceed it.
 */
export const TELEPORT_SCROLL_CHANNEL_MS = 5000;

/**
 * `scrollItemId → destinations[10]`, in file order. The array index `i` maps to
 * the on-wire 1-based menu index `i + 1` (`0x373` body `+0x20`). Keys are the 6
 * hunt-scroll ids (`Pedido de Caça(...)`).
 */
export const HUNT_SCROLL_CATALOG: ReadonlyMap<number, readonly HuntScrollDestination[]> = new Map([
  [
    0xd68, // 3432 — Pedido de Caça (Armia/Azran)
    [
      { name: 'Cemitério', x: 2370, y: 2106 },
      { name: 'Local do Meio Orc', x: 2508, y: 2101 },
      { name: 'Local do Meio Orc', x: 2526, y: 2009 },
      { name: 'Local do Caçador Troll', x: 2529, y: 1882 },
      { name: 'Local do Orc Shaman', x: 2126, y: 1600 },
      { name: 'Local do Rei Taurus', x: 2005, y: 1617 },
      { name: 'Local do CiclopeSangr', x: 2241, y: 1474 },
      { name: 'Local do Ciclope Ancião', x: 1858, y: 1721 },
      { name: 'Local do Ciclope Ancião', x: 2250, y: 1316 },
      { name: 'Local do Ciclope Sangr', x: 1989, y: 1755 },
    ],
  ],
  [
    0xd69, // 3433 — Pedido de Caça (Dungeon)
    [
      { name: 'Local do Troll Zumbi', x: 290, y: 3799 },
      { name: 'Local do Cav. Caveira', x: 724, y: 3781 },
      { name: 'Local do Cav. Caveira', x: 481, y: 4062 },
      { name: 'Local do Golem', x: 876, y: 4058 },
      { name: 'Local do Golem de Fogo', x: 855, y: 3922 },
      { name: 'Local do Golem de Fogo', x: 808, y: 3876 },
      { name: 'Local do Golem de Fogo', x: 959, y: 3813 },
      { name: 'Local do Golem de Fogo', x: 926, y: 3750 },
      { name: 'Local do Dragon Lich', x: 1096, y: 3730 },
      { name: 'Local do Dragon Lich', x: 1132, y: 3800 },
    ],
  ],
  [
    0xd6a, // 3434 — Pedido de Caça (Submundo)
    [
      { name: 'Local do Aquagolem', x: 1242, y: 4035 },
      { name: 'Local do Aquagolem', x: 1264, y: 4017 },
      { name: 'Local do Aquagolem', x: 1333, y: 3994 },
      { name: 'Local do Cavaleiro ElfoNegro', x: 1358, y: 4041 },
      { name: 'Local do Cavaleiro ElfoNegro', x: 1462, y: 4033 },
      { name: 'Local do Chefe Zumbi', x: 1326, y: 3788 },
      { name: 'Local do Chefe Zumbi Troll', x: 1493, y: 3777 },
      { name: 'Local do Demo Gorgon', x: 1437, y: 3741 },
      { name: 'Local do Morlock', x: 1389, y: 3740 },
      { name: 'Local do Morlock', x: 1422, y: 3810 },
    ],
  ],
  [
    0xd6b, // 3435 — Pedido de Caça (Deserto Kult)
    [
      { name: 'Local do Verme do Freixo', x: 1376, y: 1722 },
      { name: 'Local do Verme do Freixo', x: 1426, y: 1686 },
      { name: 'Local do LugeferBroken', x: 1381, y: 1861 },
      { name: 'Local do LugeferBroken', x: 1326, y: 1896 },
      { name: 'Local do Assas. Taron', x: 1510, y: 1723 },
      { name: 'Local do Tauron', x: 1543, y: 1726 },
      { name: 'Local do Tauron', x: 1580, y: 1758 },
      { name: 'Local do Tauron', x: 1182, y: 1714 },
      { name: 'Local da Aranha Inferno', x: 1634, y: 1727 },
      { name: 'Local da Aranha Inferno', x: 1237, y: 1764 },
    ],
  ],
  [
    0xd6c, // 3436 — Pedido de Caça (Kefra)
    [
      { name: 'Local da Aranha Dourada', x: 2367, y: 4024 },
      { name: 'Local do Horizon Cropper', x: 2236, y: 4044 },
      { name: 'Local do Horizon Cropper', x: 2236, y: 3993 },
      { name: 'Local do Horizon Cropper', x: 2209, y: 3989 },
      { name: 'Local do Horizon Cropper', x: 2453, y: 4067 },
      { name: 'Local do Horizon Cropper', x: 2485, y: 4043 },
      { name: 'Local do Símio Bleg', x: 2534, y: 3897 },
      { name: 'Local do Símio Bleg', x: 2489, y: 3919 },
      { name: 'Local do Lich Batama', x: 2269, y: 3910 },
      { name: 'Local do Lich Crunt', x: 2202, y: 3866 },
    ],
  ],
  [
    0xd6d, // 3437 — Pedido de Caça (Nippleheim)
    [
      { name: 'Local do Urso Polar', x: 3664, y: 3024 },
      { name: 'Local do Troll Ártico', x: 3582, y: 3007 },
      { name: 'Local do Ent Ancião', x: 3514, y: 3008 },
      { name: 'Local do Soldado Amon', x: 3818, y: 2977 },
      { name: 'Local do Guerreiro Amon', x: 3517, y: 2889 },
      { name: 'Local do Chefe Amon', x: 3745, y: 2977 },
      { name: 'Local do Homem Kalintz', x: 3639, y: 2877 },
      { name: 'Local da Mulher Kalintz', x: 3650, y: 2727 },
      { name: 'Local da Vila Amaldiçoada', x: 3660, y: 2773 },
      { name: 'Local da Valquíria Rosen', x: 3746, y: 2879 },
    ],
  ],
]);

/** A resolved destination: the chosen catalog entry plus its 1-based wire index. */
export interface ResolvedHuntDestination {
  /** 1-based menu index written to `0x373 +0x20`. */
  readonly index: number;
  readonly destination: HuntScrollDestination;
}

/**
 * Snap `(x, y)` to the nearest destination of `scrollItemId` within `tolerance`
 * tiles (Chebyshev). Returns the entry + its 1-based wire index, or `null` when
 * the id has no catalog block or no destination is within tolerance. Ties keep
 * the lower (file-order) index — the same order the server resolves against.
 */
export const resolveHuntScrollDestination = (
  scrollItemId: number,
  x: number,
  y: number,
  tolerance = 3,
): ResolvedHuntDestination | null => {
  const destinations = HUNT_SCROLL_CATALOG.get(scrollItemId);
  if (!destinations) return null;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < destinations.length; i++) {
    const dist = chebyshev(destinations[i], { x, y });
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestDist > tolerance) return null;
  return { index: bestIdx + 1, destination: destinations[bestIdx] };
};
