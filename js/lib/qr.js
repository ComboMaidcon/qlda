// Mã QR cho phiếu bó: tạo hình (qrcode-generator) và quét (BarcodeDetector của trình duyệt, hoặc jsQR nếu trình duyệt không có).
// Thư viện nạp từ CDN khi cần dùng lần đầu, giống cách nạp thư viện Excel.
const GEN_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

const loading = {};
function loadScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  loading[src] ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => { delete loading[src]; reject(new Error('Không tải được thư viện mã QR (kiểm tra kết nối Internet)')); };
    document.head.appendChild(script);
  });
  return loading[src];
}

// Trả về chuỗi <svg> của mã QR (co giãn theo khung chứa).
export async function qrSvg(text, { margin = 2 } = {}) {
  await loadScript(GEN_SRC, () => typeof window.qrcode === 'function');
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + margin},${r + margin}h1v1h-1z`;
  }
  const size = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export const canScan = () => !!navigator.mediaDevices?.getUserMedia;

// Bật camera vào videoEl, gọi onCode(text) mỗi khi đọc được mã (không lặp lại cùng mã trong 3 giây).
// Trả về hàm stop(). Ném lỗi nếu không mở được camera.
export async function startScanner(videoEl, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', '');
  await videoEl.play();

  let detect;
  if ('BarcodeDetector' in window) {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    detect = async () => (await detector.detect(videoEl))[0]?.rawValue ?? null;
  } else {
    await loadScript(JSQR_SRC, () => typeof window.jsQR === 'function');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    detect = async () => {
      if (!videoEl.videoWidth) return null;
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(img.data, img.width, img.height)?.data ?? null;
    };
  }

  let stopped = false;
  let last = { text: null, at: 0 };
  (async function loop() {
    while (!stopped) {
      try {
        const text = await detect();
        if (text && (text !== last.text || Date.now() - last.at > 3000)) {
          last = { text, at: Date.now() };
          onCode(text);
        }
      } catch { /* khung hình lỗi: bỏ qua */ }
      await new Promise(r => setTimeout(r, 200));
    }
  })();

  return () => {
    stopped = true;
    stream.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  };
}
