function pngTextChunk(keyword: string, text: string): Uint8Array<ArrayBuffer> {
  const data = new TextEncoder().encode(`${keyword}\0\0\0\0\0${text}`);
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([105, 84, 88, 116], 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  view.setUint32(chunk.length - 4, crc ^ 0xffffffff);
  return chunk;
}

export async function downloadPng(
  canvas: HTMLCanvasElement,
  filename: string,
  attribution?: string,
): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('PNG creation failed.')),
      'image/png',
    );
  });
  const end = blob.size - 12;
  const download = attribution
    ? new Blob(
        [
          blob.slice(0, end),
          pngTextChunk('Licenses and Attribution', attribution),
          blob.slice(end),
        ],
        { type: 'image/png' },
      )
    : blob;
  const url = URL.createObjectURL(download);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
