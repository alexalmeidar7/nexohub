const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { PNG } = require("playwright-core/lib/utilsBundle");

function compare(referencePath, devicePath, diffPath, tolerance = 0, maxDifferentPercent = 0) {
  if (!referencePath || !devicePath || !diffPath ||
      !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255 ||
      !Number.isFinite(maxDifferentPercent) || maxDifferentPercent < 0 || maxDifferentPercent > 100) {
    throw new Error("Usage: compare-screens.cjs reference.png device.png diff.png [channelTolerance] [maxDifferentPercent]");
  }
  if ([referencePath, devicePath].some(input => resolve(input).toLowerCase() === resolve(diffPath).toLowerCase())) {
    throw new Error("Use a separate file for the difference image.");
  }
  const reference = PNG.sync.read(readFileSync(referencePath));
  const device = PNG.sync.read(readFileSync(devicePath));
  const { width, height } = reference;
  if (device.width !== width || device.height !== height) {
    throw new Error(`Reference ${width}×${height}; device ${device.width}×${device.height}.`);
  }
  const diff = new PNG({ width, height });
  let different = 0, left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      let changed = false;
      for (let channel = 0; channel < 4; channel++) {
        if (Math.abs(reference.data[offset + channel] - device.data[offset + channel]) > tolerance) {
          changed = true;
          break;
        }
      }
      if (changed) {
        different++;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
        diff.data.set([255, 35, 120, 255], offset);
      } else {
        const gray = Math.round((reference.data[offset] + reference.data[offset + 1] + reference.data[offset + 2]) / 9);
        diff.data.set([gray, gray, gray, 255], offset);
      }
    }
  }
  writeFileSync(diffPath, PNG.sync.write(diff));
  const differentPercent = different * 100 / (width * height);
  return { width, height, different, differentPercent, bounds: different ? { left, top, right, bottom } : null,
    passed: differentPercent <= maxDifferentPercent };
}

if (require.main === module) {
  try {
    const [reference, device, diff, tolerance, maxDifferentPercent] = process.argv.slice(2);
    const result = compare(reference, device, diff, Number(tolerance ?? 0), Number(maxDifferentPercent ?? 0));
    console.log(JSON.stringify(result));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { compare };
