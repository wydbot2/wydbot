import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BauDialog } from '@renderer/components/game/personagem/BauDialog';
import { usePlayerStore } from '@renderer/stores/player-store';
import type { ViewItem } from '@shared/types/item-types';

const makeItem = (index: number, name: string): ViewItem => ({
  index,
  name,
  displayName: name,
  effects: [],
});

const EMPTY_ITEM: ViewItem = { index: 0, name: '', displayName: '', effects: [] };

const emptyStorage = (): ViewItem[] => Array.from({ length: 120 }, () => EMPTY_ITEM);

const setStorage = (items: Partial<Record<number, ViewItem>>, bankGold = 0) => {
  const storage = emptyStorage();
  for (const [idx, item] of Object.entries(items)) {
    if (item) storage[Number(idx)] = item;
  }
  usePlayerStore.setState({ storage, bankGold });
};

describe('BauDialog', () => {
  beforeEach(() => {
    setStorage({});
  });

  it('renders 3 page tabs and 40 empty slots on page 1', () => {
    render(<BauDialog isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Página 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 3' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('slot vazio')).toHaveLength(40);
  });

  it('shows items of the active page and switches on tab click', () => {
    setStorage({
      0: makeItem(100, 'Poção P1'),
      40: makeItem(200, 'Poção P2'),
      80: makeItem(300, 'Poção P3'),
    });
    render(<BauDialog isOpen onClose={() => {}} />);

    expect(screen.getByRole('img', { name: 'Poção P1' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Poção P2' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(screen.getByRole('img', { name: 'Poção P2' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Poção P1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Página 3' }));
    expect(screen.getByRole('img', { name: 'Poção P3' })).toBeInTheDocument();
  });

  it('counts used slots across all pages in the footer', () => {
    setStorage({ 0: makeItem(1, 'A'), 41: makeItem(2, 'B'), 119: makeItem(3, 'C') });
    render(<BauDialog isOpen onClose={() => {}} />);
    expect(
      screen.getAllByText((_, el) => el?.textContent === 'Slots em uso3 / 120').length,
    ).toBeGreaterThan(0);
  });

  it('shows bankGold in the footer like the inventory', () => {
    setStorage({}, 123456);
    render(<BauDialog isOpen onClose={() => {}} />);
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('123.456')).toBeInTheDocument();
  });

  it('closes via the X button', () => {
    const onClose = vi.fn();
    render(<BauDialog isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a context menu on right-click (read-only)', () => {
    setStorage({ 0: makeItem(100, 'Poção P1') });
    render(<BauDialog isOpen onClose={() => {}} />);
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Poção P1' }));
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument();
  });
});
