import { useEffect, useRef } from 'react'
import { PublicKey, type Connection, type Logs } from '@solana/web3.js'

export type OnLogsCallbackArgs = {
  connection: Connection
  account: PublicKey
  signature: string
  logs: Logs
}

type OnLogsHandler = (args: OnLogsCallbackArgs) => void | Promise<void>

export function useOnLogs({
  connection,
  account,
  handler,
  commitment = 'confirmed',
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

        const id = connection.onLogs(
          account,
          (logs) => {
            void handler({
              connection,
              account,
              signature: logs.signature,
              logs,
            })
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
