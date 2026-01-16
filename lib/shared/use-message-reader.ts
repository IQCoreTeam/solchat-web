import { useMessageIndexLoader } from './useMessageIndexLoader';

export type UseMessageReaderOptions = Parameters<typeof useMessageIndexLoader>[0];

export function useMessageReader(options: UseMessageReaderOptions) {
  return useMessageIndexLoader(options);
}
