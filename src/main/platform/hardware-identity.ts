import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { createHash, createHmac } from 'crypto';
import * as os from 'os';
import { platformLogger } from '../logging';

const execFileAsync = promisify(execFile);

// Module-level cache — reset only on process restart, matching WYD.exe behaviour
let cachedGuidBytes: Buffer | null = null;
let cachedMacBytes: Buffer | null = null;
let cachedStableFingerprint: string | null = null;
let cachedBindingKey: string | null = null;

const SESSION_IDENTITY_DOMAIN = 'wydbot/session-hardware-identity/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LoginHardwareIdentity {
  adapterGuid: Buffer;
  mac: Buffer;
}

/**
 * Converts a GUID string to a 16-byte Buffer using WYD.exe's custom encoding.
 *
 * Algorithm (confirmed by RE of GetAdaptersInfo usage):
 *   1. Strip '{', '}', '-' → 32 hex chars
 *   2. Split into 4 chunks of 8 chars
 *   3. Each chunk → parseInt(chunk, 16) >>> 0  (uint32, big-endian read)
 *   4. Each uint32 → writeUInt32LE  (little-endian write)
 *
 * Example: {B8B9E4F2-6F1A-4B2C-9B47-1C123456789A}
 *   → stripped: B8B9E4F26F1A4B2C9B471C123456789A
 *   → chunks:   B8B9E4F2 | 6F1A4B2C | 9B471C12 | 3456789A
 *   → result:   F2 E4 B9 B8  2C 4B 1A 6F  12 1C 47 9B  9A 78 56 34
 */
export const parseGuidToBytes = (raw: string): Buffer => {
  const stripped = raw.replace(/[{}\-]/g, '');
  if (stripped.length < 32) {
    throw new Error(`GUID string too short after stripping: "${stripped}"`);
  }
  const buf = Buffer.allocUnsafe(16);
  for (let i = 0; i < 4; i++) {
    const chunk = stripped.slice(i * 8, i * 8 + 8);
    const val = parseInt(chunk, 16) >>> 0;
    buf.writeUInt32LE(val, i * 4);
  }
  return buf;
};

/** 8-char hex fingerprint from a GUID's WYD byte-encoding. */
export const fingerprintFromGuid = (raw: string): string =>
  createHash('sha256').update(parseGuidToBytes(raw)).digest('hex').slice(0, 8);

/**
 * Returns the first non-loopback, non-zero MAC address as a 6-byte Buffer.
 * Result is cached for the lifetime of the process.
 */
export const getMacBytes = (): Buffer => {
  if (cachedMacBytes) return cachedMacBytes;

  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        const bytes = addr.mac.split(':').map((h) => parseInt(h, 16));
        cachedMacBytes = Buffer.from(bytes.slice(0, 6));
        platformLogger.debug(`MAC: ${addr.mac}`);
        return cachedMacBytes;
      }
    }
  }

  cachedMacBytes = Buffer.alloc(6);
  platformLogger.warn('MAC: fallback (all zeros)');
  return cachedMacBytes;
};

const fetchGuidRaw = async (): Promise<string> => {
  if (process.platform === 'win32') {
    // Attempt 1: PowerShell Get-NetAdapter — output: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}\r\n
    // -ExecutionPolicy Bypass needed for restricted enterprise environments.
    // Empty stdout (no adapter Up) is treated as a miss, not an error.
    // windowsHide: true prevents a console window from flashing on screen.
    // Electron is a GUI process — without this flag, every execFile spawns a
    // visible black console window on the user's desktop.
    const winOpts = { windowsHide: true };

    try {
      const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const { stdout } = await execFileAsync(
        ps,
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden', // prevents PowerShell from allocating its own console window
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).InterfaceGuid",
        ],
        winOpts,
      );
      const guid = stdout.trim();
      if (guid) return guid;
    } catch {}

    // Attempt 2: reg query on Tcpip interfaces — works without PowerShell, immune to execution policy.
    // Subkeys are named by the NIC GUID: HKLM\...\Interfaces\{GUID}
    try {
      const { stdout } = await execFileAsync(
        'reg',
        ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'],
        winOpts,
      );
      const match = stdout.match(/\{[0-9A-F-]{36}\}/i);
      if (match) return match[0];
    } catch {}

    // Attempt 3: MachineGuid — OS-install-level fallback, no braces, standard UUID with dashes.
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      winOpts,
    );
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
    if (match) return match[1].trim();
    throw new Error('Could not find any Windows GUID source');
  }

  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    // Output format: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (!match) throw new Error('IOPlatformUUID not found in ioreg output');
    return match[1];
  }

  // Linux: /etc/machine-id is exactly 32 lowercase hex chars + newline when valid.
  // Falls back to /var/lib/dbus/machine-id (Alpine, systems without systemd).
  // Both may exist but be empty (Docker Ubuntu base images).
  for (const path of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const content = (await readFile(path, 'utf8')).trim();
      if (/^[0-9a-f]{32}$/.test(content)) return content;
    } catch {}
  }
  throw new Error('No valid machine-id found on Linux');
};

/**
 * Returns the NIC adapter GUID encoded as a 16-byte Buffer per WYD.exe's algorithm.
 * Result is cached for the lifetime of the process.
 *
 * Platform sources:
 *   Windows — Get-NetAdapter InterfaceGuid (identical to GetAdaptersInfo)
 *   macOS   — IOPlatformUUID from ioreg
 *   Linux   — /etc/machine-id
 *   Fallback — SHA-256 of MAC bytes (VMs, containers, command failures)
 */
export const getAdapterGuidBytes = async (): Promise<Buffer> => {
  if (cachedGuidBytes) return cachedGuidBytes;

  try {
    const raw = await fetchGuidRaw();
    cachedGuidBytes = parseGuidToBytes(raw);
    platformLogger.debug(`Adapter GUID: ${cachedGuidBytes.toString('hex')}`);
    return cachedGuidBytes;
  } catch (err) {
    platformLogger.warn(
      `Failed to get adapter GUID, using MAC-derived fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    const mac = getMacBytes();
    const hash = createHash('sha256').update(mac).digest('hex').slice(0, 32);
    cachedGuidBytes = parseGuidToBytes(hash);
    platformLogger.debug(`Adapter GUID (fallback): ${cachedGuidBytes.toString('hex')}`);
    return cachedGuidBytes;
  }
};

/**
 * Derives a session-only adapter identity without exposing or mutating the host NIC.
 *
 * The random UUID becomes the 16-byte adapter GUID sent by WYD. The six-byte MAC
 * is HMAC-SHA256(real MAC, UUID), then marked locally administered + unicast.
 * The same host MAC + UUID always produces the same pair, which keeps reconnects
 * stable while a newly generated UUID produces a different identity.
 */
export const deriveSessionHardwareIdentity = (
  hostMac: Buffer,
  identitySeed: string,
): LoginHardwareIdentity => {
  if (hostMac.length !== 6) {
    throw new Error('Host MAC must contain exactly 6 bytes');
  }
  if (!UUID_PATTERN.test(identitySeed)) {
    throw new Error('Session hardware identity seed must be a UUID');
  }

  const normalizedSeed = identitySeed.toLowerCase();
  const adapterGuid = parseGuidToBytes(normalizedSeed);
  const digest = createHmac('sha256', hostMac)
    .update(SESSION_IDENTITY_DOMAIN)
    .update(adapterGuid)
    .digest();
  const mac = Buffer.from(digest.subarray(0, 6));

  // IEEE 802: bit 0 clear = unicast; bit 1 set = locally administered.
  mac[0] = (mac[0] | 0x02) & 0xfe;
  return { adapterGuid, mac };
};

export const resolveLoginHardwareIdentity = async (
  identitySeed?: string | null,
): Promise<LoginHardwareIdentity> => {
  if (identitySeed) {
    return deriveSessionHardwareIdentity(getMacBytes(), identitySeed);
  }
  return { adapterGuid: await getAdapterGuidBytes(), mac: getMacBytes() };
};

export const getSessionMacPreview = (identitySeed: string): string =>
  Array.from(deriveSessionHardwareIdentity(getMacBytes(), identitySeed).mac, (byte) =>
    byte.toString(16).padStart(2, '0').toUpperCase(),
  ).join(':');

/**
 * The STABLE OS machine GUID source (Windows MachineGuid / macOS IOPlatformUUID
 * / Linux machine-id) — NOT the network-adapter GUID, which flips with
 * Wi-Fi/Ethernet/VPN/dock changes.
 */
const fetchStableMachineGuid = async (): Promise<string> => {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true },
    );
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
    if (match) return match[1].trim();
    throw new Error('MachineGuid not found');
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (!match) throw new Error('IOPlatformUUID not found');
    return match[1];
  }
  for (const path of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const content = (await readFile(path, 'utf8')).trim();
      if (/^[0-9a-f]{32}$/.test(content)) return content;
    } catch {}
  }
  throw new Error('No valid machine-id found on Linux');
};

/**
 * Full 64-char SHA-256 of the stable OS machine GUID — the machine-binding key
 * used to key per-device reconnect bags. Stable across reboots; changes only on OS reinstall. Cached
 * per process. Throws if no stable source is readable (caller sends a sentinel).
 */
export const getMachineBindingKey = async (): Promise<string> => {
  if (cachedBindingKey !== null) return cachedBindingKey;
  const raw = (await fetchStableMachineGuid()).replace(/[{}]/g, '').trim().toLowerCase();
  cachedBindingKey = createHash('sha256').update(raw).digest('hex');
  return cachedBindingKey;
};

/** 8-char folder fingerprint from the STABLE machine GUID — a network/adapter change won't move it. */
export const getStableFingerprint = async (): Promise<string> => {
  if (cachedStableFingerprint !== null) return cachedStableFingerprint;
  cachedStableFingerprint = fingerprintFromGuid(await fetchStableMachineGuid());
  return cachedStableFingerprint;
};
