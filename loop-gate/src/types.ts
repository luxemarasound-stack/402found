export interface LoopDetectionResult {
  looped: boolean;
  loop_count: number;
  agent_id: string;
  tool_name: string;
  window_seconds: number;
}

export interface IdempotencyEntry {
  result: unknown;
  created_at: number;
}
