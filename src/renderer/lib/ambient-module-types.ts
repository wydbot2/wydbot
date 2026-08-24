export type ModuleLifecycle = 'macro-coupled' | 'always-on' | 'lifecycle-controller';

export interface AmbientModule {
  readonly name: string;
  readonly pollIntervalMs: number;
  readonly lifecycle: ModuleLifecycle;

  /** MUST check `signal.aborted` before async work; never call `gameApi.move`; never throw. */
  tick(signal: AbortSignal): Promise<void>;

  reset(): void;
}
