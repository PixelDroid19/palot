/**
 * Shared UUID helpers for locally generated, persisted identifiers.
 */

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length)
	globalThis.crypto.getRandomValues(bytes)
	return bytes
}

function byteToHex(byte: number): string {
	return byte.toString(16).padStart(2, "0")
}

export function createUuidV7(): string {
	const bytes = randomBytes(16)
	const timestamp = Date.now()

	bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xff
	bytes[1] = Math.floor(timestamp / 0x100000000) & 0xff
	bytes[2] = Math.floor(timestamp / 0x1000000) & 0xff
	bytes[3] = Math.floor(timestamp / 0x10000) & 0xff
	bytes[4] = Math.floor(timestamp / 0x100) & 0xff
	bytes[5] = timestamp & 0xff
	bytes[6] = (bytes[6] & 0x0f) | 0x70
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return (
		byteToHex(bytes[0]) +
		byteToHex(bytes[1]) +
		byteToHex(bytes[2]) +
		byteToHex(bytes[3]) +
		"-" +
		byteToHex(bytes[4]) +
		byteToHex(bytes[5]) +
		"-" +
		byteToHex(bytes[6]) +
		byteToHex(bytes[7]) +
		"-" +
		byteToHex(bytes[8]) +
		byteToHex(bytes[9]) +
		"-" +
		byteToHex(bytes[10]) +
		byteToHex(bytes[11]) +
		"-" +
		byteToHex(bytes[12]) +
		byteToHex(bytes[13]) +
		byteToHex(bytes[14]) +
		byteToHex(bytes[15])
	)
}
