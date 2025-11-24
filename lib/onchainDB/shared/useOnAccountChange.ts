import { useEffect, useRef } from 'react'
import { PublicKey, type Connection, type AccountInfo, type Context } from '@solana/web3.js'

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
}: {
  connection: Connection
  account: PublicKey | null
  handler: OnAccountChangeHandler
  commitment?: 'processed' | 'confirmed' | 'finalized'
  enabled?: boolean
}) {
  const subscriptionRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || !account) return

    const subscribe = async () => {
      try {
        const id = await connection.onAccountChange(
          account,
          (info, context) => {
            void handler({ connection, account, info, context })
          },
          commitment
        )
        subscriptionRef.current = id
      } catch (error) {
        console.warn('[useOnAccountChange] Failed to subscribe', error)
      }
    }

    subscribe()

    return () => {
      if (subscriptionRef.current !== null) {
        connection.removeAccountChangeListener(subscriptionRef.current).catch(() => undefined)
        subscriptionRef.current = null
      }
    }
  }, [connection, account?.toBase58(), commitment, handler, enabled])
}
