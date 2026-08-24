import { type FC, useEffect } from 'react';
import { Toaster } from 'sonner';
import { LoginScreen } from './screens/LoginScreen';
import { CharListScreen } from './screens/CharListScreen';
import { MainGameScreen } from './screens/MainGameScreen';
import { ReconnectingScreen } from './screens/ReconnectingScreen';
import { ReconnectFailedScreen } from './screens/ReconnectFailedScreen';
import { SplashScreen } from './components/splash/SplashScreen';
import { GameMessageDialog } from './components/shared/GameMessageDialog';
import { MacroAlertDialog } from './components/shared/MacroAlertDialog';
import { SkillDivergenceDialog } from './components/shared/SkillDivergenceDialog';
import { ConfigErrorDialog } from './components/shared/ConfigErrorDialog';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useUIStore } from './stores/ui-store';
import { useIpcEventBridge } from './hooks/use-ipc-event-bridge';
import { useSplashController } from './hooks/use-splash-controller';
import { useSkillDivergenceWatch } from './hooks/use-skill-divergence-watch';
import { useMockPlayerHotkey } from './hooks/use-mock-player-hotkey';

export const App: FC = () => {
  useIpcEventBridge();
  useSplashController();
  useSkillDivergenceWatch();
  useMockPlayerHotkey();
  const currentScreen = useUIStore((s) => s.currentScreen);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'splash':
        return <SplashScreen />;
      case 'login':
        return <LoginScreen />;
      case 'charlist':
        return <CharListScreen />;
      case 'game':
        return <MainGameScreen />;
      case 'reconnecting':
        return <ReconnectingScreen />;
      case 'reconnect-failed':
        return <ReconnectFailedScreen />;
      default: {
        const _exhaustive: never = currentScreen;
        void _exhaustive;
        return <LoginScreen />;
      }
    }
  };

  return (
    <ErrorBoundary>
      {renderScreen()}
      <GameMessageDialog />
      <MacroAlertDialog />
      <SkillDivergenceDialog />
      <ConfigErrorDialog />
      <Toaster
        position="bottom-center"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm text-xs',
            error: 'border-red-800/50 bg-red-950/90 text-red-300',
            success: 'border-green-800/50 bg-green-950/90 text-green-300',
            warning: 'border-yellow-800/50 bg-yellow-950/90 text-yellow-300',
            info: 'border-gray-700 bg-gray-900/90 text-gray-300',
            description: 'opacity-70',
            actionButton:
              'shrink-0 cursor-pointer bg-transparent font-medium text-accent-400 hover:text-accent-300',
            closeButton: 'shrink-0 cursor-pointer opacity-60 hover:opacity-100',
          },
        }}
      />
    </ErrorBoundary>
  );
};
