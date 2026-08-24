import { type FC, useEffect, useRef, useState } from 'react';

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}

const defaultFormat = (n: number) => n.toLocaleString('pt-BR');

export const AnimatedNumber: FC<AnimatedNumberProps> = ({
  value,
  duration = 600,
  format = defaultFormat,
}) => {
  const [displayed, setDisplayed] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const t0 = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (k < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(displayed)}</>;
};
