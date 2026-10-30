import React from 'react';
import { Leaf, Sparkles } from 'lucide-react';
import { useCalmMode } from '../../utils/calmMode';

export const CalmToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [calm, setCalm] = useCalmMode();
  return (
    <button
      type="button"
      onClick={() => setCalm(!calm)}
      aria-pressed={calm}
      aria-label={calm ? 'Calm mode on. Click to turn animations back on' : 'Turn on calm mode (stop decorative animations)'}
      title={calm ? 'Calm mode: ON (animations off)' : 'Calm mode: OFF'}
      className={`flex items-center space-x-1.5 rounded-full border text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
        compact ? 'p-2' : 'px-2.5 py-1.5'
      } ${
        calm
          ? 'bg-[#151B38] border-[#4ADE80]/50 text-[#4ADE80]'
          : 'bg-[#0E1326] border-[#D4A84B]/40 text-[#D4A84B] hover:border-[#D4A84B]'
      }`}
    >
      {calm ? <Leaf className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
      {!compact && <span>{calm ? 'CALM' : 'MOTION'}</span>}
    </button>
  );
};
