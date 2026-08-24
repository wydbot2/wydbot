import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Protocol material validated for one installed asset revision.
 *
 * `assetVersion` follows every official data patch. `protocolVersion` advances
 * only when a client binary changes, so data-only patches do not masquerade as
 * wire-protocol updates.
 */
export const ProtocolCompatibilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    assetVersion: z.number().int().nonnegative(),
    protocolVersion: z.number().int().nonnegative(),
    accountClientVersion: z.number().int().min(0).max(0xffffffff),
    clineVersionBase: z.number().int().min(0).max(0xffff),
    keyTableVersion: z.number().int().positive(),
    keyTableSha256: Sha256Schema,
    versionDllSha256: Sha256Schema,
    wydExeSha256: Sha256Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.protocolVersion > value.assetVersion) {
      ctx.addIssue({
        code: 'custom',
        path: ['protocolVersion'],
        message: 'protocolVersion cannot be newer than assetVersion',
      });
    }
  });

export type ProtocolCompatibility = z.infer<typeof ProtocolCompatibilitySchema>;
