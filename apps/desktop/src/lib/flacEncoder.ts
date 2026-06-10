// Minimal FLAC encoder — produces valid FLAC files with VERBATIM subframes.
// FLAC format: https://xiph.org/flac/format.html

const CRC8_POLY = 0x07;
const CRC16_POLY = 0x8005;
const CRC8_TABLE: number[] = [];
const CRC16_TABLE: number[] = [];

for (let i = 0; i < 256; i++) {
  let crc8 = i;
  for (let j = 0; j < 8; j++) {
    crc8 = crc8 & 0x80 ? ((crc8 << 1) ^ CRC8_POLY) & 0xFF : (crc8 << 1) & 0xFF;
  }
  CRC8_TABLE.push(crc8);

  let crc16 = i << 8;
  for (let j = 0; j < 8; j++) {
    crc16 = crc16 & 0x8000 ? ((crc16 << 1) ^ CRC16_POLY) & 0xFFFF : (crc16 << 1) & 0xFFFF;
  }
  CRC16_TABLE.push(crc16);
}

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc = CRC8_TABLE[crc ^ byte];
  }
  return crc;
}

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ byte) & 0xFF]) & 0xFFFF;
  }
  return crc;
}

function utf8Encode(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (remaining > 0x7F) {
    bytes.push((remaining & 0x7F) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining & 0x7F);
  return new Uint8Array(bytes);
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

function writeUint24(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, (value >> 16) & 0xFF);
  view.setUint8(offset + 1, (value >> 8) & 0xFF);
  view.setUint8(offset + 2, value & 0xFF);
}

function writeUint36(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, (value >> 28) & 0xFF);
  view.setUint8(offset + 1, (value >> 20) & 0xFF);
  view.setUint8(offset + 2, (value >> 12) & 0xFF);
  view.setUint8(offset + 3, (value >> 4) & 0xFF);
  view.setUint8(offset + 4, ((value & 0x0F) << 4));
}

export function audioBufferToFlac(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const totalSamples = buffer.length;
  const blockSize = 4096;
  const numBlocks = Math.ceil(totalSamples / blockSize);

  const maxFrameSize = 16 + numChannels * (2 + blockSize * (bitsPerSample / 8));
  const metaSize = 38;
  const totalMax = metaSize + numBlocks * maxFrameSize;
  const buf = new ArrayBuffer(totalMax + 64);
  const view = new DataView(buf);
  let pos = 0;

  // "fLaC" marker
  view.setUint32(pos, 0x664C6143, false);
  pos += 4;

  // STREAMINFO metadata block (last = true, type 0)
  const streamInfoLen = 34;
  view.setUint8(pos, 0x80);
  pos += 1;
  writeUint24(view, pos, streamInfoLen);
  pos += 3;

  writeUint16(view, pos, blockSize);
  pos += 2;
  writeUint16(view, pos, blockSize);
  pos += 2;
  writeUint24(view, pos, 0);
  pos += 3;
  writeUint24(view, pos, 0);
  pos += 3;

  // Sample rate (20 bits) + channels-1 (3 bits) + bits/sample-1 (5 bits)
  view.setUint8(pos, (sampleRate >> 12) & 0xFF);
  pos += 1;
  view.setUint8(pos, (sampleRate >> 4) & 0xFF);
  pos += 1;
  view.setUint8(pos, ((sampleRate & 0x0F) << 4) | ((numChannels - 1) & 0x07));
  pos += 1;
  view.setUint8(pos, ((bitsPerSample - 1) & 0x1F) << 3);
  pos += 1;

  // Total samples (36 bits)
  writeUint36(view, pos, totalSamples);
  pos += 5;

  // MD5 (zero)
  for (let i = 0; i < 16; i++) {
    view.setUint8(pos + i, 0);
  }
  pos += 16;

  // Audio data
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const frameStart = blockIdx * blockSize;
    const frameSamples = Math.min(blockSize, totalSamples - frameStart);
    const frameHeaderStart = pos;

    // Sync code
    view.setUint8(pos, 0xFF);
    pos += 1;
    view.setUint8(pos, 0xF8);
    pos += 1;

    // Block size + sample rate code
    const blockSizeCode = frameSamples <= 256 ? 0b0000 : 0b1111;
    view.setUint8(pos, (blockSizeCode << 4) | 0b0000);
    pos += 1;

    // Channel assignment + sample size
    view.setUint8(pos, ((numChannels - 1) << 4) | (0b010 << 1));
    pos += 1;

    // Frame number (UTF-8)
    const frameNumEncoded = utf8Encode(blockIdx);
    for (const b of frameNumEncoded) {
      view.setUint8(pos, b);
      pos += 1;
    }

    // Block size if using explicit encoding
    if (blockSizeCode === 0b1111) {
      writeUint16(view, pos, frameSamples);
      pos += 2;
    }

    // CRC-8 of frame header
    const headerBytes = new Uint8Array(buf, frameHeaderStart, pos - frameHeaderStart);
    view.setUint8(pos, crc8(headerBytes));
    pos += 1;

    // Subframes (VERBATIM)
    for (let ch = 0; ch < numChannels; ch++) {
      view.setUint8(pos, 0x00); // VERBATIM
      pos += 1;

      for (let s = 0; s < frameSamples; s++) {
        const sample = channelData[ch][frameStart + s];
        const clamped = Math.max(-1, Math.min(1, sample));
        const intVal = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
        view.setInt16(pos, Math.round(intVal), false);
        pos += 2;
      }
    }

    // CRC-16 of entire frame
    const frameBytes = new Uint8Array(buf, frameHeaderStart, pos - frameHeaderStart);
    writeUint16(view, pos, crc16(frameBytes));
    pos += 2;
  }

  return new Uint8Array(buf, 0, pos);
}
