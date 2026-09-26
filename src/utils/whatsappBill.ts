import type { SaleResult, ShopProfile } from '../types';
import { formatSaleDateTime } from '../services/billingService';

/**
 * Formats a clean, readable text receipt for WhatsApp sharing.
 */
export function generateWhatsAppReceiptText(
  saleResult: SaleResult,
  shopProfile: ShopProfile
): string {
  const { sale, items } = saleResult;
  const { date, time } = formatSaleDateTime(sale.created_at);

  const lines: string[] = [];
  lines.push(`🧾 *${shopProfile.shop_name || 'Apna Grocery Store'}*`);
  if (shopProfile.shop_address) lines.push(`📍 ${shopProfile.shop_address}`);
  if (shopProfile.shop_phone) lines.push(`📞 ${shopProfile.shop_phone}`);
  if (shopProfile.shop_gstin) lines.push(`🏛️ GSTIN: ${shopProfile.shop_gstin}`);
  lines.push(`--------------------------------`);
  lines.push(`*Invoice No:* ${sale.invoice_number}`);
  lines.push(`*Date & Time:* ${date} ${time}`);
  if (sale.customer_name) lines.push(`*Customer:* ${sale.customer_name}`);
  lines.push(`--------------------------------`);
  lines.push(`*ITEMS PURCHASED:*`);

  items.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. *${item.product_name}*\n   ${item.quantity} ${item.unit} × ₹${item.unit_price.toFixed(2)} = *₹${item.total_price.toFixed(2)}*`
    );
  });

  lines.push(`--------------------------------`);
  lines.push(`Subtotal: ₹${sale.subtotal.toFixed(2)}`);
  if (sale.discount_amount > 0) {
    lines.push(`Discount Savings: -₹${sale.discount_amount.toFixed(2)}`);
  }
  if (sale.tax_amount > 0) {
    lines.push(`GST Tax Included: ₹${sale.tax_amount.toFixed(2)}`);
  }
  lines.push(`*GRAND TOTAL: ₹${sale.total_amount.toFixed(2)}*`);
  lines.push(`Payment Mode: *${sale.payment_mode}*`);
  lines.push(`Status: *${sale.payment_status}*`);
  lines.push(`--------------------------------`);
  lines.push(shopProfile.invoice_footer || 'Thank you for shopping with us! Please visit again. 🙏');

  return lines.join('\n');
}

/**
 * Opens WhatsApp Web or WhatsApp Desktop app via sanitized wa.me link.
 */
export function openWhatsAppShare(
  phone: string | null | undefined,
  message: string
): void {
  let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  const encodedText = encodeURIComponent(message);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  window.open(url, '_blank');
}
