import React, { useEffect, useRef, useState } from 'react';
import { Text, TextProps } from 'react-native';

/**
 * Count-up number display.
 *
 * Renders at a bounded ~12 fps instead of per-frame React state updates:
 * the rAF loop tracks precise progress, but setState only fires when the
 * displayed (rounded) value actually changes AND a minimum interval has
 * elapsed — keeping React render pressure low during entry animations.
 */
export function AnimatedNumber({
  value,
  formatter = (v) => v.toString(),
  duration = 1000,
  style
}: {
  value: number;
  formatter?: (v: number) => string;
  duration?: number;
  style?: TextProps['style']
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const MIN_UPDATE_INTERVAL = 80; // ms → ~12 updates/sec
    let startTimestamp: number | null = null;
    let lastUpdate = 0;
    let animationFrameId: number;
    const startValue = displayRef.current;
    const change = value - startValue;

    if (change === 0) return;

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      const next = Math.round(startValue + change * ease);

      if (progress >= 1) {
        displayRef.current = value;
        setDisplayValue(value);
        return;
      }

      if (timestamp - lastUpdate >= MIN_UPDATE_INTERVAL && next !== displayRef.current) {
        lastUpdate = timestamp;
        displayRef.current = next;
        setDisplayValue(next);
      }
      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [value, duration]);

  return <Text style={style}>{formatter(displayValue)}</Text>;
}
