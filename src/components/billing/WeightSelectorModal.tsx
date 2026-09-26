import React, { useState, useEffect, useId } from 'react';
import { Scale, IndianRupee, X, Check, Calculator, RefreshCw, Power, Radio, Zap } from 'lucide-react';
import type { CartItem } from '../../types';
import { weighingScaleService, type ScaleReading, type ScaleConnectionStatus } from '../../services/weighingScaleService';

interface WeightSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CartItem | null;
  onApply: (newQuantity: number) => void;
}

// Common Indian retail grocery presets
const WEIGHT_PRESETS = [
  { label: '25g', grams: 25, kg: 0.025, subtitle: '25 gm' },
  { label: '50g', grams: 50, kg: 0.05, subtitle: '50 gm' },
  { label: '100g', grams: 100, kg: 0.1, subtitle: '100 gm' },
  { label: '200g', grams: 200, kg: 0.2, subtitle: '200 gm' },
  { label: '250g', grams: 250, kg: 0.25, subtitle: '1 Pav' },
  { label: '500g', grams: 500, kg: 0.5, subtitle: '1/2 Kilo' },
  { label: '1 kg', grams: 1000, kg: 1.0, subtitle: '1 Kilo' },
  { label: '2 kg', grams: 2000, kg: 2.0, subtitle: '2 Kilo' },
  { label: '5 kg', grams: 5000, kg: 5.0, subtitle: '5 Kilo' },
  { label: '10 kg', grams: 10000, kg: 10.0, subtitle: '10 Kilo' },
];

const RUPEE_PRESETS = [10, 20, 30, 50, 100, 200, 500];

export const WeightSelectorModal: React.FC<WeightSelectorModalProps> = ({
  isOpen,
  onClose,
  item,
  onApply,
}) => {
  const [activeTab, setActiveTab] = useState<'scale' | 'weight' | 'reverse'>('scale');
  const [quantityKg, setQuantityKg] = useState<number>(1);
  const [gramsInput, setGramsInput] = useState<string>('1000');
  const [reverseRupees, setReverseRupees] = useState<string>('50');

  // Scale states
  const [scaleReading, setScaleReading] = useState<ScaleReading>(weighingScaleService.getLatestReading());
  const [scaleStatus, setScaleStatus] = useState<ScaleConnectionStatus>(weighingScaleService.getStatus());
  const [scaleError, setScaleError] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(weighingScaleService.getConfig().simulationMode);

  const gramsInputId = useId();
  const kgInputId = useId();
  const reverseRupeesInputId = useId();

  // Subscribe to weighing scale streams
  useEffect(() => {
    const unsubWeight = weighingScaleService.onWeightChange((reading) => {
      setScaleReading(reading);
      if (activeTab === 'scale' && reading.weightKg > 0) {
        setQuantityKg(reading.weightKg);
        setGramsInput(Math.round(reading.weightKg * 1000).toString());
      }
    });

    const unsubStatus = weighingScaleService.onStatusChange((status, err) => {
      setScaleStatus(status);
      setScaleError(err || '');
    });

    return () => {
      unsubWeight();
      unsubStatus();
    };
  }, [activeTab]);

  useEffect(() => {
    if (item && isOpen) {
      const q = item.quantity > 0 ? item.quantity : 1;
      setQuantityKg(q);
      setGramsInput(Math.round(q * 1000).toString());
      if (item.unit_price > 0) {
        setReverseRupees(Math.round(q * item.unit_price).toString());
      }
    }
  }, [item, isOpen]);

  const handleConnectScale = async () => {
    if (scaleStatus === 'connected') {
      await weighingScaleService.disconnect();
    } else {
      await weighingScaleService.connect();
    }
  };

  const handleTareScale = () => {
    weighingScaleService.tare();
  };

  const handleSimulateWeight = (kg: number) => {
    weighingScaleService.setSimulatedWeight(kg);
    setQuantityKg(kg);
    setGramsInput(Math.round(kg * 1000).toString());
  };

  const handleToggleSimulation = () => {
    const nextVal = !isSimulating;
    setIsSimulating(nextVal);
    weighingScaleService.saveConfig({ simulationMode: nextVal });
    if (nextVal) {
      weighingScaleService.setSimulatedWeight(1.250);
      setQuantityKg(1.250);
    }
  };

  if (!isOpen || !item) return null;

  const unit = item.unit || 'Kg';
  const unitPrice = item.unit_price || 0;
  const calculatedTotal = Math.round(quantityKg * unitPrice * 100) / 100;

  // Handle Preset Click
  const handlePresetClick = (kgVal: number) => {
    setQuantityKg(kgVal);
    setGramsInput(Math.round(kgVal * 1000).toString());
  };

  // Handle Grams Direct Input
  const handleGramsChange = (valStr: string) => {
    setGramsInput(valStr);
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantityKg(Math.round((parsed / 1000) * 1000) / 1000);
    }
  };

  // Handle Kg Direct Input
  const handleKgChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed >= 0) {
      setQuantityKg(parsed);
      setGramsInput(Math.round(parsed * 1000).toString());
    }
  };

  // Step quantity by grams delta
  const handleStep = (deltaGrams: number) => {
    const currentGrams = Math.round(quantityKg * 1000);
    const newGrams = Math.max(25, currentGrams + deltaGrams);
    const newKg = Math.round((newGrams / 1000) * 1000) / 1000;
    setQuantityKg(newKg);
    setGramsInput(newGrams.toString());
  };

  // Handle Reverse Price to Weight (₹ to Weight)
  const handleReverseAmountChange = (valStr: string) => {
    setReverseRupees(valStr);
    const rupees = parseFloat(valStr);
    if (!isNaN(rupees) && rupees > 0 && unitPrice > 0) {
      const computedKg = Math.round((rupees / unitPrice) * 1000) / 1000;
      setQuantityKg(computedKg);
      setGramsInput(Math.round(computedKg * 1000).toString());
    }
  };

  const handleReversePreset = (rupees: number) => {
    setReverseRupees(rupees.toString());
    if (unitPrice > 0) {
      const computedKg = Math.round((rupees / unitPrice) * 1000) / 1000;
      setQuantityKg(computedKg);
      setGramsInput(Math.round(computedKg * 1000).toString());
    }
  };

  const handleApply = () => {
    if (quantityKg > 0) {
      onApply(quantityKg);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weight-selector-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id="weight-selector-title" className="text-base font-bold text-slate-900 dark:text-white">
                {item.product_name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rate: ₹{unitPrice.toFixed(2)} per {unit} • Stock: {item.current_stock} {unit}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close weight selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 mx-6 mt-4 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('scale')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'scale'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            Electronic Scale
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weight')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'weight'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Weight Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reverse')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'reverse'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            ₹ to Weight
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {activeTab === 'scale' && (
            <div className="space-y-4">
              {/* Digital LED 7-Segment Weight Display */}
              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 shadow-inner flex flex-col items-center justify-center relative">
                <div className="w-full flex items-center justify-between text-[11px] mb-2 px-1">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${scaleStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    {scaleStatus === 'connected' ? 'COM PORT CONNECTED (9600 8-N-1)' : isSimulating ? 'SIMULATION MODE' : 'OFFLINE / DISCONNECTED'}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                    {scaleReading.isStable ? '● STABLE' : '○ MOTION'}
                  </span>
                </div>

                {/* Big Digital Readout */}
                <div className="py-2 flex items-baseline gap-3">
                  <span className="font-mono text-5xl font-black tracking-widest text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                    {scaleReading.weightKg.toFixed(3)}
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-600 uppercase">
                    Kg
                  </span>
                </div>

                <div className="mt-2 text-xs font-mono text-slate-400">
                  Rate: ₹{unitPrice.toFixed(2)}/kg • Net: <strong className="text-white">₹{(scaleReading.weightKg * unitPrice).toFixed(2)}</strong>
                </div>

                {scaleError && (
                  <div className="mt-2 text-[11px] text-amber-400 bg-amber-950/40 px-3 py-1 rounded border border-amber-800/40">
                    {scaleError}
                  </div>
                )}
              </div>

              {/* Hardware / Scale Actions Row */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectScale}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    scaleStatus === 'connected'
                      ? 'border-red-300 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                      : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {scaleStatus === 'connected' ? 'Disconnect COM' : 'Connect Scale Port'}
                </button>
                <button
                  type="button"
                  onClick={handleTareScale}
                  className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Zero / Tare
                </button>
                <button
                  type="button"
                  onClick={handleToggleSimulation}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    isSimulating
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {isSimulating ? 'Sim Active' : 'Sim Mode'}
                </button>
              </div>

              {/* Simulation Quick Weights (when simulation is active or no physical scale) */}
              {isSimulating && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-semibold text-slate-500 mb-2">
                    Test Weights on Scale:
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.100, 0.250, 0.500, 1.000, 2.500].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => handleSimulateWeight(w)}
                        className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                          Math.abs(scaleReading.weightKg - w) < 0.001
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {w >= 1 ? `${w}kg` : `${w * 1000}g`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'weight' ? (
            <>
              {/* Quick Preset Chips */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Indian Kirana Weight Presets
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {WEIGHT_PRESETS.map((p) => {
                    const isSelected = Math.abs(quantityKg - p.kg) < 0.001;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handlePresetClick(p.kg)}
                        className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold leading-tight">{p.label}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                          {p.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Direct Input Inputs (Grams and Kg) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <label htmlFor={gramsInputId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Direct Grams (gm)
                  </label>
                  <div className="relative">
                    <input
                      id={gramsInputId}
                      type="number"
                      step="1"
                      min="1"
                      value={gramsInput}
                      onChange={(e) => handleGramsChange(e.target.value)}
                      className="w-full text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 pr-8 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">g</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <label htmlFor={kgInputId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kilograms ({unit})
                  </label>
                  <div className="relative">
                    <input
                      id={kgInputId}
                      type="number"
                      step="0.025"
                      min="0.001"
                      value={quantityKg}
                      onChange={(e) => handleKgChange(e.target.value)}
                      className="w-full text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 pr-8 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">{unit}</span>
                  </div>
                </div>
              </div>

              {/* Quick Stepper Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStep(-25)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    -25g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(-50)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    -50g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(-100)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    -100g
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStep(25)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    +25g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(50)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    +50g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(100)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    +100g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(500)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    +500g
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ₹ Amount to Weight Reverse Calculator */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs mb-1">
                    <Calculator className="w-4 h-4" />
                    How much rupee worth does customer want?
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Example: Customer says &ldquo;₹20 ka jeera de do&rdquo; — enter 20 below.
                  </p>
                </div>

                <div>
                  <label htmlFor={reverseRupeesInputId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Target Rupee Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-base font-bold text-slate-400">₹</span>
                    <input
                      id={reverseRupeesInputId}
                      type="number"
                      step="1"
                      min="1"
                      value={reverseRupees}
                      onChange={(e) => handleReverseAmountChange(e.target.value)}
                      className="w-full text-2xl font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="e.g. 20, 50, 100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Quick Rupee Amounts:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RUPEE_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleReversePreset(amt)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                          reverseRupees === amt.toString()
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reverse Calculation result badge */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Calculated Weight:</span>
                    <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                      {Math.round(quantityKg * 1000)} grams
                      <span className="text-xs font-medium text-slate-500 ml-2">({quantityKg} {unit})</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Total Price:</span>
                    <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      ₹{calculatedTotal.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Real-time Summary Card */}
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider">
                Cart Weight
              </span>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {quantityKg >= 1 ? `${quantityKg} ${unit}` : `${Math.round(quantityKg * 1000)} gm`}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider">
                Total Price
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                ₹{calculatedTotal.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-lg shadow-emerald-600/20 transition"
          >
            <Check className="w-4 h-4" />
            Apply {quantityKg >= 1 ? `${quantityKg} ${unit}` : `${Math.round(quantityKg * 1000)} gm`} (₹{calculatedTotal.toFixed(2)})
          </button>
        </div>
      </div>
    </div>
  );
};
