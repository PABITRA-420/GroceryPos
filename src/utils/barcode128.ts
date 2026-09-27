/**
 * Pure TypeScript Code 128-B Barcode Pattern Generator
 * Generates exact high-contrast SVG representation with zero external dependencies.
 */

// Code 128 patterns (index = code value 0-106)
// Each number represents widths of 3 bars and 3 spaces (11 modules each, except stop pattern which is 13)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (106 is STOP)
];

const START_B = 104;
const STOP = 106;

/**
 * Encodes ASCII string into Code 128-B modules (1 for bar, 0 for space)
 */
export function encodeCode128(text: string): string {
  if (!text) return '';

  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Code 128-B covers ASCII 32 to 126
    const code = charCode - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      checksum += code * (i + 1);
    }
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP);

  let binaryPattern = '';
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;

    let isBar = true;
    for (const widthChar of pattern) {
      const width = parseInt(widthChar, 10);
      binaryPattern += (isBar ? '1' : '0').repeat(width);
      isBar = !isBar;
    }
  }

  return binaryPattern;
}

/**
 * Generates an SVG string representation of a Code 128 barcode
 */
export function generateBarcodeSvg(
  text: string,
  options: { width?: number; height?: number; quietZone?: boolean } = {}
): string {
  const binary = encodeCode128(text);
  if (!binary) return '';

  const quiet = options.quietZone !== false ? 10 : 0;
  const totalModules = binary.length + quiet * 2;
  const targetWidth = options.width || 200;
  const targetHeight = options.height || 50;
  const moduleWidth = targetWidth / totalModules;

  let rects = '';
  let x = quiet * moduleWidth;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${moduleWidth.toFixed(2)}" height="${targetHeight}" fill="#000000" />`;
    }
    x += moduleWidth;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}" width="100%" height="100%" preserveAspectRatio="none">${rects}</svg>`;
}
