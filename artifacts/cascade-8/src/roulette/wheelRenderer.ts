import {
  EUROPEAN_WHEEL_SEQUENCE,
  SEGMENT_ANGLE,
  TOP_SEGMENT_CENTER,
  WHEEL_COLORS,
  WHEEL_GEOMETRY,
  getNumberColor,
} from "./config";

const TAU = Math.PI * 2;

function polar(radius: number, angle: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function drawAnnularSegment(
  ctx: CanvasRenderingContext2D,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, startAngle, endAngle);
  ctx.arc(0, 0, innerRadius, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawCircleStroke(
  ctx: CanvasRenderingContext2D,
  radius: number,
  stroke: string,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawGoldLeaf(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
  scale: number,
) {
  const point = polar(radius, angle);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle + Math.PI / 2);

  const width = scale * 0.044;
  const height = scale * 0.021;

  const gradient = ctx.createLinearGradient(-width, 0, width, 0);
  gradient.addColorStop(0, WHEEL_COLORS.goldDark);
  gradient.addColorStop(0.45, WHEEL_COLORS.goldLight);
  gradient.addColorStop(1, WHEEL_COLORS.gold);

  ctx.beginPath();
  ctx.moveTo(-width, 0);
  ctx.quadraticCurveTo(0, -height, width, 0);
  ctx.quadraticCurveTo(0, height, -width, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = WHEEL_COLORS.goldDark;
  ctx.lineWidth = Math.max(1, scale * 0.0022);
  ctx.stroke();
  ctx.restore();
}

function drawOuterWood(ctx: CanvasRenderingContext2D, radius: number) {
  const wood = ctx.createRadialGradient(
    -radius * 0.25,
    -radius * 0.3,
    radius * 0.16,
    0,
    0,
    radius,
  );
  wood.addColorStop(0, WHEEL_COLORS.woodLight);
  wood.addColorStop(0.48, WHEEL_COLORS.woodMid);
  wood.addColorStop(1, WHEEL_COLORS.woodDark);

  ctx.save();
  ctx.shadowColor = "rgba(23, 10, 5, 0.32)";
  ctx.shadowBlur = radius * 0.045;
  ctx.shadowOffsetY = radius * 0.018;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.restore();

  const inner = radius * WHEEL_GEOMETRY.outerWoodInnerRadius;
  const panelInner = inner * 1.012;
  const panelOuter = radius * 0.972;
  ctx.strokeStyle = WHEEL_COLORS.woodLine;
  ctx.lineWidth = Math.max(1, radius * 0.0032);

  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + index * (TAU / 8);
    const a = polar(panelInner, angle);
    const b = polar(panelOuter, angle);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let index = 0; index < WHEEL_GEOMETRY.markerCount; index += 1) {
    drawGoldLeaf(
      ctx,
      radius * WHEEL_GEOMETRY.markerRadius,
      -Math.PI / 2 + Math.PI / 8 + index * (TAU / WHEEL_GEOMETRY.markerCount),
      radius,
    );
  }

  drawCircleStroke(ctx, radius * 0.992, WHEEL_COLORS.goldLight, radius * 0.007);
  drawCircleStroke(ctx, radius * 0.979, WHEEL_COLORS.goldDark, radius * 0.003);
  drawCircleStroke(
    ctx,
    radius * WHEEL_GEOMETRY.outerWoodInnerRadius,
    WHEEL_COLORS.goldLight,
    radius * 0.009,
  );
}

function drawNumberRing(ctx: CanvasRenderingContext2D, radius: number) {
  const outer = radius * WHEEL_GEOMETRY.numberOuterRadius;
  const inner = radius * WHEEL_GEOMETRY.numberInnerRadius;
  const strokeWidth = Math.max(1.2, radius * 0.0034);

  EUROPEAN_WHEEL_SEQUENCE.forEach((number, index) => {
    const center = TOP_SEGMENT_CENTER + index * SEGMENT_ANGLE;
    const start = center - SEGMENT_ANGLE / 2;
    const end = center + SEGMENT_ANGLE / 2;

    drawAnnularSegment(
      ctx,
      inner,
      outer,
      start,
      end,
      getNumberColor(number),
      WHEEL_COLORS.gold,
      strokeWidth,
    );

    const textRadius = (inner + outer) / 2;
    const textPoint = polar(textRadius, center);

    ctx.save();
    ctx.translate(textPoint.x, textPoint.y);
    ctx.rotate(center + Math.PI / 2);
    ctx.fillStyle = WHEEL_COLORS.ivory;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(12, radius * 0.060)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(String(number), 0, 0);
    ctx.restore();
  });

  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldLight, radius * 0.009);
  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldLight, radius * 0.008);
}

function drawPocketRing(ctx: CanvasRenderingContext2D, radius: number) {
  const outer = radius * WHEEL_GEOMETRY.pocketOuterRadius;
  const inner = radius * WHEEL_GEOMETRY.pocketInnerRadius;
  const strokeWidth = Math.max(1.1, radius * 0.003);

  EUROPEAN_WHEEL_SEQUENCE.forEach((_, index) => {
    const center = TOP_SEGMENT_CENTER + index * SEGMENT_ANGLE;
    const start = center - SEGMENT_ANGLE / 2;
    const end = center + SEGMENT_ANGLE / 2;
    drawAnnularSegment(
      ctx,
      inner,
      outer,
      start,
      end,
      index % 2 === 0 ? WHEEL_COLORS.green : WHEEL_COLORS.greenAlt,
      WHEEL_COLORS.gold,
      strokeWidth,
    );
  });

  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldLight, radius * 0.008);
  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldLight, radius * 0.008);
}

function drawCenterDisc(ctx: CanvasRenderingContext2D, radius: number) {
  const discRadius = radius * WHEEL_GEOMETRY.centerDiscRadius;
  const wood = ctx.createRadialGradient(
    -discRadius * 0.28,
    -discRadius * 0.32,
    discRadius * 0.08,
    0,
    0,
    discRadius,
  );
  wood.addColorStop(0, "#9c4d21");
  wood.addColorStop(0.55, "#6f2c13");
  wood.addColorStop(1, "#4b1b0d");

  ctx.beginPath();
  ctx.arc(0, 0, discRadius, 0, TAU);
  ctx.fillStyle = wood;
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = "rgba(39, 11, 6, 0.5)";
  ctx.lineWidth = Math.max(1, radius * 0.0025);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * (TAU / 8);
    const point = polar(discRadius * 0.94, angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();

  drawCircleStroke(ctx, discRadius, WHEEL_COLORS.goldLight, radius * 0.009);
  drawCircleStroke(
    ctx,
    radius * WHEEL_GEOMETRY.centerGuideRadius,
    WHEEL_COLORS.gold,
    radius * 0.006,
  );
}

export function renderRouletteWheel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);

  const scale = Math.min(width, height);
  const radius = scale * 0.47;

  ctx.save();
  ctx.translate(width / 2, height / 2);

  drawOuterWood(ctx, radius);
  drawNumberRing(ctx, radius);
  drawPocketRing(ctx, radius);
  drawCenterDisc(ctx, radius);

  ctx.restore();
}
