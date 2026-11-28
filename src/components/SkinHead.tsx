const faces = [
  { name: "front", x: 8, y: 8, rotation: "" },
  { name: "back", x: 24, y: 8, rotation: "rotateY(180deg)" },
  { name: "right", x: 16, y: 8, rotation: "rotateY(90deg)" },
  { name: "left", x: 0, y: 8, rotation: "rotateY(-90deg)" },
  { name: "top", x: 8, y: 0, rotation: "rotateX(90deg)" },
  { name: "bottom", x: 16, y: 0, rotation: "rotateX(-90deg)" },
];

export function SkinHead({ skinUrl }: { skinUrl: string }) {
  return (
    <div aria-hidden="true" className="grid size-14 shrink-0 place-items-center [perspective:140px]">
      <div
        data-skin-head
        className="relative size-8 [transform-style:preserve-3d] [transform:rotateX(var(--head-pitch,-12deg))_rotateY(var(--head-yaw,-20deg))] transition-transform duration-150 ease-out motion-reduce:transition-none motion-reduce:[transform:rotateX(-12deg)_rotateY(-20deg)]"
      >
        {faces.map(({ name, x, y, rotation }) => (
          <div
            key={name}
            className="absolute inset-0 [backface-visibility:hidden] [image-rendering:pixelated] bg-no-repeat"
            style={{
              transform: `${rotation} translateZ(16px)`,
              backgroundImage: `url("${skinUrl}")`,
              backgroundSize: "256px auto",
              backgroundPosition: `${-x * 4}px ${-y * 4}px`,
            }}
          >
            <div
              className="absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage: `url("${skinUrl}")`,
                backgroundSize: "256px auto",
                backgroundPosition: `${-(x + 32) * 4}px ${-y * 4}px`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
