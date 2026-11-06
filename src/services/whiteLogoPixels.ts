/**
 * Converts artwork to white while using transparent cutouts for contrasting
 * dark details. Uniform-colour artwork keeps its original alpha unchanged.
 */
export function preserveWhiteLogoDetails(pixels: Uint8ClampedArray): void {
  const histogram = new Float64Array(256);
  let total = 0;
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.1) continue;
    const luminance = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    histogram[luminance] += alpha;
    total += alpha;
    sum += alpha * luminance;
  }

  let darkWeight = 0;
  let darkSum = 0;
  let bestVariance = 0;
  let threshold = 0;
  for (let level = 0; level < 255; level++) {
    darkWeight += histogram[level];
    darkSum += histogram[level] * level;
    const lightWeight = total - darkWeight;
    if (darkWeight < total * 0.02 || lightWeight < total * 0.02) continue;
    const difference = darkSum / darkWeight - (sum - darkSum) / lightWeight;
    const variance = darkWeight * lightWeight * difference * difference;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = level;
    }
  }

  const hasContrast = total > 0 && Math.sqrt(bestVariance / (total * total)) >= 15;
  for (let i = 0; i < pixels.length; i += 4) {
    if (hasContrast) {
      const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const opacity = Math.max(0, Math.min(1, (luminance - threshold - 1) / 12));
      pixels[i + 3] = Math.round(pixels[i + 3] * opacity);
    }
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
  }
}
