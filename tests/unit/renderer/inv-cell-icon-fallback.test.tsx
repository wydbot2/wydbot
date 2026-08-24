import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InvCell } from '@renderer/components/game/personagem/InvCell';
import type { ViewItem } from '@shared/types/item-types';

const makeItem = (index: number, name: string): ViewItem => ({
  index,
  name,
  displayName: name,
  effects: [],
});

describe('InvCell icon fallback', () => {
  it('renders the wydicon img for a valid item id', () => {
    render(<InvCell item={makeItem(5224, 'Teleport Token')} />);
    const img = screen.getByRole('img', { name: 'Teleport Token' });
    expect(img).toHaveAttribute('src', 'wydicon://icons/05224.png');
    expect(screen.queryByText('Teleport Token')).not.toBeInTheDocument();
  });

  it('flips to the text fallback when the icon 404s (onError)', () => {
    render(<InvCell item={makeItem(5224, 'Teleport Token')} />);
    fireEvent.error(screen.getByRole('img', { name: 'Teleport Token' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Teleport Token')).toBeInTheDocument();
  });

  it('resets the failure when the item id changes', () => {
    const { rerender } = render(<InvCell item={makeItem(5224, 'Teleport Token')} />);
    fireEvent.error(screen.getByRole('img', { name: 'Teleport Token' }));
    rerender(<InvCell item={makeItem(699, 'Pergaminho do Teleporte')} />);
    expect(screen.getByRole('img', { name: 'Pergaminho do Teleporte' })).toHaveAttribute(
      'src',
      'wydicon://icons/00699.png',
    );
  });
});
