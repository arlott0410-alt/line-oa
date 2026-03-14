import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/workerd";

const MAX_IMAGE_DIMENSION = 1200;
const MAX_INPUT_SIZE_BYTES = 8 * 1024 * 1024;

/** บีบอัดรูป: resize + แปลงเป็น WebP เพื่อลดขนาดไฟล์ คงความคมชัด */
export function compressImage(
  inputBytes: Uint8Array,
  mimeType: string
): { bytes: Uint8Array; contentType: string; ext: string } | null {
  if (inputBytes.byteLength > MAX_INPUT_SIZE_BYTES) return null;
  if (mimeType === "image/gif") return null;
  try {
    const inputImage = PhotonImage.new_from_byteslice(inputBytes);
    try {
      const w = inputImage.get_width();
      const h = inputImage.get_height();
      if (w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION) {
        const out = inputImage.get_bytes_webp();
        inputImage.free();
        return { bytes: out, contentType: "image/webp", ext: "webp" };
      }
      const scale = Math.min(MAX_IMAGE_DIMENSION / w, MAX_IMAGE_DIMENSION / h);
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);
      const outputImage = resize(inputImage, newW, newH, SamplingFilter.Lanczos3);
      inputImage.free();
      const out = outputImage.get_bytes_webp();
      outputImage.free();
      return { bytes: out, contentType: "image/webp", ext: "webp" };
    } catch {
      inputImage.free();
      return null;
    }
  } catch {
    return null;
  }
}
