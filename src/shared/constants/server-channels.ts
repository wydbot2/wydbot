/** Server channel definition used across all layers. */

export interface ServerChannel {
  readonly name: string;
  readonly ip: string;
  readonly port: number;
}
