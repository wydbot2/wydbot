import { type CSSProperties, type FC } from 'react';
import { CharacterGrid } from '../components/charlist/CharacterGrid';
import { Button } from '../components/shared/Button';
import { useCharlist } from '../hooks/use-charlist';

const FIELD_STYLE: CSSProperties = {
  background:
    'radial-gradient(110% 80% at 50% 22%, rgba(37,99,235,0.055), transparent 60%),' +
    'radial-gradient(140% 120% at 50% 120%, rgba(0,0,0,0.5), transparent 55%),' +
    'var(--color-field)',
};

const PANEL_STYLE: CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.015), transparent 35%), rgb(31 41 55 / 0.6)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 50px -28px rgba(0,0,0,0.7)',
};

export const CharListScreen: FC = () => {
  const charlist = useCharlist();

  if (!charlist.selChar) {
    return (
      <div className="grid min-h-screen place-items-center" style={FIELD_STYLE}>
        <p className="text-sm text-gray-400">Carregando personagens...</p>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-screen place-items-center px-8 py-10 select-none"
      style={FIELD_STYLE}
    >
      <div className="flex flex-col items-center gap-[18px]">
        <h1 className="text-center text-[18px] font-semibold whitespace-nowrap text-gray-100">
          Seleção de Personagem
        </h1>
        <div
          className="flex w-[460px] max-w-full flex-col gap-4 rounded-xl border border-gray-700 p-4"
          style={PANEL_STYLE}
        >
          <CharacterGrid
            selChar={charlist.selChar}
            selectedIndex={charlist.selectedIndex}
            onSelect={charlist.select}
          />
          <Button
            fullWidth
            onClick={charlist.enter}
            disabled={!charlist.hasSelection}
            aria-label="Entrar com personagem selecionado"
          >
            Entrar
          </Button>
        </div>
      </div>
    </div>
  );
};
