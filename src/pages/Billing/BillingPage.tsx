import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Barcode,
  Trash2,
  Plus,
  Minus,
  UserCheck,
  UserPlus,
  RotateCcw,
  CheckCircle,
  CreditCard,
  Banknote,
  QrCode,
  AlertCircle,
  Printer,
  History,
  X,
  Scale,
  PauseCircle,
  Split,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { InvoiceReceipt } from '../../components/billing/InvoiceReceipt';
import { WeightSelectorModal } from '../../components/billing/WeightSelectorModal';
import { UpiQrModal } from '../../components/billing/UpiQrModal';
import { ParkedBillsModal } from '../../components/billing/ParkedBillsModal';
import { parkedBillService, type ParkedBill } from '../../services/parkedBillService';
import { productService } from '../../services/productService';
import { customerService } from '../../services/customerService';
import {
  billingService,
  formatCurrency,
  formatBillingErrorMessage,
} from '../../services/billingService';
import type {
  Product,
  Customer,
  CartItem,
  SaleResult,
  ShopProfile,
  Sale,
} from '../../types';

interface BillingPageProps {
  onCartChange?: (count: number) => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({ onCartChange }) => {
  // ----------------------------------------------------
  // State: Cart & Products
  // ----------------------------------------------------
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    onCartChange?.(cart.length);
  }, [cart.length, onCartChange]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);

  // Weight Selector Modal state
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [weightModalIndex, setWeightModalIndex] = useState<number | null>(null);

  // UPI QR Code Modal state
  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);

  // ----------------------------------------------------
  // State: Customer (Phone number entry & auto-identification)
  // ----------------------------------------------------
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isNewCustomerActive, setIsNewCustomerActive] = useState(false);
  const [allCustomersList, setAllCustomersList] = useState<Customer[]>([]);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');

  // ----------------------------------------------------
  // State: Billing Calculations & Payment
  // ----------------------------------------------------
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'SPLIT'>('CASH');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');
  const [splitCard, setSplitCard] = useState<string>('');

  // ----------------------------------------------------
  // State: Parked / Held Bills (Queue Management)
  // ----------------------------------------------------
  const [parkedBills, setParkedBills] = useState<ParkedBill[]>(() => parkedBillService.getParkedBills());
  const [isParkedModalOpen, setIsParkedModalOpen] = useState(false);
  const [parkConfirmPrompt, setParkConfirmPrompt] = useState<ParkedBill | null>(null);
  const [holdSuccessMessage, setHoldSuccessMessage] = useState<string | null>(null);

  // ----------------------------------------------------
  // State: Post-Sale & Invoice
  // ----------------------------------------------------
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [shopProfile, setShopProfile] = useState<ShopProfile>({
    shop_name: 'Apna Grocery Store',
    owner_name: '',
    shop_address: 'Main Market, Local City',
    shop_phone: '',
    shop_email: null,
    shop_gstin: null,
    shop_upi_id: null,
    invoice_footer: 'Thank you for shopping with us! Please visit again.',
  });

  // Recent sales for reprint
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [isRecentSalesOpen, setIsRecentSalesOpen] = useState(false);

  // Status & error handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Search input ref for F2 focusing and barcode auto-focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // Initial Data Loading & Keyboard Shortcuts
  // ----------------------------------------------------
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [profileData, prods, custs] = await Promise.all([
        billingService.getShopProfile(),
        productService.getProducts({ low_stock_only: false }),
        customerService.getCustomers(),
      ]);
      setShopProfile(profileData);
      setPopularProducts(prods.slice(0, 12));
      setAllCustomersList(custs);
    } catch (err) {
      console.error('Failed to load billing initial data:', err);
    }
  };

  // Keyboard shortcut listener (F2 to focus search, F6 to hold, F4 for customer, Escape to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        setIsCustomerModalOpen(true);
      }
      if (e.key === 'F5') {
        // Prevent accidental browser / webview refresh which wipes active cart
        e.preventDefault();
      }
      if (e.key === 'F6') {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length > 0) {
          handleParkCurrentBill();
        } else {
          setIsParkedModalOpen(true);
        }
      }
      if (e.key === 'Escape') {
        if (completedSale) {
          // If invoice preview is open, Esc starts a new bill
          handleNewBill();
        } else if (isParkedModalOpen) {
          setIsParkedModalOpen(false);
        } else if (parkConfirmPrompt) {
          setParkConfirmPrompt(null);
        } else if (isCustomerModalOpen) {
          setIsCustomerModalOpen(false);
        } else if (isQuickAddCustomerOpen) {
          setIsQuickAddCustomerOpen(false);
        } else if (isRecentSalesOpen) {
          setIsRecentSalesOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completedSale, isCustomerModalOpen, isQuickAddCustomerOpen, isRecentSalesOpen, isParkedModalOpen, parkConfirmPrompt, cart.length]);

  // Auto-focus search input when returning to billing or on mount
  useEffect(() => {
    if (!completedSale && !isCustomerModalOpen && !isQuickAddCustomerOpen) {
      searchInputRef.current?.focus();
    }
  }, [completedSale, isCustomerModalOpen, isQuickAddCustomerOpen]);

  // Section 29: Unsaved bill protection on window navigation or reload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart.length]);

  // ----------------------------------------------------
  // Product Search & Barcode Scan Handling
  // ----------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      handleProductSearch(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleProductSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const results = await productService.searchProducts(trimmed);
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching products:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Barcode scanner keypress / Enter handler
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      // 1. Direct barcode match
      let targetProduct = searchResults.find(
        (p) => p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()
      );

      // 2. If not in current results, perform exact search
      if (!targetProduct) {
        try {
          const fetched = await productService.searchProducts(trimmed);
          targetProduct = fetched.find(
            (p) => p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()
          ) || fetched[0];
        } catch (err) {
          console.error('Error finding barcode:', err);
        }
      }

      if (targetProduct) {
        addProductToCart(targetProduct);
        setSearchQuery('');
        setSearchResults([]);
      } else {
        setStockWarning(`No product found matching barcode/query: "${trimmed}"`);
        setTimeout(() => setStockWarning(null), 3000);
      }
    }
  };

  // ----------------------------------------------------
  // Cart Actions & Inventory Validation
  // ----------------------------------------------------
  const [expiredPromptProduct, setExpiredPromptProduct] = useState<Product | null>(null);

  const addProductToCart = (product: Product) => {
    setErrorMessage(null);
    setStockWarning(null);

    // Guard: Out of stock
    if (product.stock <= 0) {
      setStockWarning(`"${product.name}" is OUT OF STOCK. Cannot add to cart.`);
      setTimeout(() => setStockWarning(null), 3500);
      return;
    }

    // Guard: Expiry safety warning for perishable grocery items
    if (product.expiry_date) {
      const exp = new Date(product.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      exp.setHours(0, 0, 0, 0);
      if (exp < today) {
        setExpiredPromptProduct(product);
        return;
      }
    }

    doAddProductToCart(product);
  };

  const doAddProductToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (item) => item.product_id === product.id
      );

      if (existingIndex > -1) {
        const item = prevCart[existingIndex];
        const newQty = item.quantity + 1;

        if (newQty > product.stock) {
          setStockWarning(
            `Only ${product.stock} ${product.unit} available in stock for "${product.name}".`
          );
          setTimeout(() => setStockWarning(null), 3500);
          return prevCart;
        }

        const updated = [...prevCart];
        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          current_stock: product.stock,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode,
          unit: product.unit,
          hsn_code: product.hsn_code,
          quantity: 1,
          unit_price: product.selling_price,
          mrp: product.mrp,
          gst_rate: product.gst_rate,
          current_stock: product.stock,
          expiry_date: product.expiry_date || null,
          batch_number: product.batch_number || null,
        };
        return [...prevCart, newItem];
      }
    });

    // Re-focus search input
    searchInputRef.current?.focus();
  };

  const updateItemQuantity = (index: number, newQty: number) => {
    setStockWarning(null);
    if (newQty <= 0) {
      removeItemFromCart(index);
      return;
    }

    setCart((prevCart) => {
      const item = prevCart[index];
      if (!item) return prevCart;

      if (newQty > item.current_stock) {
        setStockWarning(
          `Only ${item.current_stock} ${item.unit} available in stock for "${item.product_name}".`
        );
        setTimeout(() => setStockWarning(null), 3500);
        return prevCart;
      }

      const updated = [...prevCart];
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  // Smart stepper for fractional Indian grocery units (25g, 50g, 250g, 500g)
  const handleQuantityStep = (index: number, direction: 'up' | 'down') => {
    const item = cart[index];
    if (!item) return;

    const isWeightUnit = ['Kg', 'Gram', 'Litre', 'ML', 'Quintal (Qtl)'].includes(item.unit);
    let delta = 1.0;

    if (isWeightUnit) {
      if (item.quantity < 0.25) {
        delta = 0.025; // 25gm step
      } else if (item.quantity < 1.0) {
        delta = 0.050; // 50gm step
      } else if (item.quantity < 2.0) {
        delta = 0.250; // 250gm step
      } else {
        delta = 0.500; // 500gm step
      }
    }

    const newQty =
      direction === 'up'
        ? Math.round((item.quantity + delta) * 1000) / 1000
        : Math.round(Math.max(0, item.quantity - delta) * 1000) / 1000;

    updateItemQuantity(index, newQty);
  };

  const handleOpenWeightModal = (index: number) => {
    setWeightModalIndex(index);
    setIsWeightModalOpen(true);
  };

  const handleApplyWeight = (newQty: number) => {
    if (weightModalIndex !== null) {
      updateItemQuantity(weightModalIndex, newQty);
    }
  };

  const removeItemFromCart = (index: number) => {
    setCart((prevCart) => prevCart.filter((_, i) => i !== index));
  };

  const handleClearBillClick = () => {
    if (cart.length > 0) {
      setDiscardConfirmOpen(true);
    } else {
      resetBill();
    }
  };

  // ----------------------------------------------------
  // Phone-driven Customer Recognition & Quick Add
  // ----------------------------------------------------
  const handlePhoneInputChange = (rawVal: string) => {
    const cleaned = rawVal.replace(/[^\d]/g, '').slice(0, 10);
    setCustomerPhoneInput(cleaned);

    if (!cleaned) {
      setSelectedCustomer(null);
      setIsNewCustomerActive(false);
      setNewCustomerName('');
      setNewCustomerAddress('');
      return;
    }

    // Check if phone matches any customer in database
    const matched = allCustomersList.find((c) => {
      if (!c.phone) return false;
      const cCleaned = c.phone.replace(/[^\d]/g, '');
      return cCleaned === cleaned;
    });

    if (matched) {
      setSelectedCustomer(matched);
      setIsNewCustomerActive(false);
      setNewCustomerName('');
      setNewCustomerAddress('');
    } else {
      setSelectedCustomer(null);
      // If 10 digits entered, automatically open fields for Name & Address
      if (cleaned.length >= 10) {
        setIsNewCustomerActive(true);
      } else {
        setIsNewCustomerActive(false);
      }
    }
  };

  const handleClearCustomer = () => {
    setCustomerPhoneInput('');
    setNewCustomerName('');
    setNewCustomerAddress('');
    setSelectedCustomer(null);
    setIsNewCustomerActive(false);
  };

  const resetBill = () => {
    setCart([]);
    handleClearCustomer();
    setDiscountAmount(0);
    setPaymentMode('CASH');
    setCashReceived('');
    setPaymentNotes('');
    setSplitCash('');
    setSplitUpi('');
    setSplitCard('');
    setErrorMessage(null);
    setStockWarning(null);
    setCompletedSale(null);
    setDiscardConfirmOpen(false);
    searchInputRef.current?.focus();
  };

  // ----------------------------------------------------
  // Hold / Park Bill Operations
  // ----------------------------------------------------
  const handleParkCurrentBill = () => {
    if (cart.length === 0) {
      setStockWarning('Cannot hold an empty bill. Add items before parking.');
      setTimeout(() => setStockWarning(null), 3000);
      return;
    }

    const parked = parkedBillService.parkBill({
      cart,
      customer: selectedCustomer,
      customer_phone_input: customerPhoneInput,
      new_customer_name: newCustomerName,
      new_customer_address: newCustomerAddress,
      discount_amount: discountAmount,
      payment_mode: paymentMode,
      payment_notes: paymentNotes,
      total_amount: calculations.grandTotal,
    });

    setParkedBills(parkedBillService.getParkedBills());
    resetBill();
    setHoldSuccessMessage(`Cart placed on hold as Hold #${parked.token_number}! Ready for next customer.`);
    setTimeout(() => setHoldSuccessMessage(null), 3500);
  };

  const handleResumeParkedBill = (bill: ParkedBill) => {
    if (cart.length > 0) {
      setParkConfirmPrompt(bill);
      return;
    }
    executeResumeBill(bill);
  };

  const executeResumeBill = (bill: ParkedBill) => {
    parkedBillService.recallParkedBill(bill.id);
    setParkedBills(parkedBillService.getParkedBills());
    setCart(bill.cart);
    setSelectedCustomer(bill.customer);
    setCustomerPhoneInput(bill.customer_phone_input || '');
    setNewCustomerName(bill.new_customer_name || '');
    setNewCustomerAddress(bill.new_customer_address || '');
    setDiscountAmount(bill.discount_amount);
    setPaymentMode(bill.payment_mode === 'CREDIT' ? 'CASH' : bill.payment_mode);
    setPaymentNotes(bill.payment_notes);
    setIsParkedModalOpen(false);
    setParkConfirmPrompt(null);
    setHoldSuccessMessage(`Hold #${bill.token_number} restored to counter.`);
    setTimeout(() => setHoldSuccessMessage(null), 3500);
  };

  const handleParkCurrentAndResumeHeld = (bill: ParkedBill) => {
    parkedBillService.parkBill({
      cart,
      customer: selectedCustomer,
      customer_phone_input: customerPhoneInput,
      new_customer_name: newCustomerName,
      new_customer_address: newCustomerAddress,
      discount_amount: discountAmount,
      payment_mode: paymentMode,
      payment_notes: paymentNotes,
      total_amount: calculations.grandTotal,
    });
    executeResumeBill(bill);
  };

  const handleDiscardParkedBill = (id: string) => {
    parkedBillService.discardParkedBill(id);
    setParkedBills(parkedBillService.getParkedBills());
  };

  // ----------------------------------------------------
  // Deterministic Cart Calculations
  // ----------------------------------------------------
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    cart.forEach((item) => {
      const lineSubtotal = Math.round(item.quantity * item.unit_price * 100) / 100;
      const lineTax =
        item.gst_rate > 0
          ? Math.round(lineSubtotal * (item.gst_rate / 100) * 100) / 100
          : 0;
      subtotal += lineSubtotal;
      totalTax += lineTax;
    });

    subtotal = Math.round(subtotal * 100) / 100;
    totalTax = Math.round(totalTax * 100) / 100;

    const validatedDiscount = Math.min(Math.max(0, discountAmount || 0), subtotal);
    const rawNetTotal = Math.round((subtotal - validatedDiscount + totalTax) * 100) / 100;
    const roundedGrandTotal = Math.round(rawNetTotal);
    const roundOff = Math.round((roundedGrandTotal - rawNetTotal) * 100) / 100;
    const grandTotal = roundedGrandTotal;

    const cashNum = parseFloat(cashReceived) || 0;
    const changeToReturn = paymentMode === 'CASH' ? Math.max(0, Math.round((cashNum - grandTotal) * 100) / 100) : 0;
    const isCashSufficient = paymentMode === 'CASH' ? cashNum >= grandTotal : true;

    return {
      subtotal,
      totalTax,
      discount: validatedDiscount,
      rawNetTotal,
      roundOff,
      grandTotal,
      changeToReturn,
      isCashSufficient,
      totalItemsCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [cart, discountAmount, paymentMode, cashReceived]);

  // Split payment totals calculation
  const splitTotals = useMemo(() => {
    const c = parseFloat(splitCash) || 0;
    const u = parseFloat(splitUpi) || 0;
    const cd = parseFloat(splitCard) || 0;
    const totalTendered = Math.round((c + u + cd) * 100) / 100;
    const remaining = Math.round((calculations.grandTotal - totalTendered) * 100) / 100;
    return {
      cash: c,
      upi: u,
      card: cd,
      totalTendered,
      remaining,
      isSufficient: totalTendered >= calculations.grandTotal,
    };
  }, [splitCash, splitUpi, splitCard, calculations.grandTotal]);

  // Set exact cash tender shortcut
  const handleSetExactCash = () => {
    setCashReceived(calculations.grandTotal.toString());
  };

  const handleAddCashPreset = (added: number) => {
    const current = parseFloat(cashReceived) || 0;
    setCashReceived((current + added).toString());
  };

  // ----------------------------------------------------
  // Customer Selection & Quick Add
  // ----------------------------------------------------
  const handleCustomerSearch = async (query: string) => {
    setCustomerSearchQuery(query);
    if (!query.trim()) {
      setCustomerSearchResults([]);
      return;
    }
    try {
      const res = await customerService.searchCustomers(query);
      setCustomerSearchResults(res);
    } catch (err) {
      console.error('Error searching customers:', err);
    }
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      const created = await customerService.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim() || null,
        address: newCustAddress.trim() || null,
        gstin: newCustGstin.trim().toUpperCase() || null,
      });
      setSelectedCustomer(created);
      setIsQuickAddCustomerOpen(false);
      setIsCustomerModalOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      setNewCustGstin('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ----------------------------------------------------
  // Checkout & Sale Completion
  // ----------------------------------------------------
  const handleCompleteSale = async () => {
    setErrorMessage(null);
    setStockWarning(null);

    if (cart.length === 0) {
      setErrorMessage('Cart is empty. Add at least one item to complete the bill.');
      return;
    }

    if (paymentMode === 'CASH' && !calculations.isCashSufficient) {
      setErrorMessage(
        `Insufficient cash tendered. Total is ${formatCurrency(
          calculations.grandTotal
        )}, but cash received is ${formatCurrency(parseFloat(cashReceived) || 0)}.`
      );
      return;
    }

    if (paymentMode === 'SPLIT' && !splitTotals.isSufficient) {
      setErrorMessage(
        `Split tender is short by ₹${splitTotals.remaining.toFixed(2)}. Total is ${formatCurrency(
          calculations.grandTotal
        )}, but tendered amount is ₹${splitTotals.totalTendered.toFixed(2)}.`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      // Customer Identification & Registration Flow
      let finalCustomerId: number | null = null;
      let finalCustomerName = 'Walk-in Customer';
      let finalCustomerPhone: string | null = null;

      if (customerPhoneInput.trim()) {
        if (selectedCustomer) {
          finalCustomerId = selectedCustomer.id;
          finalCustomerName = selectedCustomer.name;
          finalCustomerPhone = selectedCustomer.phone || customerPhoneInput.trim();
        } else {
          // New customer must provide name (Mandatory)
          if (!newCustomerName.trim()) {
            setErrorMessage('Customer Name is mandatory when a phone number is entered.');
            setIsSubmitting(false);
            return;
          }

          try {
            // Automatically insert new customer into SQLite database
            const created = await customerService.createCustomer({
              name: newCustomerName.trim(),
              phone: customerPhoneInput.trim(),
              address: newCustomerAddress.trim() || null,
            });
            finalCustomerId = created.id;
            finalCustomerName = created.name;
            finalCustomerPhone = created.phone || customerPhoneInput.trim();
            setAllCustomersList((prev) => [created, ...prev]);
            setSelectedCustomer(created);
          } catch (custErr) {
            console.error('Customer auto-create note:', custErr);
            finalCustomerName = newCustomerName.trim();
            finalCustomerPhone = customerPhoneInput.trim();
          }
        }
      }

      const saleInput = {
        customer_id: finalCustomerId,
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone,
        items: cart.map((item) => ({
          product_id: item.product_id || null,
          product_name: item.product_name,
          barcode: item.barcode || null,
          unit: item.unit,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp,
          gst_rate: item.gst_rate,
          expiry_date: item.expiry_date || null,
          batch_number: item.batch_number || null,
        })),
        discount_amount: calculations.discount,
        payment_mode: paymentMode,
        notes: paymentNotes.trim() || null,
        round_off: calculations.roundOff,
        split_cash: paymentMode === 'SPLIT' ? splitTotals.cash : null,
        split_upi: paymentMode === 'SPLIT' ? splitTotals.upi : null,
        split_card: paymentMode === 'SPLIT' ? splitTotals.card : null,
      };

      const result = await billingService.completeSale(saleInput);

      // Successfully saved atomically in SQLite!
      setCompletedSale(result);

      // Refresh popular products stock in background
      productService
        .getProducts({ low_stock_only: false })
        .then((prods) => setPopularProducts(prods.slice(0, 12)))
        .catch(console.error);
    } catch (err: unknown) {
      const friendlyMsg = formatBillingErrorMessage(err);
      setErrorMessage(friendlyMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // Post-Sale & Reprint Flow
  // ----------------------------------------------------
  const handleNewBill = () => {
    resetBill();
  };

  const handleOpenRecentSales = async () => {
    try {
      const sales = await billingService.getRecentSales(15);
      setRecentSales(sales);
      setIsRecentSalesOpen(true);
    } catch (err) {
      console.error('Failed to load recent sales:', err);
    }
  };

  const handleReprintSale = async (invoiceNumber: string) => {
    try {
      const fullSale = await billingService.getSaleByInvoice(invoiceNumber);
      setCompletedSale(fullSale);
      setIsRecentSalesOpen(false);
    } catch (err) {
      alert(`Could not fetch invoice ${invoiceNumber}: ${err}`);
    }
  };

  // ----------------------------------------------------
  // Render: Invoice Preview Modal
  // ----------------------------------------------------
  if (completedSale) {
    return (
      <div className="flex-1 flex flex-col p-6 h-full overflow-hidden bg-slate-100">
        <InvoiceReceipt
          saleResult={completedSale}
          shopProfile={shopProfile}
          cashReceived={paymentMode === 'CASH' ? parseFloat(cashReceived) || null : null}
          changeAmount={paymentMode === 'CASH' ? calculations.changeToReturn : null}
          onNewBill={handleNewBill}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // Render: Main Merchant POS Screen
  // ----------------------------------------------------
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100 select-none">
      {/* Top POS Action & Status Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-black tracking-tight text-slate-900">
              COUNTER POS
            </h2>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500 font-medium">
            Store: <strong className="text-slate-800">{shopProfile.shop_name}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            F2: Search / Scan
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Hold / Park Bill Button */}
          <Button
            variant="outline"
            size="sm"
            icon={<PauseCircle className="w-3.5 h-3.5 text-amber-600" />}
            onClick={handleParkCurrentBill}
            disabled={cart.length === 0}
            title="Hold current cart to serve next customer (F6)"
            className="border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer"
          >
            Hold Bill (F6)
          </Button>

          {/* Held Carts Badge Button */}
          <button
            type="button"
            onClick={() => setIsParkedModalOpen(true)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              parkedBills.length > 0
                ? 'border-amber-400 bg-amber-500 text-white shadow-2xs'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Held ({parkedBills.length})</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            icon={<History className="w-3.5 h-3.5" />}
            onClick={handleOpenRecentSales}
          >
            Reprint / History
          </Button>

          {cart.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={handleClearBillClick}
            >
              Clear Bill
            </Button>
          )}
        </div>
      </div>

      {/* Hold Success Notification */}
      {holdSuccessMessage && (
        <div className="bg-amber-600 text-white text-xs font-semibold px-6 py-2 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-4 h-4" />
            <span>{holdSuccessMessage}</span>
          </div>
          <button onClick={() => setHoldSuccessMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warnings & Alerts */}
      {stockWarning && (
        <div className="bg-amber-500 text-white text-xs font-semibold px-6 py-2 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{stockWarning}</span>
          </div>
          <button onClick={() => setStockWarning(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-600 text-white text-xs font-semibold px-6 py-2 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Two-Pane Split Layout */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* ==================================================== */}
        {/* LEFT PANE: Product Search & Quick Catalog Lookup    */}
        {/* ==================================================== */}
        <div className="w-7/12 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Search Input Bar (Autofocused, Barcode Scanner Ready) */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/80">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan barcode or type product name... (Press Enter to add)"
                className="w-full pl-11 pr-24 py-3 bg-white text-base font-medium rounded-lg border-2 border-slate-300 focus:border-emerald-600 focus:outline-none transition-colors text-slate-900 placeholder:text-slate-400 shadow-xs"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <Barcode className="w-5 h-5 text-slate-400" />
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300">
                  SCAN
                </span>
              </div>
            </div>
          </div>

          {/* Search Results / Catalog Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {searchQuery.trim() ? (
              // Live Search Results
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                  <span>Search Matches ({searchResults.length})</span>
                  {isSearching && <span>Searching...</span>}
                </div>

                {searchResults.length === 0 && !isSearching ? (
                  <div className="text-center py-12 text-slate-400">
                    <Barcode className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold">No products found</p>
                    <p className="text-xs mt-1">Try another search term or scan code.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {searchResults.map((product) => {
                      const isOutOfStock = product.stock <= 0;
                      return (
                        <div
                          key={product.id}
                          onClick={() => !isOutOfStock && addProductToCart(product)}
                          className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                            isOutOfStock
                              ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                              : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-xs cursor-pointer active:scale-[0.99]'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-bold text-slate-900 leading-tight">
                                {product.name}
                              </h4>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isOutOfStock
                                    ? 'bg-red-100 text-red-700'
                                    : product.stock <= product.minimum_stock
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isOutOfStock
                                  ? 'Out of Stock'
                                  : `${Math.round(product.stock)} ${product.unit}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                              <span>{product.category}</span>
                              {product.barcode && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[11px]">{product.barcode}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                            <div>
                              <span className="text-base font-black text-slate-900">
                                ₹{product.selling_price.toFixed(2)}
                              </span>
                              {product.mrp > product.selling_price && (
                                <span className="text-xs text-slate-400 line-through ml-1.5">
                                  ₹{product.mrp.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isOutOfStock}
                              icon={<Plus className="w-3.5 h-3.5" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                addProductToCart(product);
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              // Fast Tap / Popular Products Catalog
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Quick Add Catalog
                  </span>
                  <span className="text-xs text-slate-400">
                    Click any item to add to bill
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {popularProducts.map((product) => {
                    const isOutOfStock = product.stock <= 0;
                    return (
                      <div
                        key={product.id}
                        onClick={() => !isOutOfStock && addProductToCart(product)}
                        className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                          isOutOfStock
                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-xs cursor-pointer active:scale-[0.98]'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <h4 className="text-xs font-bold text-slate-800 line-clamp-2">
                              {product.name}
                            </h4>
                          </div>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Stock: {Math.round(product.stock)} {product.unit}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <span className="text-sm font-black text-slate-900">
                            ₹{product.selling_price.toFixed(2)}
                          </span>
                          <span className="w-6 h-6 rounded-full bg-slate-100 hover:bg-emerald-600 hover:text-white flex items-center justify-center text-slate-600 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* RIGHT PANE: Cart & Checkout Screen                   */}
        {/* ==================================================== */}
        <div className="w-5/12 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Customer Phone-Driven Lookup & Identification Section */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-md ${
                    selectedCustomer
                      ? 'bg-emerald-100 text-emerald-800'
                      : isNewCustomerActive
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">
                    Customer Details
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {selectedCustomer
                      ? selectedCustomer.name
                      : isNewCustomerActive
                      ? 'New Customer (Registration Required)'
                      : 'Walk-in Customer'}
                  </span>
                </div>
              </div>

              {(customerPhoneInput || selectedCustomer || isNewCustomerActive) && (
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 transition"
                  title="Reset to Walk-in Customer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset / Walk-in</span>
                </button>
              )}
            </div>

            {/* Quick Phone Number Input (Entry point) */}
            <div className="relative">
              <input
                type="tel"
                value={customerPhoneInput}
                onChange={(e) => handlePhoneInputChange(e.target.value)}
                placeholder="Enter Customer Mobile / Phone No (e.g. 9876543210)"
                maxLength={10}
                className={`w-full px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all focus:outline-none ${
                  selectedCustomer
                    ? 'bg-emerald-50/70 border-emerald-400 text-emerald-950 pr-24'
                    : isNewCustomerActive
                    ? 'bg-amber-50/70 border-amber-400 text-amber-950 pr-24 focus:ring-1 focus:ring-amber-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                }`}
              />
              {selectedCustomer && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded shadow-2xs">
                  ✓ VERIFIED
                </span>
              )}
              {isNewCustomerActive && !selectedCustomer && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded shadow-2xs">
                  + NEW CUSTOMER
                </span>
              )}
            </div>

            {/* If Customer Matched in Database: Auto-selected banner */}
            {selectedCustomer && (
              <div className="text-[11px] bg-emerald-50 border border-emerald-200 rounded-md p-2 flex items-center justify-between text-emerald-900">
                <div className="truncate mr-2">
                  <span className="font-bold">{selectedCustomer.name}</span>
                  {selectedCustomer.address && (
                    <span className="text-slate-600 ml-1.5 text-[10px]">
                      · {selectedCustomer.address}
                    </span>
                  )}
                  {selectedCustomer.gstin && (
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1 py-0.5 rounded font-mono ml-1.5">
                      GSTIN: {selectedCustomer.gstin}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-emerald-700 shrink-0">
                  Auto-populated
                </span>
              </div>
            )}

            {/* If Phone Entered but NOT Matched in Database: Automatically reveal Name & Address fields */}
            {isNewCustomerActive && !selectedCustomer && (
              <div className="bg-amber-50/90 border border-amber-300 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-amber-900">
                    New Customer (Phone not found in DB)
                  </span>
                  <span className="font-semibold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                    Auto-saves on billing
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Customer Name *"
                      required
                      className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white font-semibold text-slate-900 placeholder:text-amber-900/60"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newCustomerAddress}
                      onChange={(e) => setNewCustomerAddress(e.target.value)}
                      placeholder="Customer Address (Area / Colony)"
                      className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white font-medium text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-amber-800 font-medium">
                  * Name & Phone No are mandatory.
                </p>
              </div>
            )}
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Barcode className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-700">Current Bill is Empty</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Scan a barcode or select products on the left to start billing.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-2 text-right">Price</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 leading-tight">
                          {item.product_name}
                        </div>
                        {(item.batch_number || item.expiry_date) && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.batch_number && (
                              <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                Lot: {item.batch_number}
                              </span>
                            )}
                            {item.expiry_date && (
                              <span className="text-[9px] px-1 py-0.2 bg-amber-50 text-amber-800 rounded border border-amber-200">
                                Exp: {item.expiry_date}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>₹{item.unit_price.toFixed(2)} / {item.unit}</span>
                          {item.gst_rate > 0 && <span>· GST {item.gst_rate}%</span>}
                          {item.hsn_code && <span>· HSN {item.hsn_code}</span>}
                          {['Kg', 'Gram', 'Litre', 'ML', 'Quintal (Qtl)'].includes(item.unit) && (
                            <button
                              type="button"
                              onClick={() => handleOpenWeightModal(index)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold transition cursor-pointer"
                              title="Select weight preset (25g to 10kg) or ₹ to weight"
                            >
                              <Scale className="w-3 h-3 text-emerald-600" />
                              {item.quantity < 1
                                ? `${Math.round(item.quantity * 1000)} gm`
                                : `${item.quantity} ${item.unit}`}
                              <span className="font-normal text-emerald-600">(Change Wt / ₹)</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Qty Controls */}
                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center border border-slate-200 rounded-md bg-white">
                          <button
                            type="button"
                            onClick={() => handleQuantityStep(index, 'down')}
                            className="p-1 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            max={item.current_stock}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) {
                                updateItemQuantity(index, val);
                              }
                            }}
                            className="w-14 text-center text-xs font-bold text-slate-900 focus:outline-none px-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityStep(index, 'up')}
                            className="p-1 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right font-medium text-slate-600">
                        ₹{item.unit_price.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        ₹{(item.quantity * item.unit_price).toFixed(2)}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => removeItemFromCart(index)}
                          className="text-slate-300 hover:text-red-600 p-1 transition-colors cursor-pointer"
                          title="Remove line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bill Calculation & Payment Panel (Pinned to bottom) */}
          <div className="bg-slate-50 border-t border-slate-200 p-4 space-y-3 shrink-0">
            {/* Calculation Lines */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({calculations.totalItemsCount} items):</span>
                <span className="font-semibold text-slate-800">
                  ₹{calculations.subtotal.toFixed(2)}
                </span>
              </div>

              {/* Discount Input */}
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  max={calculations.subtotal}
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-24 text-right text-xs px-2 py-0.5 bg-white border border-slate-300 rounded font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {calculations.totalTax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax / GST:</span>
                  <span className="font-semibold text-slate-800">
                    ₹{calculations.totalTax.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Round Off */}
              <div className="flex justify-between text-slate-600">
                <span>Round Off:</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {calculations.roundOff > 0
                    ? `+₹${calculations.roundOff.toFixed(2)}`
                    : calculations.roundOff < 0
                    ? `-₹${Math.abs(calculations.roundOff).toFixed(2)}`
                    : '₹0.00'}
                </span>
              </div>

              {/* Grand Total */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-300">
                <span className="text-sm font-black text-slate-900">GRAND TOTAL:</span>
                <span className="text-xl font-black text-emerald-800">
                  {formatCurrency(calculations.grandTotal)}
                </span>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div className="pt-2 border-t border-slate-200">
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMode === 'CASH'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  CASH
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMode === 'UPI'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  UPI
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('CARD')}
                  className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMode === 'CARD'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  CARD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('SPLIT');
                    if (!splitCash && !splitUpi && !splitCard) {
                      setSplitCash(Math.floor(calculations.grandTotal / 2).toString());
                      setSplitUpi((calculations.grandTotal - Math.floor(calculations.grandTotal / 2)).toString());
                    }
                  }}
                  className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMode === 'SPLIT'
                      ? 'bg-purple-800 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  <Split className="w-3.5 h-3.5" />
                  SPLIT
                </button>
              </div>

              {/* Split Multi-Tender Breakdown */}
              {paymentMode === 'SPLIT' && (
                <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-2.5 space-y-2 text-xs mb-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-purple-900 uppercase tracking-wider">
                      Split Tender (Cash + UPI / Card)
                    </span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      splitTotals.isSufficient
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {splitTotals.isSufficient
                        ? 'Tender Complete'
                        : `Short: ₹${splitTotals.remaining.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Cash (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        className="w-full text-right text-xs font-bold px-2 py-1 bg-white border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">UPI (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={splitUpi}
                        onChange={(e) => setSplitUpi(e.target.value)}
                        className="w-full text-right text-xs font-bold px-2 py-1 bg-white border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Card (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={splitCard}
                        onChange={(e) => setSplitCard(e.target.value)}
                        className="w-full text-right text-xs font-bold px-2 py-1 bg-white border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-purple-200">
                    <span className="text-slate-600 font-medium">
                      Tendered: <strong>₹{splitTotals.totalTendered.toFixed(2)}</strong> / {formatCurrency(calculations.grandTotal)}
                    </span>
                    {splitTotals.remaining > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const rem = splitTotals.remaining;
                          const currentUpi = parseFloat(splitUpi) || 0;
                          setSplitUpi((currentUpi + rem).toString());
                        }}
                        className="text-[10px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        + Add ₹{splitTotals.remaining.toFixed(2)} to UPI
                      </button>
                    ) : (
                      <span className="text-emerald-700 font-bold">✓ Full Amount Covered</span>
                    )}
                  </div>
                </div>
              )}

              {/* Cash Tendered & Change Breakdown */}
              {paymentMode === 'CASH' && (
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">Cash Received:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder="0.00"
                        className="w-28 text-right font-black text-sm px-2 py-1 bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Cash Quick Tender Chips */}
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSetExactCash}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Exact
                    </button>
                    {[50, 100, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleAddCashPreset(amt)}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>

                  {/* Change to return */}
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                    <span className="font-bold text-slate-600">Change to Return:</span>
                    <span
                      className={`text-sm font-black ${
                        calculations.isCashSufficient
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }`}
                    >
                      {calculations.isCashSufficient
                        ? `₹${calculations.changeToReturn.toFixed(2)}`
                        : 'Short Cash'}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI Instant QR Banner */}
              {paymentMode === 'UPI' && (
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 space-y-1.5 text-xs mb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-900 flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-purple-600" />
                      Dynamic UPI QR
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsUpiModalOpen(true)}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-95 rounded-md shadow-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <QrCode className="w-3 h-3" />
                      Show QR Code
                    </button>
                  </div>
                  <p className="text-[11px] text-purple-700">
                    Customer can scan QR to pay {formatCurrency(calculations.grandTotal)} instantly via GPay / PhonePe / Paytm / BHIM.
                  </p>
                </div>
              )}

              {/* UPI / Card Reference Notes */}
              {paymentMode !== 'CASH' && (
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder={`${paymentMode} Reference / Transaction ID (Optional)`}
                  className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              )}
            </div>

            {/* Complete Sale Button */}
            <Button
              variant="primary"
              size="lg"
              className="w-full justify-center text-base py-3 shadow-md"
              icon={<CheckCircle className="w-5 h-5" />}
              disabled={isSubmitting || cart.length === 0 || (paymentMode === 'CASH' && !calculations.isCashSufficient)}
              onClick={handleCompleteSale}
            >
              {isSubmitting
                ? 'Processing Sale...'
                : `Complete Sale (${formatCurrency(calculations.grandTotal)})`}
            </Button>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* MODAL: Customer Selector                             */}
      {/* ==================================================== */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="Select Customer for Bill"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                placeholder="Search customer by name or phone..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={<UserPlus className="w-4 h-4" />}
              onClick={() => setIsQuickAddCustomerOpen(true)}
            >
              New
            </Button>
          </div>

          {/* Quick Select: Walk-in */}
          <div
            onClick={() => {
              setSelectedCustomer(null);
              setIsCustomerModalOpen(false);
            }}
            className="p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer flex items-center justify-between transition-colors"
          >
            <div>
              <h4 className="text-sm font-bold text-slate-900">Walk-in Customer</h4>
              <p className="text-xs text-slate-500">Regular counter purchase without customer account</p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
              Default
            </span>
          </div>

          {/* Results list */}
          <div className="max-h-60 overflow-y-auto space-y-2">
            {customerSearchResults.map((cust) => (
              <div
                key={cust.id}
                onClick={() => {
                  setSelectedCustomer(cust);
                  setIsCustomerModalOpen(false);
                }}
                className="p-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer flex items-center justify-between transition-colors"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{cust.name}</h4>
                  <p className="text-xs text-slate-500">Ph: {cust.phone || 'No phone'}</p>
                </div>
                <Button variant="secondary" size="sm">
                  Select
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL: Quick Add Customer                            */}
      {/* ==================================================== */}
      <Modal
        isOpen={isQuickAddCustomerOpen}
        onClose={() => setIsQuickAddCustomerOpen(false)}
        title="Quick Add Customer"
        maxWidth="sm"
      >
        <form onSubmit={handleQuickAddCustomer} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number (10 Digits)
            </label>
            <input
              type="text"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer GSTIN (Optional, for B2B)
            </label>
            <input
              type="text"
              maxLength={15}
              value={newCustGstin}
              onChange={(e) => setNewCustGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 19ABCDE1234F1Z5"
              className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Address (Optional)
            </label>
            <input
              type="text"
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              placeholder="e.g. Flat 4B, Hill Road"
              className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={() => setIsQuickAddCustomerOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Save & Select
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL: Discard Cart Confirmation                     */}
      {/* ==================================================== */}
      <Modal
        isOpen={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Discard Current Bill?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You currently have <strong>{cart.length} item(s)</strong> in this bill.
            Are you sure you want to discard this bill and start fresh?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setDiscardConfirmOpen(false)}
            >
              Keep Editing
            </Button>
            <Button variant="danger" size="md" onClick={resetBill}>
              Discard Bill
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL: Recent Sales History & Reprint                */}
      {/* ==================================================== */}
      <Modal
        isOpen={isRecentSalesOpen}
        onClose={() => setIsRecentSalesOpen(false)}
        title="Recent Bills / Counter History"
        maxWidth="lg"
      >
        <div className="space-y-3">
          {recentSales.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No recent sales recorded yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {recentSales.map((s) => (
                <div
                  key={s.id}
                  className="py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {s.invoice_number}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {s.payment_mode}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {s.customer_name || 'Walk-in'} · {s.created_at}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-900">
                      {formatCurrency(s.total_amount)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Printer className="w-3.5 h-3.5" />}
                      onClick={() => handleReprintSale(s.invoice_number)}
                    >
                      View & Print
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL: Indian Kirana Weight Preset & Reverse Calc    */}
      {/* ==================================================== */}
      {weightModalIndex !== null && cart[weightModalIndex] && (
        <WeightSelectorModal
          isOpen={isWeightModalOpen}
          onClose={() => {
            setIsWeightModalOpen(false);
            setWeightModalIndex(null);
          }}
          item={cart[weightModalIndex]}
          onApply={handleApplyWeight}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: Dynamic NPCI UPI QR Code Modal                */}
      {/* ==================================================== */}
      <UpiQrModal
        isOpen={isUpiModalOpen}
        onClose={() => setIsUpiModalOpen(false)}
        upiId={shopProfile.shop_upi_id}
        shopName={shopProfile.shop_name}
        amount={calculations.grandTotal}
        invoiceNumber="COUNTER"
        onPaymentConfirmed={handleCompleteSale}
      />

      {/* ==================================================== */}
      {/* MODAL: Parked / Held Bills Queue (P1.1)              */}
      {/* ==================================================== */}
      <ParkedBillsModal
        isOpen={isParkedModalOpen}
        onClose={() => setIsParkedModalOpen(false)}
        parkedBills={parkedBills}
        onResume={handleResumeParkedBill}
        onDiscard={handleDiscardParkedBill}
      />

      {/* ==================================================== */}
      {/* MODAL: Active Cart Conflict Prompt on Resume         */}
      {/* ==================================================== */}
      {parkConfirmPrompt && (
        <Modal
          isOpen={true}
          onClose={() => setParkConfirmPrompt(null)}
          title="Active Cart on Counter"
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              There are currently <strong>{cart.length} item(s)</strong> in the counter cart.
              How would you like to resume <strong>Hold #{parkConfirmPrompt.token_number}</strong>?
            </p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleParkCurrentAndResumeHeld(parkConfirmPrompt)}
                className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition text-left flex items-center justify-between"
              >
                <span>Hold current cart & restore #{parkConfirmPrompt.token_number}</span>
                <span className="text-[10px] bg-amber-700 px-2 py-0.5 rounded">Safe</span>
              </button>
              <button
                type="button"
                onClick={() => executeResumeBill(parkConfirmPrompt)}
                className="w-full py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-lg transition text-left flex items-center justify-between"
              >
                <span>Discard current cart & restore #{parkConfirmPrompt.token_number}</span>
                <span className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded">Discard Current</span>
              </button>
              <button
                type="button"
                onClick={() => setParkConfirmPrompt(null)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================================================== */}
      {/* MODAL: Expired Product Scan Warning Modal (P3.4)     */}
      {/* ==================================================== */}
      {expiredPromptProduct && (
        <Modal
          isOpen={true}
          onClose={() => setExpiredPromptProduct(null)}
          title="⚠️ Expired Product Alert"
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Product has passed expiration date!</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                <strong>"{expiredPromptProduct.name}"</strong> has an expired shelf-life date of{' '}
                <span className="font-mono font-bold underline">{expiredPromptProduct.expiry_date}</span>.
              </p>
              {expiredPromptProduct.batch_number && (
                <p className="text-[10px] text-rose-700 font-mono">
                  Batch / Lot Code: {expiredPromptProduct.batch_number}
                </p>
              )}
            </div>

            <p className="text-slate-600 text-[11px] leading-relaxed">
              Under FSSAI & consumer protection regulations, selling expired food/FMCG items is prohibited.
              Do you wish to cancel this item or perform an intentional cashier override?
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setExpiredPromptProduct(null)}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-center shadow-xs cursor-pointer"
              >
                ✓ Cancel & Return to Shelf (Recommended)
              </button>
              <button
                type="button"
                onClick={() => {
                  const prod = expiredPromptProduct;
                  setExpiredPromptProduct(null);
                  doAddProductToCart(prod);
                }}
                className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition text-center border border-slate-300 cursor-pointer"
              >
                Override & Add to Bill Anyway
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};


