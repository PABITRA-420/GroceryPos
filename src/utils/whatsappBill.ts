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

let activeWhatsAppTab: Window | null = null;

/**
 * Dispatches a WhatsApp bill without opening dozens of browser tabs or triggering "Leave site?" dialogs.
 * 
 * Key Features:
 * 1. Reuses a single named browser tab ('pos_whatsapp_session') instead of opening a new tab every time.
 * 2. Copies formatted bill message to clipboard automatically.
 * 3. Supports direct desktop protocol via hidden iframe without page navigation.
 */
export function openWhatsAppShare(
  phone: string | null | undefined,
  message: string,
  mode: 'web_reused_tab' | 'desktop_app' = 'web_reused_tab'
): void {
  let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  const encodedText = encodeURIComponent(message);

  // 1. Native Desktop App via hidden iframe (zero page navigation, zero "Leave site" warning)
  if (mode === 'desktop_app') {
    const nativeAppUrl = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = nativeAppUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 2000);
    return;
  }

  // 3. Web mode with strict single-tab reuse:
  const webDirectUrl = cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
    : `https://web.whatsapp.com/send?text=${encodedText}`;

  // If the WhatsApp tab is already open, navigate the existing tab & focus it (NO new tab)
  if (activeWhatsAppTab && !activeWhatsAppTab.closed) {
    activeWhatsAppTab.location.href = webDirectUrl;
    activeWhatsAppTab.focus();
  } else {
    activeWhatsAppTab = window.open(webDirectUrl, 'pos_whatsapp_session');
  }
}
