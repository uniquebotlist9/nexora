'use client';

import * as React from 'react';
import { cn } from '@nexora/ui';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Styled native range input (keyboard accessible by default). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  id,
  disabled,
  className,
}: SliderProps) {
  return (
    <input
      type="range"
      id={id}
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-foreground/25 accent-primary focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow',
        '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary',
        className,
      )}
    />
  );
}
