/**
 * Indian Rupee Amount to Words Converter
 * Formats numbers into Indian Numbering System (Crores, Lakhs, Thousands, Hundreds).
 * Compliant with Indian GST / Invoicing standards.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n > 0) {
    if (n < 20) {
      str += ONES[n] + ' ';
    } else {
      str += TENS[Math.floor(n / 10)] + ' ';
      if (n % 10 > 0) {
        str += ONES[n % 10] + ' ';
      }
    }
  }
  return str.trim();
}

/**
 * Converts an Indian number to words (Lakhs, Crores format).
 */
export function numberToWordsIndian(num: number): string {
  if (isNaN(num) || num < 0) return '';
  if (num === 0) return 'Rupees Zero Only';

  const rounded = Math.round(num * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let result = '';

  if (rupees > 0) {
    let n = rupees;
    const crore = Math.floor(n / 10000000);
    n %= 10000000;

    const lakh = Math.floor(n / 100000);
    n %= 100000;

    const thousand = Math.floor(n / 1000);
    n %= 1000;

    const hundredAndBelow = n;

    if (crore > 0) {
      result += convertBelowThousand(crore) + ' Crore ';
    }
    if (lakh > 0) {
      result += convertBelowThousand(lakh) + ' Lakh ';
    }
    if (thousand > 0) {
      result += convertBelowThousand(thousand) + ' Thousand ';
    }
    if (hundredAndBelow > 0) {
      result += convertBelowThousand(hundredAndBelow) + ' ';
    }

    result = 'Rupees ' + result.trim();
  } else {
    result = 'Rupees Zero';
  }

  if (paise > 0) {
    result += ' and ' + convertBelowThousand(paise) + ' Paise';
  }

  return result.trim() + ' Only';
}
