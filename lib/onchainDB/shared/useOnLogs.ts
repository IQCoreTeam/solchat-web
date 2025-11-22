import { useEffect, useRef } from 'react'
import { PublicKey, type Connection } from '@solana/web3.js'

type OnLogsHandler = (connection: Connection, account: PublicKey) => void | Promise<void>

export function useOnLogs({
  connection,
  account,
  handler,
  commitment = 'processed',
}: {
  connection: Connection
  account: PublicKey | null
  handler: OnLogsHandler
  commitment?: 'processed' | 'confirmed'
}) {
  const subscriptionRef = useRef<number | null>(null)

  useEffect(() => {
    async function subscribe() {
      if (!account) return

      try {
        const id = await connection.onLogs(
          account,
          () => {
            void handler(connection, account)
          },
          commitment
        )
        subscriptionRef.current = id
      } catch (error) {
        console.warn('[useOnLogs] Failed to subscribe', error)
      }
    }

    subscribe()

    return () => {
      if (subscriptionRef.current !== null) {
        connection.removeOnLogsListener(subscriptionRef.current).catch(() => undefined)
        subscriptionRef.current = null
      }
    }
  }, [connection, account?.toBase58(), commitment, handler])
}
