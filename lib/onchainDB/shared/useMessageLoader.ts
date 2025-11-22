import { useCallback, useState } from 'react'
import type { MessageRow } from '@/lib/onchainDB/utils/message-helpers'

export type LoaderOptions = {
  skipLoadingState?: boolean
}

type UseMessageLoaderParams<TArgs extends unknown[]> = {
  fetcher: (...args: TArgs) => Promise<MessageRow[]>
}

export function useMessageLoader<TArgs extends unknown[]>({
  fetcher,
}: UseMessageLoaderParams<TArgs>) {
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [showLoadingSpinner, setShowLoadingSpinner] = useState(false)

  const loadMessages = useCallback(
    async (...args: [...TArgs, LoaderOptions?]) => {
      const maybeOptions = args[args.length - 1]
      const options = typeof maybeOptions === 'object' && maybeOptions && 'skipLoadingState' in maybeOptions
        ? (args.pop() as LoaderOptions)
        : undefined

      if (!options?.skipLoadingState) {
        setMessagesLoading(true)
        setMessagesError(null)
        setShowLoadingSpinner(true)
        setTimeout(() => setShowLoadingSpinner(false), 800)
      }

      try {
        return await fetcher(...(args as unknown as TArgs))
      } catch (error) {
        setMessagesError(error instanceof Error ? error.message : 'Failed to load messages')
        throw error
      } finally {
        if (!options?.skipLoadingState) {
          setMessagesLoading(false)
        }
      }
    },
    [fetcher]
  )

  return {
    loadMessages,
    messagesLoading,
    messagesError,
    showLoadingSpinner,
  }
}
