import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { setupAuthBridge } from '@renderer/bridges/auth-bridge';
import { useAuthStore } from '@renderer/stores/auth-store';
import { useConnectionStore } from '@renderer/stores/connection-store';
import { useUIStore } from '@renderer/stores/ui-store';

const gameApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  submitToken: vi.fn(),
}));

vi.mock('@renderer/lib/game-api', () => ({ gameApi: gameApiMock }));

vi.mock('@renderer/lib/reconnect-controller', () => ({
  isReconnectOwned: () => false,
  isReconnectSuppressingDisconnect: () => false,
  onLoginFailedDuringReconnect: vi.fn(),
  onReconnectConnectionError: () => false,
  onReconnectProxyConnected: vi.fn(),
  onReconnectSocketConnected: vi.fn(),
  onTokenAcceptedDuringReconnect: vi.fn(),
  onUnexpectedDisconnect: vi.fn(),
  shouldHandleDisconnect: () => false,
}));

vi.mock('@renderer/lib/strdef-lookup', () => ({
  getServerMessage: () => 'Senha incorreta.',
  isServerPopupSubtype: (subtype: number) => subtype === 0 || subtype === 4,
  resolveServerMessage: (code: number) => ({
    code,
    index: code + 1000,
    found: true,
    text: 'Senha incorreta.',
  }),
}));

type ConnectionCallback = Parameters<WydBotAPI['onConnectionStatus']>[0];
type LoginSuccessCallback = Parameters<WydBotAPI['onLoginSuccess']>[0];
type ServerMessageCallback = Parameters<WydBotAPI['onServerMessage']>[0];
type TokenResponseCallback = Parameters<WydBotAPI['onTokenResponse']>[0];

describe('setupAuthBridge login retry flow', () => {
  let onConnectionStatus: ConnectionCallback;
  let onLoginSuccess: LoginSuccessCallback;
  let onServerMessage: ServerMessageCallback;
  let onTokenResponse: TokenResponseCallback;

  beforeEach(() => {
    gameApiMock.login.mockReset();
    gameApiMock.submitToken.mockReset();
    useAuthStore.getState().reset();
    useConnectionStore.getState().reset();
    useUIStore.getState().reset();

    const unsubscribe = vi.fn();
    const api = {
      onProxyConnectionStatus: vi.fn(() => unsubscribe),
      onConnectionStatus: vi.fn((callback: ConnectionCallback) => {
        onConnectionStatus = callback;
        return unsubscribe;
      }),
      onLoginSuccess: vi.fn((callback: LoginSuccessCallback) => {
        onLoginSuccess = callback;
        return unsubscribe;
      }),
      onServerMessage: vi.fn((callback: ServerMessageCallback) => {
        onServerMessage = callback;
        return unsubscribe;
      }),
      onTokenResponse: vi.fn((callback: TokenResponseCallback) => {
        onTokenResponse = callback;
        return unsubscribe;
      }),
    } as unknown as WydBotAPI;

    setupAuthBridge(api);
  });

  it('preserves the translated rejection and pending credentials after the server closes', () => {
    useAuthStore.getState().setCredentials('wrong-user', 'wrong-password');
    useAuthStore.getState().setToken('123456');
    useUIStore.getState().setLoading(true);

    onConnectionStatus('connected');
    expect(gameApiMock.login).toHaveBeenCalledWith('wrong-user', 'wrong-password', null);
    expect(useAuthStore.getState().password).toBe('wrong-password');

    onServerMessage({ subtype: 0, code: 7 });
    onConnectionStatus('disconnected');

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'error',
      errorMessage: 'Senha incorreta.',
    });
    expect(useAuthStore.getState()).toMatchObject({
      username: 'wrong-user',
      password: 'wrong-password',
      token: '123456',
    });
    expect(useUIStore.getState()).toMatchObject({ currentScreen: 'login', isLoading: false });
  });

  it('keeps secrets pending until the full login is accepted', () => {
    useAuthStore.getState().setCredentials('user', 'password');
    useAuthStore.getState().setToken('123456');

    onConnectionStatus('connected');
    onLoginSuccess({
      selChar: {
        posX: [],
        posY: [],
        names: [],
        scores: [],
        equips: [],
        transformIds: [],
        guilds: [],
        coins: [],
        exps: [],
      },
      accName: 'user',
      cargo: [],
      cargoCoin: 0,
    });

    expect(gameApiMock.submitToken).toHaveBeenCalledWith('123456');
    expect(useAuthStore.getState()).toMatchObject({
      username: 'user',
      password: 'password',
      token: '123456',
    });

    onTokenResponse(true);
    expect(useAuthStore.getState()).toMatchObject({ username: '', password: '', token: '' });
  });

  it('shows an explicit error when the numeric password is rejected', () => {
    onTokenResponse(false);

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'error',
      errorMessage: 'Senha numérica incorreta.',
    });
  });
});
