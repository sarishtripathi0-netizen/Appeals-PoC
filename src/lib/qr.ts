import QRCode from "qrcode";

/** A QR code as inline SVG (generated on the server from our own payload). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 168, errorCorrectionLevel: "M" });
}
