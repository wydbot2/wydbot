import { type FC, useState, useEffect } from 'react';
import type { ServerChannel } from '@shared/constants/server-channels';
import { DEFAULT_PROXY_LIST_URL } from '@shared/proxy-config';
import {
  AdvancedConnectionOptions,
  type AdvancedConnectionSettings,
} from '../components/login/AdvancedConnectionOptions';
import { ServerSelector } from '../components/login/ServerSelector';
import { LoginForm } from '../components/login/LoginForm';
import { TokenInput } from '../components/login/TokenInput';
import { GateShell } from '../components/login/GateShell';
import { GateStatusFooter } from '../components/login/GateStatusFooter';
import { WarnIcon } from '../components/login/gate-icons';
import { useConnectionStore } from '../stores/connection-store';
import { useUIStore } from '../stores/ui-store';
import { useGameConnection } from '../hooks/use-game-connection';
import { getWydAPI } from '../lib/electron-api';
import { LoginFormSchema, type LoginFormInput } from '../lib/login-form-schema';
import { generateHardwareIdentitySeed } from '../lib/session-hardware-identity';

type LoginFormField = keyof LoginFormInput;
type LoginFormErrors = Partial<Record<LoginFormField, string>>;

const createInitialAdvancedSettings = (): AdvancedConnectionSettings => ({
  useProxy: false,
  proxyListUrl: DEFAULT_PROXY_LIST_URL,
  useRandomMac: false,
  identitySeed: generateHardwareIdentitySeed(),
  randomMac: 'Gerando…',
});

export const LoginScreen: FC = () => {
  const [servers, setServers] = useState<ServerChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ServerChannel | null>(null);
  const [token, setToken] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFormErrors>({});
  const [advancedSettings, setAdvancedSettings] = useState(createInitialAdvancedSettings);
  const status = useConnectionStore((connection) => connection.status);
  const connectionError = useConnectionStore((connection) => connection.errorMessage);
  const connectionDetail = useConnectionStore((connection) => connection.detailMessage);
  const isLoading = useUIStore((ui) => ui.isLoading);
  const { connect } = useGameConnection();

  const isConnecting = status === 'connecting' || isLoading;

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const api = getWydAPI();
        if (!api) {
          setLoadError('API do Electron indisponível (preload).');
          return;
        }
        // IPC errors from main often arrive as plain objects (not Error instances),
        // so instanceof Error is false and we must read .message manually.
        const channels = await api.loadServerlist();
        if (channels?.length) {
          setServers(channels);
          setLoadError(null);
        } else {
          setLoadError('serverlist.bin vazio ou sem canais.');
        }
      } catch (err) {
        console.error('[LoginScreen] loadServerlist failed', err);
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' &&
                err !== null &&
                'message' in err &&
                typeof (err as { message: unknown }).message === 'string'
              ? (err as { message: string }).message
              : String(err);
        // Prefix so it's obvious even when Electron serializes a vague Error.
        setLoadError(
          message
            ? `Falha ao carregar serverlist.bin: ${message}`
            : 'Falha ao carregar serverlist.bin',
        );
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!advancedSettings.useRandomMac) return;

    let cancelled = false;
    const identitySeed = advancedSettings.identitySeed;
    const loadPreview = async (): Promise<void> => {
      try {
        const api = getWydAPI();
        if (!api) throw new Error('API do Electron indisponível');
        const preview = await api.previewHardwareIdentity(identitySeed);
        if (cancelled) return;
        setAdvancedSettings((current) =>
          current.identitySeed === identitySeed ? { ...current, randomMac: preview.mac } : current,
        );
      } catch (err) {
        if (cancelled) return;
        console.error('[LoginScreen] hardware identity preview failed', err);
        setAdvancedSettings((current) =>
          current.identitySeed === identitySeed
            ? { ...current, randomMac: 'Indisponível' }
            : current,
        );
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [advancedSettings.identitySeed, advancedSettings.useRandomMac]);

  const clearFieldError = (field: LoginFormField): void => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const handleAdvancedSettingsChange = (next: AdvancedConnectionSettings): void => {
    if (!next.useProxy || next.proxyListUrl !== advancedSettings.proxyListUrl) {
      clearFieldError('proxyListUrl');
    }
    setAdvancedSettings(next);
  };

  const handleLogin = (username: string, password: string): void => {
    const validation = LoginFormSchema.safeParse({
      channel: selectedChannel,
      username,
      password,
      token,
      useProxy: advancedSettings.useProxy,
      proxyListUrl: advancedSettings.proxyListUrl,
      useRandomMac: advancedSettings.useRandomMac,
      identitySeed: advancedSettings.identitySeed,
    });

    if (!validation.success) {
      const nextErrors: LoginFormErrors = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as LoginFormField | undefined;
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setFieldErrors(nextErrors);
      setFormError(validation.error.issues[0]?.message ?? 'Revise os campos do login.');
      return;
    }

    const data = validation.data;
    setFormError(null);
    setFieldErrors({});
    setAdvancedSettings((current) => ({
      ...current,
      proxyListUrl: data.proxyListUrl,
    }));

    connect(
      data.channel,
      data.username,
      data.password,
      data.token,
      data.useRandomMac ? data.identitySeed : null,
      data.useProxy ? data.proxyListUrl : null,
    );
  };

  const footerError =
    formError ?? connectionError ?? (loadError ? 'falha ao carregar canais' : null);
  const footerState = isConnecting
    ? (connectionDetail ?? 'conectando')
    : (footerError ?? 'aguardando login');
  const footerTone = isConnecting ? 'accent' : footerError ? 'error' : 'neutral';

  return (
    <GateShell footer={<GateStatusFooter state={footerState} tone={footerTone} />}>
      <div className="flex w-full flex-col gap-[15px] pb-0.5">
        <div className="flex flex-col gap-1">
          <ServerSelector
            servers={servers}
            selected={selectedChannel}
            onChange={(channel) => {
              setSelectedChannel(channel);
              clearFieldError('channel');
            }}
            nameOnly
            disabled={isConnecting}
            invalid={Boolean(fieldErrors.channel)}
            errorId="login-channel-error"
          />
          {fieldErrors.channel && (
            <span id="login-channel-error" className="text-[11px] text-red-400" role="alert">
              {fieldErrors.channel}
            </span>
          )}
        </div>

        <TokenInput
          id="login-token"
          value={token}
          onChange={(value) => {
            setToken(value);
            clearFieldError('token');
          }}
          disabled={isConnecting}
          error={fieldErrors.token}
        />

        <LoginForm
          onSubmit={handleLogin}
          busy={isConnecting}
          errors={{ username: fieldErrors.username, password: fieldErrors.password }}
          onFieldChange={clearFieldError}
          advancedOptions={
            <AdvancedConnectionOptions
              value={advancedSettings}
              onChange={handleAdvancedSettingsChange}
              proxyUrlError={fieldErrors.proxyListUrl}
              disabled={isConnecting}
              onRegenerateMac={() => {
                setAdvancedSettings((current) => ({
                  ...current,
                  identitySeed: generateHardwareIdentitySeed(),
                  randomMac: 'Gerando…',
                }));
              }}
            />
          }
        />

        {loadError && (
          <p
            className="flex items-center justify-center gap-1.5 text-center text-xs text-red-400"
            role="alert"
          >
            <WarnIcon width={14} height={14} /> {loadError}
          </p>
        )}
      </div>
    </GateShell>
  );
};
