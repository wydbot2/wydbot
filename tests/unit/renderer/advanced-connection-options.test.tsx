import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  AdvancedConnectionOptions,
  type AdvancedConnectionSettings,
} from '@renderer/components/login/AdvancedConnectionOptions';
import { DEFAULT_PROXY_LIST_URL } from '@shared/proxy-config';

const INITIAL_SETTINGS: AdvancedConnectionSettings = {
  useProxy: false,
  proxyListUrl: DEFAULT_PROXY_LIST_URL,
  useRandomMac: false,
  identitySeed: 'b8b9e4f2-6f1a-4b2c-9b47-1c123456789a',
  randomMac: '02:00:00:00:00:01',
};

describe('AdvancedConnectionOptions', () => {
  it('reveals the controlled proxy and MAC fields using the glass help tooltip', async () => {
    const onRegenerateMac = vi.fn();

    const Harness = () => {
      const [value, setValue] = useState(INITIAL_SETTINGS);

      return (
        <AdvancedConnectionOptions
          value={value}
          onChange={setValue}
          onRegenerateMac={onRegenerateMac}
        />
      );
    };

    render(<Harness />);

    expect(screen.queryByRole('switch', { name: 'Usar proxy' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Opções avançadas' }));

    fireEvent.click(screen.getByRole('switch', { name: 'Usar proxy' }));
    expect(screen.getByRole('textbox', { name: 'URL da lista' })).toHaveValue(
      DEFAULT_PROXY_LIST_URL,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Usar MAC aleatório' }));
    expect(screen.getByText('02:00:00:00:00:01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sobre gerar outro MAC' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Gerar outro MAC$/ }));
    expect(onRegenerateMac).toHaveBeenCalledOnce();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Sobre o uso de proxy' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.firstElementChild).toHaveClass('backdrop-blur-sm');
  });
});
