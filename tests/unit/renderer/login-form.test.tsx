import { fireEvent, render, screen } from '@testing-library/react';
import { LoginForm } from '@renderer/components/login/LoginForm';

describe('LoginForm', () => {
  it('keeps the typed credentials after submitting so a rejected login can be corrected', () => {
    const onSubmit = vi.fn();

    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome de usuário' }), {
      target: { value: 'wrong-user' },
    });
    const password = screen.getByLabelText('Senha');
    fireEvent.change(password, { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));

    expect(onSubmit).toHaveBeenCalledWith('wrong-user', 'wrong-password');
    expect(screen.getByRole('textbox', { name: 'Nome de usuário' })).toHaveValue('wrong-user');
    expect(password).toHaveValue('wrong-password');
  });
});
