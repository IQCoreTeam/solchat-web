import { useEffect, useRef } from 'react'
import { PublicKey, type Connection, type AccountInfo, type Context } from '@solana/web3.js'
import { updateAccountCache } from '@/lib/rpc/cache'

export type OnAccountChangeArgs = {
  connection: Connection
  account: PublicKey
  info: AccountInfo<Buffer | Uint8Array | string>
  context: Context
}

type OnAccountChangeHandler = (args: OnAccountChangeArgs) => void | Promise<void>

export function useOnAccountChange({
  connection,
  account,
  handler,
  commitment = 'processed',
  enabled = true,
  updateCache = true,
}: {
  connection: Connection
  account: PublicKey | null
  handler: OnAccountChangeHandler
  commitment?: 'processed' | 'confirmed' | 'finalized'
  enabled?: boolean
  updateCache?: boolean
}) {
  const subscriptionRef = useRef<number | null>(null)
  // Use ref to avoid re-subscribing when handler changes
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const accountKey = account?.toBase58() ?? null

  useEffect(() => {
    if (!enabled || !account || !accountKey) return

    let subscriptionId: number | null = null

    const subscribe = async () => {
      try {
        const id = connection.onAccountChange(
          account,
          (info, context) => {
            // Update the RPC cache with fresh data from WebSocket
            if (updateCache) {
              updateAccountCache(accountKey, info)
            }
            // Call the handler
            void handlerRef.current({ connection, account, info, context })
          },
          commitment
        )
        subscriptionId = id
        subscriptionRef.current = id
        console.log(`[useOnAccountChange] Subscribed to ${accountKey.slice(0, 8)}... (id: ${id})`)
      } catch (error) {
        console.warn('[useOnAccountChange] Failed to subscribe:', error)
      }
    }

    subscribe()

    return () => {
      if (subscriptionId !== null) {
        console.log(`[useOnAccountChange] Unsubscribing from ${accountKey.slice(0, 8)}... (id: ${subscriptionId})`)
        connection.removeAccountChangeListener(subscriptionId).catch(() => undefined)
        subscriptionRef.current = null
      }
    }
  }, [connection, accountKey, commitment, enabled, updateCache])
}
