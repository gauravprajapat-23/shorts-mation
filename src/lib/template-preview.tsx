import { CANVAS_DIMS, renderText } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, AspectRatio } from "@/lib/types";

/**
 * Renders a real, scaled-down preview of a template's first scene.
 * Used in template cards and the editor's preview modal.
 */
export function TemplatePreview({
  doc,
  aspect,
  vars = {},
  className,
}: {
  doc?: EditorDocument | null;
  aspect: AspectRatio;
  vars?: Record<string, string>;
  className?: string;
}) {
  const dims = CANVAS_DIMS[aspect];
  const scene = doc?.scenes?.[0];
  const bg = scene?.background ?? "#0a0a0a";
  return (
    <svg
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", background: bg }}
    >
      {scene?.elements.map((el) => renderEl(el, vars))}
      {!scene && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#3f3f46" fontSize={Math.min(dims.w, dims.h) * 0.08} fontFamily="Inter">
          {aspect}
        </text>
      )}
    </svg>
  );
}

function renderEl(el: EditorElement, vars: Record<string, string>) {
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.w / 2} ${el.h / 2})`;
  const opacity = el.opacity;
  if (el.type === "shape") {
    if (el.shape === "ellipse") {
      return (
        <g key={el.id} transform={transform} opacity={opacity}>
          <ellipse cx={el.w / 2} cy={el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill} />
        </g>
      );
    }
    return (
      <g key={el.id} transform={transform} opacity={opacity}>
        <rect width={el.w} height={el.h} fill={el.fill} rx={el.radius ?? 0} />
      </g>
    );
  }
  if (el.type === "text") {
    const anchor = el.align === "left" ? "start" : el.align === "right" ? "end" : "middle";
    const xPos = el.align === "left" ? 0 : el.align === "right" ? el.w : el.w / 2;
    const txt = renderText(el.text, vars);
    return (
      <g key={el.id} transform={transform} opacity={opacity}>
        <foreignObject width={el.w} height={el.h}>
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
              color: el.color,
              fontFamily: el.fontFamily,
              fontSize: el.fontSize,
              fontWeight: el.fontWeight,
              textAlign: el.align,
              lineHeight: 1.1,
              overflow: "hidden",
              wordBreak: "break-word",
              padding: 8,
              background: el.background,
            }}
          >
            {txt}
          </div>
        </foreignObject>
        {/* Fallback text for browsers that skip foreignObject */}
        <text
          x={xPos}
          y={el.h / 2}
          dominantBaseline="middle"
          textAnchor={anchor}
          fill={el.color}
          fontFamily={el.fontFamily}
          fontSize={el.fontSize}
          fontWeight={el.fontWeight}
          style={{ pointerEvents: "none" }}
        >
          <title>{txt}</title>
        </text>
      </g>
    );
  }
  if (el.type === "image") {
    const src = el.src.startsWith("{{") ? "" : el.src;
    if (!src) {
      return (
        <g key={el.id} transform={transform} opacity={opacity}>
          <rect width={el.w} height={el.h} fill="#18181b" />
        </g>
      );
    }
    return (
      <g key={el.id} transform={transform} opacity={opacity}>
        <image href={src} width={el.w} height={el.h} preserveAspectRatio={el.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} />
      </g>
    );
  }
  // video → placeholder rect in preview
  return (
    <g key={el.id} transform={transform} opacity={opacity}>
      <rect width={el.w} height={el.h} fill="#0f0f10" />
      <text x={el.w / 2} y={el.h / 2} textAnchor="middle" dominantBaseline="middle" fill="#52525b" fontSize={Math.min(el.w, el.h) * 0.15} fontFamily="Inter">
        ▶
      </text>
    </g>
  );
}