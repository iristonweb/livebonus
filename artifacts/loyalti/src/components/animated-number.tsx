import { useEffect, useRef } from "react";
import { useInView, useSpring, useTransform, motion } from "framer-motion";

export function AnimatedNumber({ 
  value, 
  format 
}: { 
  value: number; 
  format?: (v: number) => string 
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const spring = useSpring(0, { stiffness: 60, damping: 20, mass: 1 });
  
  useEffect(() => {
    if (inView) {
      spring.set(value);
    }
  }, [inView, value, spring]);

  const display = useTransform(spring, (current) => 
    format ? format(current) : new Intl.NumberFormat("ru-RU").format(Math.round(current))
  );

  return <motion.span ref={ref}>{display}</motion.span>;
}
