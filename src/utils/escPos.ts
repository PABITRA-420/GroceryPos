import type { SaleResult, ShopProfile } from '../types';

/**
 * ESC/POS Binary Command Codes for Standard POS Thermal Receipt Printers
 * (Compatible with Epson, TVS, Posiflex, Star, NGX, Roffee, Everycom, etc.)
 */
export const ESC_POS_COMMANDS = {
  INIT: '\x1B\x40',
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  DOUBLE_WIDTH_HEIGHT: '\x1D\x21\x11',
  DOUBLE_HEIGHT: '\x1B\x21\x10',
  DOUBLE_WIDTH: '\x1B\x21\x20',
  NORMAL: '\x1B\x21\x00',
  UNDERLINE_ON: '\x1B\x2D\x01',
  UNDERLINE_OFF: '\x1B\x2D\x00',
  FEED_3_LINES: '\x1B\x64\x03',
  CUT_FULL: '\x1D\x56\x00',
  CUT_PARTIAL: '\x1D\x56\x01',
  FEED_AND_CUT: '\x1D\x56\x42\x00',
  // Pulse to RJ11 Cash Drawer: Pin 2 (standard 24V / 12V pulse)
  CASH_DRAWER_KICK_PIN2: '\x1B\x70\x00\x19\xFA',
  // Pulse to RJ11 Cash Drawer: Pin 5
  CASH_DRAWER_KICK_PIN5: '\x1B\x70\x01\x19\xFA',
};

/**
 * Pad a string to fit exact column widths
 */
export function padRight(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return str + ' '.repeat(length - str.length);
}

export function padLeft(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return ' '.repeat(length - str.length) + str;
}

export function formatTwoColumns(left: string, right: string, width = 48): string {
  const maxLeft = width - right.length - 1;
  const truncatedLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const spaces = width - truncatedLeft.length - right.length;
  return truncatedLeft + ' '.repeat(Math.max(1, spaces)) + right;
}

/**
 * Generates raw ESC/POS formatted receipt stream string
 */
export function generateEscPosReceipt(
  saleResult: SaleResult,
  shopProfile: ShopProfile,
  options: {
    paperWidth?: '80mm' | '58mm';
    kickCashDrawer?: boolean;
    cutPaper?: boolean;
  } = {}
): string {
  const { paperWidth = '80mm', kickCashDrawer = false, cutPaper = true } = options;
  const colWidth = paperWidth === '58mm' ? 32 : 48;
  const divider = '-'.repeat(colWidth);
  const doubleDivider = '='.repeat(colWidth);
  const { sale, items } = saleResult;

  let buffer = '';

  // 1. Initialize Printer
  buffer += ESC_POS_COMMANDS.INIT;

  // Optional: Kick Cash Drawer on cash tender
  if (kickCashDrawer) {
    buffer += ESC_POS_COMMANDS.CASH_DRAWER_KICK_PIN2;
  }

  // 2. Shop Header (Centered)
  buffer += ESC_POS_COMMANDS.ALIGN_CENTER;
  buffer += ESC_POS_COMMANDS.BOLD_ON;
  buffer += ESC_POS_COMMANDS.DOUBLE_WIDTH_HEIGHT;
  buffer += (shopProfile.shop_name || 'APNA GROCERY STORE') + '\n';
  buffer += ESC_POS_COMMANDS.NORMAL;
  buffer += ESC_POS_COMMANDS.BOLD_OFF;

  if (shopProfile.shop_address) {
    buffer += shopProfile.shop_address + '\n';
  }
  if (shopProfile.shop_phone) {
    buffer += `Ph: ${shopProfile.shop_phone}\n`;
  }
  if (shopProfile.shop_gstin) {
    buffer += `GSTIN: ${shopProfile.shop_gstin}\n`;
  }

  // 3. Invoice & Date Info (Left aligned)
  buffer += ESC_POS_COMMANDS.ALIGN_LEFT;
  buffer += doubleDivider + '\n';
  buffer += formatTwoColumns(`Invoice: ${sale.invoice_number}`, sale.created_at.slice(0, 16), colWidth) + '\n';

  const custName = sale.customer_name?.trim() || 'Walk-in Customer';
  buffer += formatTwoColumns(`Customer: ${custName}`, `Pay: ${sale.payment_mode}`, colWidth) + '\n';
  if (sale.customer_phone) {
    buffer += `Mobile: ${sale.customer_phone}\n`;
  }

  buffer += divider + '\n';

  // 4. Line Items Table
  if (colWidth === 32) {
    // 58mm compact format:
    // Name
    // Qty x Price          Total
    for (const item of items) {
      buffer += ESC_POS_COMMANDS.BOLD_ON;
      buffer += item.product_name.slice(0, 32) + '\n';
      buffer += ESC_POS_COMMANDS.BOLD_OFF;
      const leftCol = ` ${item.quantity} ${item.unit} x ₹${item.unit_price.toFixed(2)}`;
      const rightCol = `₹${item.total_price.toFixed(2)}`;
      buffer += formatTwoColumns(leftCol, rightCol, 32) + '\n';
    }
  } else {
    // 80mm standard format (48 columns):
    // Item Name                 Qty    Price     Total
    const header = padRight('Item', 24) + padLeft('Qty', 6) + padLeft('Price', 8) + padLeft('Total', 10);
    buffer += header + '\n';
    buffer += divider + '\n';

    for (const item of items) {
      const name = padRight(item.product_name, 24);
      const qty = padLeft(`${item.quantity} ${item.unit}`, 6);
      const price = padLeft(item.unit_price.toFixed(2), 8);
      const total = padLeft(item.total_price.toFixed(2), 10);
      buffer += `${name}${qty}${price}${total}\n`;
    }
  }

  buffer += divider + '\n';

  // 5. Financial Summary
  buffer += formatTwoColumns('Subtotal:', `₹${sale.subtotal.toFixed(2)}`, colWidth) + '\n';
  if (sale.discount_amount > 0) {
    buffer += formatTwoColumns('Discount:', `-₹${sale.discount_amount.toFixed(2)}`, colWidth) + '\n';
  }
  if (sale.tax_amount > 0) {
    buffer += formatTwoColumns('Tax / GST Included:', `₹${sale.tax_amount.toFixed(2)}`, colWidth) + '\n';
  }

  const rawNet = sale.subtotal - sale.discount_amount + sale.tax_amount;
  const roundOff = Math.round((sale.total_amount - rawNet) * 100) / 100;
  if (Math.abs(roundOff) > 0.001) {
    const roStr = roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`;
    buffer += formatTwoColumns('Round Off:', roStr, colWidth) + '\n';
  }

  buffer += doubleDivider + '\n';
  buffer += ESC_POS_COMMANDS.BOLD_ON;
  buffer += ESC_POS_COMMANDS.DOUBLE_HEIGHT;
  buffer += formatTwoColumns('GRAND TOTAL:', `₹${sale.total_amount.toFixed(2)}`, colWidth) + '\n';
  buffer += ESC_POS_COMMANDS.NORMAL;
  buffer += ESC_POS_COMMANDS.BOLD_OFF;
  buffer += doubleDivider + '\n';

  // Payment note if split or credit
  if (sale.notes && sale.notes.includes('[SPLIT:')) {
    buffer += sale.notes + '\n' + divider + '\n';
  }

  // 6. Footer (Centered)
  buffer += ESC_POS_COMMANDS.ALIGN_CENTER;
  buffer += (shopProfile.invoice_footer || 'Thank you! Visit again.') + '\n';
  buffer += '*** SAVE PAPER, SAVE NATURE ***\n';

  // Feed and cut
  buffer += '\n\n';
  if (cutPaper) {
    buffer += ESC_POS_COMMANDS.FEED_AND_CUT;
  }

  return buffer;
}

/**
 * Triggers native cash drawer kick pulse via audio beep / ESC/POS or virtual notification
 */
export function kickCashDrawer(): void {
  try {
    // Play subtle POS cash drawer confirmation chime
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (err) {
    console.warn('Audio drawer pulse not available:', err);
  }
}
