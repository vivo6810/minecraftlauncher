import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "framer-motion";
import "./SquishSwitch.css";

const travel = 20;
const clamp = (x: number) => Math.min(travel, Math.max(0, x));

export function SquishSwitch({ checked, onChange, label }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(checked ? travel : 0);
  const flow = useSpring(useVelocity(x), { stiffness: 320, damping: 40, mass: 0.6 });
  const swell = useSpring(1, { stiffness: 520, damping: 34, mass: 0.6 });
  const [held, setHeld] = useState(false);
  const grip = useRef<{ id: number; start: number; offset: number; moved: boolean } | null>(null);
  const stretch = (velocity: number) => reduce ? 1 : 1 + Math.min(0.4, Math.abs(velocity) / 600) * 0.36;
  const scaleX = useTransform([flow, swell], ([velocity, scale]: number[]) => stretch(velocity) * scale);
  const scaleY = useTransform([flow, swell], ([velocity, scale]: number[]) => scale / stretch(velocity));

  useEffect(() => {
    if (held) return;
    const target = checked ? travel : 0;
    if (reduce) {
      x.jump(target);
      return;
    }
    const animation = animate(x, target, { type: "spring", stiffness: 170, damping: 21.5, mass: 0.9 });
    return () => animation.stop();
  }, [checked, held, reduce, x]);

  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = grip.current;
    if (!current || current.id !== event.pointerId) return;
    grip.current = null;
    setHeld(false);
    if (!cancelled && current.moved) {
      const next = x.get() > travel / 2;
      if (next !== checked) onChange(next);
    }
  };

  return (
    <button type="button" role="switch" aria-label={label} aria-checked={checked} className="squish-switch"
      data-on={checked ? "" : undefined} data-held={held ? "" : undefined}
      onClick={event => {
        // Pointer release handles the gesture. Keyboard and assistive clicks have detail 0.
        if (event.detail === 0) onChange(!checked);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || grip.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        x.stop();
        grip.current = { id: event.pointerId, start: event.clientX, offset: x.get(), moved: false };
        setHeld(true);
      }}
      onPointerMove={event => {
        const current = grip.current;
        if (!current || current.id !== event.pointerId) return;
        const delta = event.clientX - current.start;
        if (!current.moved && Math.abs(delta) < (event.pointerType === "touch" ? 8 : 4)) return;
        current.moved = true;
        x.set(clamp(current.offset + delta));
      }}
      onPointerUp={event => {
        const tap = grip.current?.id === event.pointerId && !grip.current.moved;
        finish(event);
        if (tap) onChange(!checked);
      }}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
      onKeyDown={event => {
        if (event.key !== "Escape" || !grip.current) return;
        const { id } = grip.current;
        grip.current = null;
        setHeld(false);
        if (event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id);
      }}
      onPointerEnter={event => { if (!reduce && event.pointerType === "mouse") swell.set(1.035); }}
      onPointerLeave={() => swell.set(1)}
    >
      <span className="squish-switch__track">
        <motion.span className="squish-switch__thumb" aria-hidden="true" style={{ x, scaleX, scaleY }} />
      </span>
    </button>
  );
}
