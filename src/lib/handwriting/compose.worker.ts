import type { CompositionInput, CompositionResult } from './compose-reading-card';
import type { PreparedPage } from './contracts';

const utf8 = new TextEncoder();
const bytes = (text: string) => utf8.encode(text);
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array) {
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length); result.set(bytes(type), 4); result.set(data, 8);
  view.setUint32(data.length + 8, crc32(result.subarray(4, data.length + 8)));
  return result;
}
function iText(key: string, value: string) { return pngChunk('iTXt', join([bytes(key), new Uint8Array(5), bytes(value)])); }
export async function markedPNG(blob: Blob, page: PreparedPage) {
  const png = new Uint8Array(await blob.arrayBuffer());
  if (png[0] !== 137 || png[1] !== 80) throw new Error('卡面编码未成功，请重试。');
  const density = new Uint8Array(9), view = new DataView(density.buffer);
  view.setUint32(0, 11811); view.setUint32(4, 11811); density[8] = 1;
  // Canvas strips source metadata. Reinsert the exact upstream fields and XMP after IHDR.
  const metadata = [iText('AIGC', JSON.stringify(page.aigc)), iText('XML:com.adobe.xmp', page.xmp),
    pngChunk('tEXt', bytes('InkoEdited\0true')), pngChunk('pHYs', density)];
  const output = [png.subarray(0, 33), ...metadata];
  const source = new DataView(png.buffer);
  for (let at = 33; at < png.length;) {
    if (at + 12 > png.length) throw new Error('卡面编码不完整。');
    const size = source.getUint32(at), end = at + size + 12;
    if (end > png.length) throw new Error('卡面编码不完整。');
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type !== 'pHYs') output.push(png.subarray(at, end));
    at = end;
  }
  return new Blob(output, { type: 'image/png' });
}
function pdfString(text: string) {
  let encoded = 'FEFF';
  for (let i = 0; i < text.length; i++) encoded += text.charCodeAt(i).toString(16).padStart(4, '0');
  return '<' + encoded + '>';
}
const stream = (attributes: string, data: Uint8Array) => join([bytes(`<< ${attributes} /Length ${data.length} >>\nstream\n`), data, bytes('\nendstream')]);

export class CardPDF {
  private objects: Uint8Array[] = [new Uint8Array(), new Uint8Array()];
  private kids: number[] = [];
  private first: PreparedPage | null = null;
  private add(value: Uint8Array) { this.objects.push(value); return this.objects.length; }
  async page(canvas: OffscreenCanvas, page: PreparedPage) {
    this.first ||= page;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成 PDF。');
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let p = 0, i = 0; p < rgba.length; p += 4) { rgb[i++] = rgba[p]!; rgb[i++] = rgba[p + 1]!; rgb[i++] = rgba[p + 2]!; }
    const compressed = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const image = this.add(stream(`/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, compressed));
    const content = this.add(stream('', bytes('q 595.276 0 0 841.89 0 0 cm /Im0 Do Q')));
    const metadata = this.add(stream('/Type /Metadata /Subtype /XML', bytes(page.xmp)));
    this.kids.push(this.add(bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R /Metadata ${metadata} 0 R >>`)));
  }
  finish() {
    if (!this.first) throw new Error('没有可以保存的页面。');
    const metadata = this.add(stream('/Type /Metadata /Subtype /XML', bytes(this.first.xmp)));
    this.objects[0] = bytes(`<< /Type /Catalog /Pages 2 0 R /Metadata ${metadata} 0 R >>`);
    this.objects[1] = bytes(`<< /Type /Pages /Kids [${this.kids.map(id => `${id} 0 R`).join(' ')}] /Count ${this.kids.length} >>`);
    const info = this.add(bytes(`<< /Title ${pdfString('六经注我 · 手写纪念卡')} /Creator ${pdfString('InfiDao')} /Producer ${pdfString(this.first.aigc.ContentProducer)} /AIGC ${pdfString(JSON.stringify(this.first.aigc))} /InkoEdited (true) >>`));
    const parts = [bytes('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n')];
    const offsets = [0];
    let size = parts[0]!.length;
    this.objects.forEach((object, i) => {
      offsets.push(size);
      const part = join([bytes(`${i + 1} 0 obj\n`), object, bytes('\nendobj\n')]);
      parts.push(part); size += part.length;
    });
    parts.push(bytes(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${size}\n%%EOF\n`));
    return new Blob(parts, { type: 'application/pdf' });
  }
}

async function compose(input: CompositionInput): Promise<CompositionResult> {
  const started = performance.now();
  const pages: Blob[] = [], pdf = new CardPDF();
  for (const { page, image } of input.pages) {
    const bitmap = await createImageBitmap(image);
    if (bitmap.width !== page.width || bitmap.height !== page.height) { bitmap.close(); throw new Error('素材尺寸不一致，请重新整理。'); }
    const canvas = new OffscreenCanvas(page.width, page.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建卡面。');
    context.fillStyle = input.layout === 'cream' ? '#f4efe4' : '#fff';
    context.fillRect(0, 0, page.width, page.height);
    // Reserve a quiet title above the server's 30 mm writing margin. No user content is added here.
    context.fillStyle = '#6e675d'; context.font = '32px serif'; context.textAlign = 'left';
    context.fillText('六经注我', page.width * 22 / 210, page.height * 16 / 297);
    context.strokeStyle = '#c9bda9'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(page.width * 22 / 210, page.height * 21 / 297); context.lineTo(page.width * 188 / 210, page.height * 21 / 297); context.stroke();
    context.drawImage(bitmap, 0, 0); bitmap.close();
    pages.push(await markedPNG(await canvas.convertToBlob({ type: 'image/png' }), page));
    await pdf.page(canvas, page);
    canvas.width = canvas.height = 1;
  }
  return { pages, pdf: pdf.finish(), durationMs: performance.now() - started };
}

// This file is loaded only as a dedicated worker after an explicit export action.
self.onmessage = (event: MessageEvent<CompositionInput>) => {
  void compose(event.data).then(result => self.postMessage(result, {})).catch(() => self.postMessage({ error: '卡面整理未成功，请重试；原任务和文字仍在。' }, {}));
};
