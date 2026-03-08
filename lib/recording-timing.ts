export interface RecordingTimingConfig {
  preRollMs: number;
  postRollMs: number;
  hardMaxMs: number;
}

export const DEFAULT_V3_RECORDING_TIMING: RecordingTimingConfig = {
  preRollMs: 5000,
  postRollMs: 2000,
  hardMaxMs: 12000,
};

export function getCountdownStartCount(config: RecordingTimingConfig): number {
  return Math.max(1, Math.ceil(config.preRollMs / 1000));
}

export function shouldStartRecordingAtCount(
  count: number,
  config: RecordingTimingConfig = DEFAULT_V3_RECORDING_TIMING
): boolean {
  return count === getCountdownStartCount(config);
}
