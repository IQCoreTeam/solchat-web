import { keccak_256 } from '@noble/hashes/sha3'
import { Buffer } from 'buffer'

export type BytesLike = string | Uint8Array | Buffer | number[]

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/
const HEX_ANY_REGEX = /^[0-9a-fA-F]+$/
const HEX_PREFIX_REGEX = /^0x[0-9a-fA-F]+$/
const encoder = new TextEncoder()

export function deriveSeedBytes(name: string): Uint8Array {
  const trimmed = name.trim()
  if (HEX_64_REGEX.test(trimmed)) {
    return Uint8Array.from(Buffer.from(trimmed, 'hex'))
  }
  return keccak_256(encoder.encode(trimmed))
}

export function deriveSeedHex(name: string): string {
  const trimmed = name.trim()
  if (HEX_64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  return Buffer.from(deriveSeedBytes(trimmed)).toString('hex')
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

export function toBytes(input: BytesLike): Uint8Array {
  if (input instanceof Uint8Array) return new Uint8Array(input)
  if (Buffer.isBuffer(input)) return Uint8Array.from(input)
  if (Array.isArray(input)) return Uint8Array.from(input)
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return new Uint8Array()
    if (HEX_PREFIX_REGEX.test(trimmed)) {
      return fromHex(trimmed.slice(2))
    }
    if (HEX_ANY_REGEX.test(trimmed) && trimmed.length % 2 === 0) {
      return fromHex(trimmed)
    }
    return encoder.encode(trimmed)
  }
  throw new Error('Unsupported input for byte conversion')
}

export function rootIdToBytes(rootId: BytesLike): Uint8Array {
  const bytes = toBytes(rootId)
  if (bytes.length === 0) {
    throw new Error('rootId cannot be empty')
  }
  if (bytes.length > 32) {
    throw new Error(`rootId length (${bytes.length}) exceeds 32 bytes`)
  }
  return bytes
}
