import { Disclosure, DisclosureButton, DisclosurePanel, Field, Label } from '@headlessui/react';
import { ArrowPathIcon, ChevronDownIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { Button } from '../shared/Button';
import { Switch } from '../shared/Switch';
import { TextInput } from '../shared/TextInput';
import { Tooltip } from '../shared/Tooltip';

export interface AdvancedConnectionSettings {
  useProxy: boolean;
  proxyListUrl: string;
  useRandomMac: boolean;
  identitySeed: string;
  randomMac: string;
}

interface AdvancedConnectionOptionsProps {
  value: AdvancedConnectionSettings;
  onChange: (next: AdvancedConnectionSettings) => void;
  proxyUrlError?: string | null;
  disabled?: boolean;
  onRegenerateMac: () => void;
}

interface HelpTooltipProps {
  label: string;
  content: string;
}

const HelpTooltip = ({ label, content }: HelpTooltipProps) => (
  <Tooltip
    content={<span className="block px-3 py-2 text-xs leading-relaxed">{content}</span>}
    placement="top"
    chrome="glass"
  >
    <Button
      type="button"
      variant="ghost-muted"
      size="icon-xs"
      aria-label={label}
      className="h-5 w-5"
      icon={<InformationCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />}
    />
  </Tooltip>
);

export const AdvancedConnectionOptions = ({
  value,
  onChange,
  proxyUrlError,
  disabled = false,
  onRegenerateMac,
}: AdvancedConnectionOptionsProps) => {
  const update = (patch: Partial<AdvancedConnectionSettings>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <Disclosure as="section" className="border-y border-gray-700">
      <DisclosureButton className="group flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 text-left text-xs font-medium text-gray-400 transition-colors focus:outline-none data-[hover]:text-gray-100">
        <span>Opções avançadas</span>
        <ChevronDownIcon
          className="h-4 w-4 transition-transform group-data-[open]:rotate-180"
          aria-hidden="true"
        />
      </DisclosureButton>

      <DisclosurePanel className="pb-3">
        <div className="py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <strong className="text-sm font-medium text-gray-100">Usar proxy</strong>
                <HelpTooltip
                  label="Sobre o uso de proxy"
                  content="Mede a latência entre seu computador e cada proxy SOCKS5. Depois, o proxy abre o túnel TCP até o servidor do jogo."
                />
              </div>
            </div>
            <Switch
              checked={value.useProxy}
              onChange={(useProxy) => update({ useProxy })}
              disabled={disabled}
              aria-label="Usar proxy"
            />
          </div>

          {value.useProxy && (
            <Field className="mt-3 flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-400">URL da lista</Label>
              <TextInput
                type="url"
                value={value.proxyListUrl}
                onChange={(event) => update({ proxyListUrl: event.target.value })}
                disabled={disabled}
                placeholder="https://exemplo.com/proxies.txt"
                autoComplete="off"
                className="w-full font-mono"
                aria-invalid={Boolean(proxyUrlError)}
                aria-describedby="proxy-url-hint proxy-url-error"
              />
              <span id="proxy-url-hint" className="text-[10px] text-gray-500">
                SOCKS5 · aceita socks5://IP:PORT ou IP:PORT · um por linha
              </span>
              <span id="proxy-url-error" className="min-h-4 text-[11px] text-red-400" role="alert">
                {proxyUrlError}
              </span>
            </Field>
          )}
        </div>

        <div className="border-t border-gray-700/60 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <strong className="text-sm font-medium text-gray-100">Usar MAC aleatório</strong>
                <HelpTooltip
                  label="Sobre o MAC aleatório"
                  content="Deriva um MAC local a partir do MAC real e de um GUID aleatório. O adaptador do computador não é alterado."
                />
              </div>
            </div>
            <Switch
              checked={value.useRandomMac}
              onChange={(useRandomMac) => update({ useRandomMac })}
              disabled={disabled}
              aria-label="Usar MAC aleatório"
            />
          </div>

          {value.useRandomMac && (
            <div
              className="mt-3 flex min-h-9 items-center gap-2 rounded-md border border-gray-600/60 bg-gray-950/30 py-0.5 pr-0.5 pl-2.5"
              aria-live="polite"
            >
              <code className="flex-1 font-mono text-xs text-gray-400 tabular-nums">
                {value.randomMac}
              </code>
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-sm"
                className="h-8 w-8"
                onClick={onRegenerateMac}
                disabled={disabled}
                aria-label="Gerar outro MAC"
                icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
              />
            </div>
          )}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
};
