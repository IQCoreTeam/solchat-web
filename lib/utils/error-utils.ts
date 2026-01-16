/**
 * Error Utilities
 * - Helper functions for error handling and log extraction
 */

/**
 * Extract error logs from Solana transaction errors
 * Handles both direct logs and simulation response logs
 */
export function extractErrorLogs(error: unknown): string[] | undefined {
  if (typeof error !== 'object' || !error) {
    return undefined;
  }
  const candidate = error as {
    logs?: unknown;
    simulationResponse?: { logs?: unknown };
  };
  if (Array.isArray(candidate.logs)) {
    return candidate.logs as string[];
  }
  const simLogs = candidate.simulationResponse?.logs;
  if (Array.isArray(simLogs)) {
    return simLogs as string[];
  }
  return undefined;
}
