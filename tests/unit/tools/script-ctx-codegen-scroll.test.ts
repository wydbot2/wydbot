/**
 * Codegen smoke test for the unified scroll Script API member.
 *
 * Extracts meta from the REAL src/renderer/lib/script-ctx.ts and asserts the
 * `Item` interface exposes ONE optional `scroll` member carrying `destinations`
 * data + a `use` method — and that the four old members (teleportScroll /
 * useTeleportScroll / returnScroll / useReturnScroll) are gone — so the Monaco
 * .dts and doc-site stay in sync with the source.
 */
import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractScriptCtxMeta } from '../../../tools/vite-plugins/script-ctx-codegen-extract';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('script-ctx codegen — unified scroll member', () => {
  const project = new Project({ useInMemoryFileSystem: false });
  const sf = project.addSourceFileAtPath(path.join(REPO_ROOT, 'src/renderer/lib/script-ctx.ts'));
  const meta = extractScriptCtxMeta(sf, 'script-ctx.ts');
  const item = meta.interfaces.find((i) => i.name === 'Item');

  it('exposes the Item interface', () => {
    expect(item).toBeDefined();
  });

  it('exposes a single optional `scroll` property and drops the four old members', () => {
    const member = item!.members.find((m) => m.name === 'scroll');
    expect(member).toBeDefined();
    expect(member!.kind).toBe('property');
    expect(member!.optional).toBe(true);

    const names = item!.members.map((m) => m.name);
    expect(names).not.toContain('teleportScroll');
    expect(names).not.toContain('useTeleportScroll');
    expect(names).not.toContain('returnScroll');
    expect(names).not.toContain('useReturnScroll');
  });

  it('scroll carries a `destinations` array of {name,x,y} + a `use(destino?)` method', () => {
    const member = item!.members.find((m) => m.name === 'scroll');
    expect(member).toBeDefined();
    if (!member || member.kind !== 'property') throw new Error('scroll must be a property');
    expect(member.type.kind).toBe('object');
    if (member.type.kind !== 'object') throw new Error('scroll type must be an object literal');

    // destinations: ReadonlyArray<{ name; x; y }> — pin the element shape so a field
    // add/rename on either the type or the marshal is caught at codegen time.
    const destinations = member.type.members.find((m) => m.name === 'destinations');
    if (!destinations || destinations.kind !== 'property') {
      throw new Error('destinations must be a property');
    }
    expect(destinations.type.kind).toBe('array');
    if (destinations.type.kind !== 'array') throw new Error('destinations must be an array');
    const element = destinations.type.element;
    expect(element.kind).toBe('object');
    if (element.kind !== 'object') throw new Error('destination element must be an object literal');
    expect(element.members.map((m) => m.name).sort()).toEqual(['name', 'x', 'y']);

    // use(destino?: { x: number; y: number }): void — guard the novel
    // inline-object-literal param path (optional, object with x/y).
    const use = member.type.members.find((m) => m.name === 'use');
    if (!use || use.kind !== 'method') throw new Error('use must be a method');
    expect(use.params).toHaveLength(1);
    const destino = use.params[0];
    expect(destino.optional).toBe(true);
    expect(destino.type.kind).toBe('object');
    if (destino.type.kind !== 'object') throw new Error('destino param must be an object literal');
    expect(destino.type.members.map((m) => m.name).sort()).toEqual(['x', 'y']);
  });
});

describe('script-ctx codegen — inventory lock-aware members', () => {
  // These live nested in ScriptCtx.player.inventory (not on a top-level interface),
  // so guard codegen drift by asserting the extracted meta carries the member names.
  const project = new Project({ useInMemoryFileSystem: false });
  const sf = project.addSourceFileAtPath(path.join(REPO_ROOT, 'src/renderer/lib/script-ctx.ts'));
  const json = JSON.stringify(extractScriptCtxMeta(sf, 'script-ctx.ts'));

  it('captures bags[].locked, inventory.freeSlots and inventory.isFull', () => {
    expect(json).toContain('freeSlots');
    expect(json).toContain('isFull');
    expect(json).toContain('locked');
  });
});
