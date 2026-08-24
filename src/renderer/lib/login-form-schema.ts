import { z } from 'zod';
import type { ServerChannel } from '@shared/constants/server-channels';
import { ProxyListUrlSchema } from '@shared/proxy-config';

const ServerChannelSchema: z.ZodType<ServerChannel> = z.object({
  name: z.string().trim().min(1),
  ip: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
});

const SelectedChannelSchema = ServerChannelSchema.nullable()
  .refine((channel) => channel !== null, { message: 'Selecione um canal.' })
  .transform((channel) => channel as ServerChannel);

export const UsernameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome de usuário.')
  .max(15, 'O nome de usuário deve ter no máximo 15 caracteres.');

export const PasswordSchema = z
  .string()
  .min(1, 'Informe a senha.')
  .max(11, 'A senha deve ter no máximo 11 caracteres.');

export const NumericPasswordSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'A senha numérica deve ter de 4 a 6 dígitos.');

export const LoginCredentialsSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  token: NumericPasswordSchema,
});

const LoginFormBaseSchema = LoginCredentialsSchema.extend({
  channel: SelectedChannelSchema,
});

const ProxySettingsSchema = z.discriminatedUnion('useProxy', [
  z.object({
    useProxy: z.literal(false),
    proxyListUrl: z.string().transform((value) => value.trim()),
  }),
  z.object({
    useProxy: z.literal(true),
    proxyListUrl: ProxyListUrlSchema,
  }),
]);

const HardwareIdentitySettingsSchema = z.discriminatedUnion('useRandomMac', [
  z.object({
    useRandomMac: z.literal(false),
    identitySeed: z.string(),
  }),
  z.object({
    useRandomMac: z.literal(true),
    identitySeed: z.uuid('Não foi possível gerar a identidade da sessão.'),
  }),
]);

export const LoginFormSchema = LoginFormBaseSchema.and(ProxySettingsSchema).and(
  HardwareIdentitySettingsSchema,
);

export type LoginFormInput = z.input<typeof LoginFormSchema>;
