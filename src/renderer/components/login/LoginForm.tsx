import { type FC, type FormEvent, type ReactNode, useState } from 'react';
import { Field, Label } from '@headlessui/react';
import { Button } from '../shared/Button';
import { TextInput } from '../shared/TextInput';
import { CTA_CLASS, CTA_SHADOW } from './auth-cta';

interface LoginFormProps {
  onSubmit: (username: string, password: string) => void;
  advancedOptions?: ReactNode;
  errors?: {
    username?: string;
    password?: string;
  };
  onFieldChange?: (field: 'username' | 'password') => void;
  /** Shows the in-button spinner + "Conectando…" label while connecting. */
  busy?: boolean;
}

export const LoginForm: FC<LoginFormProps> = ({
  onSubmit,
  advancedOptions,
  errors = {},
  onFieldChange,
  busy = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[15px]">
      <Field className="flex flex-col gap-[5px]">
        <Label htmlFor="login-username" className="block text-xs font-medium text-gray-400">
          Nome de usuário
        </Label>
        <TextInput
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            onFieldChange?.('username');
          }}
          disabled={busy}
          required
          maxLength={15}
          autoComplete="username"
          className="w-full"
          placeholder="Usuário"
          aria-invalid={Boolean(errors.username)}
          aria-describedby={errors.username ? 'login-username-error' : undefined}
        />
        {errors.username && (
          <span id="login-username-error" className="text-[11px] text-red-400" role="alert">
            {errors.username}
          </span>
        )}
      </Field>

      <Field className="flex flex-col gap-[5px]">
        <Label htmlFor="login-password" className="block text-xs font-medium text-gray-400">
          Senha
        </Label>
        <TextInput
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            onFieldChange?.('password');
          }}
          disabled={busy}
          required
          maxLength={11}
          autoComplete="current-password"
          className="w-full"
          placeholder="Senha"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
        />
        {errors.password && (
          <span id="login-password-error" className="text-[11px] text-red-400" role="alert">
            {errors.password}
          </span>
        )}
      </Field>

      {advancedOptions}

      <Button
        type="submit"
        fullWidth
        busy={busy}
        className={`mt-[3px] ${CTA_CLASS}`}
        style={CTA_SHADOW}
      >
        {busy ? 'Conectando…' : 'Conectar'}
      </Button>
    </form>
  );
};
