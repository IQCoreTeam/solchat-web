type RequestFactory = () => Promise<Response>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  request: RequestFactory,
  retries = 3,
  delayMs = 3000
): Promise<Response> {
  try {
    const response = await request();

    if (response.status === 429 && retries > 0) {
      await wait(delayMs);
      return fetchWithRetry(request, retries - 1, delayMs * 2);
    }

    if (!response.ok) {
      throw new Error(`[fetchWithRetry] HTTP ${response.status}`);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await wait(delayMs);
      return fetchWithRetry(request, retries - 1, delayMs * 2);
    }
    throw error;
  }
}
