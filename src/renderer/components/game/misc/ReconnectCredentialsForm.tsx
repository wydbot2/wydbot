import { type FC } from 'react';
import { TokenInput } from '../../login/TokenInput';
import { TextInput } from '../../shared/TextInput';

const fieldLabelClass = 'mb-1 block text-[11px] font-medium tracking-wider text-gray-500 uppercase';

interface ReconnectCredentialsFormProps {
  username: string;
  password: string;
  token: string;
  disabled?: boolean;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onTokenChange: (token: string) => void;
}

/** Canal e personagem vêm da sessão atual (não editáveis aqui). */
export const ReconnectCredentialsForm: FC<ReconnectCredentialsFormProps> = ({
  username,
  password,
  token,
  disabled = false,
  onUsernameChange,
  onPasswordChange,
  onTokenChange,
}) => {
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-2">
      <div>
        <label className={fieldLabelClass} htmlFor="reconnect-username">
          Usuário
        </label>
        <TextInput
          id="reconnect-username"
          type="text"
          value={username}
          disabled={disabled}
          compact
          autoComplete="username"
          maxLength={15}
          className="w-full"
          placeholder="Usuário"
          onChange={(e) => onUsernameChange(e.target.value)}
        />
      </div>
      <div>
        <label className={fieldLabelClass} htmlFor="reconnect-password">
          Senha
        </label>
        <TextInput
          id="reconnect-password"
          type="password"
          value={password}
          disabled={disabled}
          compact
          autoComplete="current-password"
          maxLength={11}
          className="w-full"
          placeholder="Senha"
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
      <div>
        <label className={fieldLabelClass} htmlFor="reconnect-token">
          Senha numérica
        </label>
        <TokenInput
          id="reconnect-token"
          value={token}
          onChange={onTokenChange}
          compact
          showLabel={false}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
