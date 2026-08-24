import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { FC } from 'react';
import { SCRIPT_CTX_DTS } from '../../lib/script-ctx';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Altura do editor — qualquer valor CSS válido. Default: `'200px'`. */
  height?: string;
  /** Modo readonly desliga edição mas mantém syntax highlighting. */
  readOnly?: boolean;
  className?: string;
}

/** Caminho virtual da declaration injetada — único por instância de Monaco. */
const CTX_DTS_VIRTUAL_PATH = 'ts:script-ctx.d.ts';

/**
 * Wrapper do Monaco Editor para autoria de scripts JS dos macros.
 *
 * Recursos:
 * - Syntax highlighting JS + tema dark
 * - Autocomplete tipado do `ctx` (player, mobs, api, log) via `SCRIPT_CTX_DTS`
 *   injetado em `javascriptDefaults.addExtraLib` no `onMount`
 * - Hover de tipo + erro de tipo para uso incorreto da API
 *
 * Por padrão `@monaco-editor/react` carrega o Monaco da CDN (jsdelivr).
 * Aceitável pra app desktop com internet na primeira carga; cache local
 * depois.
 */
export const ScriptEditor: FC<ScriptEditorProps> = ({
  value,
  onChange,
  height = '200px',
  readOnly = false,
  className,
}) => {
  const handleChange: OnChange = (next) => {
    onChange(next ?? '');
  };

  const handleMount: OnMount = (_editor, monaco) => {
    // Injeta declarations do `ctx` para autocomplete. Idempotente — Monaco
    // dedupa por virtual path. Múltiplas instâncias de `<ScriptEditor>`
    // compartilham o mesmo monaco singleton, então uma única chamada basta.
    //
    // Guard defensivo: se o language service de TS/JS não foi registrado
    // (típico de issue com bundling/setup), evitamos quebrar o editor
    // inteiro — só perdemos autocomplete. Erro vira warning no console.
    const ts = monaco.languages.typescript;
    if (!ts?.javascriptDefaults) {
      console.warn(
        '[ScriptEditor] monaco.languages.typescript não disponível — ' +
          'autocomplete do ctx desabilitado. Verifique src/renderer/lib/monaco-setup.ts',
      );
      return;
    }
    ts.javascriptDefaults.addExtraLib(SCRIPT_CTX_DTS, CTX_DTS_VIRTUAL_PATH);
  };

  return (
    <div className={className}>
      <Editor
        height={height}
        language="javascript"
        theme="vs-dark"
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
        }}
      />
    </div>
  );
};
