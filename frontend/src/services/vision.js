function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal load gambar')); };
    img.src = url;
  });
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
  let h = 0, s = 0, v = max;
  if (diff) {
    if (max === r) h = ((g - b) / diff + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / diff + 2) * 60;
    else h = ((r - g) / diff + 4) * 60;
    s = diff / max;
  }
  return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
}

function isWaterColor(hsv) {
  const { h, s, v } = hsv;
  if (h >= 180 && h <= 260 && s <= 45 && v >= 15 && v <= 85) return true;
  if (h >= 160 && h <= 280 && s <= 20 && v >= 5 && v <= 35) return true;
  if (h >= 20 && h <= 55 && s >= 3 && s <= 22 && v >= 20 && v <= 70) return true;
  if (s <= 8 && v >= 15 && v <= 65 && (h <= 60 || h >= 180)) return true;
  return false;
}

function isSkinColor(hsv) {
  const { h, s, v } = hsv;
  if (h <= 50 && s >= 15 && s <= 65 && v >= 30 && v <= 95) return true;
  if (h <= 40 && s >= 10 && s <= 55 && v >= 15 && v <= 70) return true;
  return false;
}

function samplePixels(img, sampleCount = 6000) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let w = img.naturalWidth, h = img.naturalHeight;
  const maxW = 800, maxH = 800;
  if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w = Math.round(w * r); h = Math.round(h * r); }
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const total = w * h, step = Math.max(1, Math.floor(total / sampleCount));
  const pixels = [];
  for (let i = 0; i < total; i += step) {
    const idx = i * 4;
    pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2], ...rgbToHsv(data[idx], data[idx + 1], data[idx + 2]) });
  }
  return { pixels, w, h };
}

async function detectFloodWater(file) {
  try {
    const img = await loadImage(file);
    const { pixels } = samplePixels(img, 8000);
    const total = pixels.length;
    let waterCount = 0, skinCount = 0, flatCount = 0;
    for (const p of pixels) {
      if (isSkinColor(p)) skinCount++;
      else if (isWaterColor(p)) waterCount++;
      if (Math.abs(p.r - p.g) + Math.abs(p.g - p.b) + Math.abs(p.b - p.r) < 20) flatCount++;
    }
    const waterRatio = waterCount / total;
    const skinRatio = skinCount / total;
    if (skinRatio > 0.25) return { isWater: false, confidence: 0, waterRatio: Math.round(waterRatio * 100), details: ['Foto terdeteksi mengandung wajah/orang'] };
    if (flatCount / total > 0.5) return { isWater: false, confidence: 0, waterRatio: Math.round(waterRatio * 100), details: ['Gambar terlihat digital/buatan'] };
    if (waterRatio < 0.12) return { isWater: false, confidence: 0, waterRatio: Math.round(waterRatio * 100), details: ['Tidak mendeteksi genangan air signifikan'] };
    
    let confidence = Math.min(99, Math.round((waterRatio * 50 + (1 - skinRatio) * 30 + 20) * 100) / 100);
    if (waterRatio < 0.2) confidence *= 0.7;
    return { isWater: confidence >= 30, confidence: Math.round(Math.min(99, confidence)), waterRatio: Math.round(waterRatio * 100), details: ['Genangan air terdeteksi'] };
  } catch (e) {
    return { isWater: false, confidence: 0, waterRatio: 0, details: ['Gagal memproses gambar: ' + e.message] };
  }
}

async function checkAuthenticity(file, exifData) {
  const checks = { isAuthentic: false, passed: [], failed: [], score: 0 };
  if (exifData?.Make && exifData?.Model) { checks.passed.push(`Kamera: ${exifData.Make} ${exifData.Model}`); checks.score += 25; }
  else { checks.failed.push('Tidak ada metadata kamera'); }
  if (exifData?.DateTimeOriginal) {
    const diff = Date.now() - new Date(exifData.DateTimeOriginal).getTime();
    if (diff > 0 && diff < 3600000) { checks.passed.push(`Real-time (${Math.round(diff / 60000)}m)`); checks.score += 25; }
    else { checks.failed.push('Foto terlalu lama'); }
  } else { checks.failed.push('Tidak ada tanggal (mungkin screenshot)'); }
  try {
    const img = await loadImage(file);
    if (img.naturalWidth >= 640 && img.naturalHeight >= 480) { checks.passed.push(`Resolusi ${img.naturalWidth}x${img.naturalHeight}`); checks.score += 25; }
    else { checks.failed.push('Resolusi terlalu rendah'); }
  } catch { checks.failed.push('Gagal baca resolusi'); }
  try {
    const img = await loadImage(file);
    const { pixels } = samplePixels(img, 2000);
    const varRatio = pixels.filter(p => Math.abs(p.r - p.g) + Math.abs(p.g - p.b) + Math.abs(p.b - p.r) > 30).length / pixels.length;
    if (varRatio > 0.4) { checks.passed.push('Tekstur alami'); checks.score += 25; }
    else { checks.failed.push('Warna terlalu seragam'); }
  } catch { checks.failed.push('Gagal analisis tekstur'); }
  checks.isAuthentic = checks.score >= 60;
  return checks;
}

export { detectFloodWater, checkAuthenticity };
