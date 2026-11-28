import { useLayoutEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import "./RubberSegment.css";

const spring = { type: "spring", duration: 0.3, bounce: 0 } as const;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function RubberSegment<T extends string>({ items, value, onChange, label, disabled }: {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const index = Math.max(0, items.findIndex(item => item.value === value));
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const slots = useRef<{ left: number; right: number }[]>([]);
  const gesture = useRef<{ id: number; start: number; left: number; width: number; last: number; time: number; speed: number; moved: boolean } | null>(null);
  const generation = useRef(0);
  const reduce = useReducedMotion();
  const left = useMotionValue(0);
  const right = useMotionValue(0);
  const width = useMotionValue(0);
  const clipPath = useTransform(() =>
    `inset(0 ${Math.max(0, width.get() - right.get())}px 0 ${Math.max(0, left.get())}px round 9px)`
  );

  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      slots.current = buttons.current.map(button => ({
        left: (button?.offsetLeft ?? 3) - 3,
        right: (button?.offsetLeft ?? 3) + (button?.offsetWidth ?? 0) - 3,
      }));
      const nextWidth = element.clientWidth - 6;
      const resized = nextWidth !== width.get();
      width.set(nextWidth);
      const slot = slots.current[index];
      if (slot && !gesture.current && resized) {
        generation.current++;
        left.jump(slot.left);
        right.jump(slot.right);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [index, left, right, width]);

  const land = (next: number, stretch = false, velocity = 0) => {
    const slot = slots.current[next];
    if (!slot) return;
    const run = ++generation.current;
    left.stop();
    right.stop();
    if (reduce) {
      left.jump(slot.left);
      right.jump(slot.right);
      return;
    }
    const forward = slot.left >= left.get();
    const lead = forward ? right : left;
    const tail = forward ? left : right;
    const leadTarget = forward ? slot.right : slot.left;
    const tailTarget = forward ? slot.left : slot.right;
    const settle = () => {
      if (generation.current !== run) return;
      animate(lead, leadTarget, { ...spring, velocity, bounce: velocity ? 0.2 : 0 });
      animate(tail, tailTarget + (stretch ? (forward ? 3 : -3) : 0), spring).then(() => {
        if (stretch && generation.current === run) animate(tail, tailTarget, { ...spring, duration: 0.16 });
      });
    };
    if (stretch) animate(lead, leadTarget, { duration: 0.15, ease: [0.23, 1, 0.32, 1] }).then(settle);
    else settle();
  };

  useLayoutEffect(() => {
    land(index, true);
    return () => { generation.current++; left.stop(); right.stop(); };
  }, [index, reduce]);

  const choose = (next: number) => {
    if (next === index) land(index);
    else onChange(items[next].value);
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.id) return;
    gesture.current = null;
    delete event.currentTarget.dataset.held;
    if (cancelled || !drag.moved) {
      land(index);
      return;
    }
    const velocity = event.timeStamp - drag.time < 100 ? clamp(drag.speed, -2000, 2000) : 0;
    const target = (left.get() + right.get()) / 2 + velocity * 0.13;
    const next = slots.current.reduce((best, slot, i, all) =>
      Math.abs((slot.left + slot.right) / 2 - target) <
      Math.abs((all[best].left + all[best].right) / 2 - target) ? i : best, index);
    land(index, false, velocity);
    if (next !== index) onChange(items[next].value);
  };

  return (
    <div ref={track} className="rubber-segment" role="radiogroup" aria-label={label} aria-disabled={disabled}
      onPointerMove={event => {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId) return;
        const delta = event.clientX - drag.start;
        if (!drag.moved && Math.abs(delta) < 4) return;
        drag.moved = true;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.currentTarget.dataset.held = "";
        if (event.timeStamp > drag.time) drag.speed = (event.clientX - drag.last) * 1000 / (event.timeStamp - drag.time);
        drag.time = event.timeStamp;
        drag.last = event.clientX;
        const max = Math.max(0, width.get() - drag.width);
        const raw = drag.left + delta;
        const edge = clamp(raw, 0, max);
        const over = raw - edge;
        const compression = reduce ? 0 : over * drag.width * 0.55 / (drag.width + 0.55 * Math.abs(over));
        left.set(edge + Math.max(0, compression));
        right.set(edge + drag.width + Math.min(0, compression));
      }}
      onPointerUp={event => finish(event)}
      onPointerLeave={event => { if (!gesture.current?.moved) finish(event, true); }}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
    >
      {items.map((item, i) => (
        <button key={item.value} ref={node => { buttons.current[i] = node; }} type="button"
          role="radio" aria-checked={i === index} tabIndex={i === index ? 0 : -1} disabled={disabled}
          className="rubber-segment__item" onClick={() => choose(i)}
          onPointerDown={event => {
            if (i !== index || event.button !== 0 || gesture.current) return;
            generation.current++;
            left.stop();
            right.stop();
            gesture.current = { id: event.pointerId, start: event.clientX, left: left.get(), width: right.get() - left.get(), last: event.clientX, time: event.timeStamp, speed: 0, moved: false };
          }}
          onKeyDown={event => {
            const last = items.length - 1;
            const next = event.key === "Home" ? 0 : event.key === "End" ? last :
              ["ArrowRight", "ArrowDown"].includes(event.key) ? (index + 1) % items.length :
              ["ArrowLeft", "ArrowUp"].includes(event.key) ? (index + last) % items.length : null;
            if (next === null) return;
            event.preventDefault();
            choose(next);
            buttons.current[next]?.focus();
          }}
        >{item.label}</button>
      ))}
      <motion.div className="rubber-segment__thumb" aria-hidden="true" style={{ clipPath }}>
        {items.map(item => <span key={item.value} className="rubber-segment__item">{item.label}</span>)}
      </motion.div>
    </div>
  );
}
