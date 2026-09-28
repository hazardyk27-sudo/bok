import {
  CENTER_MECHANISM_STYLE,
  EUROPEAN_WHEEL_SEQUENCE,
  NUMBER_RING_STYLE,
  POCKET_RING_STYLE,
  SEGMENT_ANGLE,
  TOP_SEGMENT_CENTER,
  WHEEL_COLORS,
  WHEEL_GEOMETRY,
  getNumberColor,
} from "./config";

const TAU = Math.PI * 2;
type CanvasFill = string | CanvasGradient | CanvasPattern;

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
  fill: CanvasFill,
  stroke: string | null = null,
  lineWidth = 0,
) {
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, startAngle, endAngle);
  ctx.arc(0, 0, innerRadius, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke && lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
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

function createNumberSegmentGradient(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  number: number,
) {
  const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);

  if (number === 0) {
    gradient.addColorStop(0, WHEEL_COLORS.greenDark);
    gradient.addColorStop(0.48, WHEEL_COLORS.green);
    gradient.addColorStop(1, WHEEL_COLORS.greenLight);
    return gradient;
  }

  if (getNumberColor(number) === WHEEL_COLORS.red) {
    gradient.addColorStop(0, WHEEL_COLORS.redDark);
    gradient.addColorStop(0.48, WHEEL_COLORS.red);
    gradient.addColorStop(1, WHEEL_COLORS.redLight);
    return gradient;
  }

  gradient.addColorStop(0, WHEEL_COLORS.blackDark);
  gradient.addColorStop(0.52, WHEEL_COLORS.black);
  gradient.addColorStop(1, WHEEL_COLORS.blackLight);
  return gradient;
}

function drawNumberSeparator(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  angle: number,
  radius: number,
) {
  const a = polar(inner, angle);
  const b = polar(outer, angle);

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(62, 33, 3, 0.85)";
  ctx.lineWidth = radius * (NUMBER_RING_STYLE.separatorWidth + 0.004);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.strokeStyle = WHEEL_COLORS.gold;
  ctx.lineWidth = radius * NUMBER_RING_STYLE.separatorWidth;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.strokeStyle = WHEEL_COLORS.goldSpecular;
  ctx.lineWidth = Math.max(0.7, radius * 0.0014);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.restore();
}

function drawNumberRingRails(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  radius: number,
) {
  const railWidth = radius * NUMBER_RING_STYLE.railWidth;

  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldShadow, railWidth * 1.55);
  drawCircleStroke(ctx, outer, WHEEL_COLORS.gold, railWidth);
  drawCircleStroke(ctx, outer - radius * 0.004, WHEEL_COLORS.goldSpecular, railWidth * 0.24);

  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldShadow, railWidth * 1.45);
  drawCircleStroke(ctx, inner, WHEEL_COLORS.gold, railWidth * 0.92);
  drawCircleStroke(
    ctx,
    inner + radius * NUMBER_RING_STYLE.innerHighlightOffset,
    "rgba(255, 239, 158, 0.44)",
    Math.max(0.8, radius * 0.0015),
  );
}

function drawNumberLabel(
  ctx: CanvasRenderingContext2D,
  number: number,
  center: number,
  radius: number,
) {
  const textRadius = radius * NUMBER_RING_STYLE.textRadius;
  const point = polar(textRadius, center);
  const fontSize = Math.max(12, radius * NUMBER_RING_STYLE.fontSize);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(center + Math.PI / 2);
  ctx.scale(NUMBER_RING_STYLE.textScaleX, 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.shadowColor = "rgba(22, 10, 3, 0.62)";
  ctx.shadowBlur = radius * 0.003;
  ctx.shadowOffsetY = radius * 0.0024;
  ctx.strokeStyle = "rgba(83, 47, 5, 0.66)";
  ctx.lineWidth = Math.max(0.85, radius * 0.0023);
  ctx.strokeText(String(number), 0, 0);
  ctx.fillStyle = WHEEL_COLORS.ivoryLight;
  ctx.fillText(String(number), 0, 0);

  ctx.restore();
}

function drawNumberRing(ctx: CanvasRenderingContext2D, radius: number) {
  const outer = radius * WHEEL_GEOMETRY.numberOuterRadius;
  const inner = radius * WHEEL_GEOMETRY.numberInnerRadius;

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
      createNumberSegmentGradient(ctx, inner, outer, number),
    );
  });

  for (let index = 0; index < EUROPEAN_WHEEL_SEQUENCE.length; index += 1) {
    const center = TOP_SEGMENT_CENTER + index * SEGMENT_ANGLE;
    drawNumberSeparator(
      ctx,
      inner,
      outer,
      center - SEGMENT_ANGLE / 2,
      radius,
    );
  }

  drawNumberRingRails(ctx, inner, outer, radius);

  EUROPEAN_WHEEL_SEQUENCE.forEach((number, index) => {
    const center = TOP_SEGMENT_CENTER + index * SEGMENT_ANGLE;
    drawNumberLabel(ctx, number, center, radius);
  });
}

function createPocketGradient(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  index: number,
) {
  const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  const middle = index % 2 === 0 ? WHEEL_COLORS.green : WHEEL_COLORS.greenAlt;

  gradient.addColorStop(0, WHEEL_COLORS.greenDeep);
  gradient.addColorStop(0.13, WHEEL_COLORS.greenDark);
  gradient.addColorStop(0.50, middle);
  gradient.addColorStop(0.78, WHEEL_COLORS.greenLight);
  gradient.addColorStop(1, WHEEL_COLORS.greenDark);
  return gradient;
}

function drawPocketSeparator(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  angle: number,
  radius: number,
) {
  const innerPoint = polar(inner + radius * 0.002, angle);
  const outerPoint = polar(outer - radius * 0.002, angle);

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(49, 28, 3, 0.82)";
  ctx.lineWidth = radius * (POCKET_RING_STYLE.separatorWidth + 0.0048);
  ctx.beginPath();
  ctx.moveTo(innerPoint.x, innerPoint.y);
  ctx.lineTo(outerPoint.x, outerPoint.y);
  ctx.stroke();

  ctx.strokeStyle = WHEEL_COLORS.goldDark;
  ctx.lineWidth = radius * (POCKET_RING_STYLE.separatorWidth + 0.0015);
  ctx.beginPath();
  ctx.moveTo(innerPoint.x, innerPoint.y);
  ctx.lineTo(outerPoint.x, outerPoint.y);
  ctx.stroke();

  ctx.strokeStyle = WHEEL_COLORS.goldLight;
  ctx.lineWidth = radius * POCKET_RING_STYLE.separatorWidth;
  ctx.beginPath();
  ctx.moveTo(innerPoint.x, innerPoint.y);
  ctx.lineTo(outerPoint.x, outerPoint.y);
  ctx.stroke();

  ctx.strokeStyle = WHEEL_COLORS.goldSpecular;
  ctx.lineWidth = Math.max(0.65, radius * 0.00125);
  ctx.beginPath();
  ctx.moveTo(innerPoint.x, innerPoint.y);
  ctx.lineTo(outerPoint.x, outerPoint.y);
  ctx.stroke();

  ctx.restore();
}

function drawPocketRingRails(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  radius: number,
) {
  const railWidth = radius * POCKET_RING_STYLE.railWidth;

  drawCircleStroke(ctx, outer, "rgba(60, 31, 2, 0.88)", railWidth * 1.62);
  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldDark, railWidth * 1.18);
  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldLight, railWidth * 0.72);
  drawCircleStroke(
    ctx,
    outer - radius * POCKET_RING_STYLE.outerShadowInset,
    "rgba(5, 48, 20, 0.58)",
    radius * 0.008,
  );

  drawCircleStroke(ctx, inner, "rgba(54, 28, 2, 0.9)", railWidth * 1.55);
  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldDark, railWidth * 1.12);
  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldLight, railWidth * 0.7);
  drawCircleStroke(
    ctx,
    inner + radius * POCKET_RING_STYLE.innerHighlightInset,
    "rgba(86, 187, 104, 0.28)",
    Math.max(0.8, radius * 0.0023),
  );
}

function drawPocketTrough(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  radius: number,
) {
  const troughRadius = inner + (outer - inner) * 0.48;
  const troughWidth = radius * POCKET_RING_STYLE.troughInset;

  drawCircleStroke(
    ctx,
    troughRadius,
    "rgba(3, 45, 18, 0.34)",
    troughWidth,
  );
  drawCircleStroke(
    ctx,
    radius * POCKET_RING_STYLE.centerSheenRadius,
    "rgba(87, 186, 105, 0.20)",
    Math.max(1, radius * 0.004),
  );
}

function drawPocketRing(ctx: CanvasRenderingContext2D, radius: number) {
  const outer = radius * WHEEL_GEOMETRY.pocketOuterRadius;
  const inner = radius * WHEEL_GEOMETRY.pocketInnerRadius;

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
      createPocketGradient(ctx, inner, outer, index),
    );
  });

  drawPocketTrough(ctx, inner, outer, radius);

  for (let index = 0; index < EUROPEAN_WHEEL_SEQUENCE.length; index += 1) {
    const center = TOP_SEGMENT_CENTER + index * SEGMENT_ANGLE;
    drawPocketSeparator(
      ctx,
      inner,
      outer,
      center - SEGMENT_ANGLE / 2,
      radius,
    );
  }

  drawPocketRingRails(ctx, inner, outer, radius);
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

function createGoldRadialGradient(
  ctx: CanvasRenderingContext2D,
  radius: number,
  highlightX: number,
  highlightY: number,
) {
  const gradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    radius * 0.06,
    0,
    0,
    radius,
  );
  gradient.addColorStop(0, WHEEL_COLORS.goldSpecular);
  gradient.addColorStop(0.22, WHEEL_COLORS.goldLight);
  gradient.addColorStop(0.58, WHEEL_COLORS.gold);
  gradient.addColorStop(0.84, WHEEL_COLORS.goldDark);
  gradient.addColorStop(1, WHEEL_COLORS.goldShadow);
  return gradient;
}

function drawCenterBase(ctx: CanvasRenderingContext2D, radius: number) {
  const outer = radius * CENTER_MECHANISM_STYLE.baseOuterRadius;
  const middle = radius * CENTER_MECHANISM_STYLE.baseMiddleRadius;
  const inner = radius * CENTER_MECHANISM_STYLE.baseInnerRadius;

  ctx.save();
  ctx.shadowColor = "rgba(30, 13, 2, 0.44)";
  ctx.shadowBlur = radius * 0.018;
  ctx.shadowOffsetY = radius * 0.010;

  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, TAU);
  ctx.fillStyle = createGoldRadialGradient(
    ctx,
    outer,
    -outer * 0.28,
    -outer * 0.34,
  );
  ctx.fill();
  ctx.restore();

  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldShadow, radius * 0.009);
  drawCircleStroke(ctx, outer * 0.94, WHEEL_COLORS.goldSpecular, radius * 0.003);

  ctx.beginPath();
  ctx.arc(0, 0, middle, 0, TAU);
  ctx.fillStyle = createGoldRadialGradient(
    ctx,
    middle,
    -middle * 0.32,
    -middle * 0.38,
  );
  ctx.fill();
  drawCircleStroke(ctx, middle, WHEEL_COLORS.goldDark, radius * 0.006);
  drawCircleStroke(ctx, middle * 0.86, "rgba(255, 235, 148, 0.72)", radius * 0.0025);

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, TAU);
  ctx.fillStyle = createGoldRadialGradient(
    ctx,
    inner,
    -inner * 0.36,
    -inner * 0.40,
  );
  ctx.fill();
  drawCircleStroke(ctx, inner, WHEEL_COLORS.goldDark, radius * 0.0045);
}

function drawCenterArm(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
) {
  const startRadius = radius * CENTER_MECHANISM_STYLE.armStartRadius;
  const endRadius = radius * CENTER_MECHANISM_STYLE.armLength;
  const start = polar(startRadius, angle);
  const end = polar(endRadius, angle);
  const armWidth = radius * CENTER_MECHANISM_STYLE.armWidth;

  ctx.save();
  ctx.lineCap = "round";

  ctx.shadowColor = "rgba(32, 13, 1, 0.48)";
  ctx.shadowBlur = radius * 0.010;
  ctx.shadowOffsetY = radius * 0.007;

  ctx.strokeStyle = WHEEL_COLORS.goldShadow;
  ctx.lineWidth = armWidth * 1.48;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const shaftGradient = ctx.createLinearGradient(
    start.x,
    start.y,
    end.x,
    end.y,
  );
  shaftGradient.addColorStop(0, WHEEL_COLORS.goldDark);
  shaftGradient.addColorStop(0.38, WHEEL_COLORS.gold);
  shaftGradient.addColorStop(0.72, WHEEL_COLORS.goldLight);
  shaftGradient.addColorStop(1, WHEEL_COLORS.goldDark);

  ctx.strokeStyle = shaftGradient;
  ctx.lineWidth = armWidth;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255, 245, 184, 0.66)";
  ctx.lineWidth = Math.max(0.8, armWidth * 0.18);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.restore();
}

function drawCenterKnob(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
) {
  const knobRadius = radius * CENTER_MECHANISM_STYLE.knobRadius;
  const end = polar(radius * CENTER_MECHANISM_STYLE.armLength, angle);
  const highlightOffset = radius * CENTER_MECHANISM_STYLE.knobHighlightOffset;

  ctx.save();
  ctx.shadowColor = "rgba(28, 12, 1, 0.5)";
  ctx.shadowBlur = radius * 0.011;
  ctx.shadowOffsetY = radius * 0.007;

  const gradient = ctx.createRadialGradient(
    end.x - highlightOffset,
    end.y - highlightOffset,
    knobRadius * 0.08,
    end.x,
    end.y,
    knobRadius,
  );
  gradient.addColorStop(0, "#fff6bf");
  gradient.addColorStop(0.18, WHEEL_COLORS.goldSpecular);
  gradient.addColorStop(0.48, WHEEL_COLORS.goldLight);
  gradient.addColorStop(0.74, WHEEL_COLORS.gold);
  gradient.addColorStop(1, WHEEL_COLORS.goldDark);

  ctx.beginPath();
  ctx.arc(end.x, end.y, knobRadius, 0, TAU);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = WHEEL_COLORS.goldShadow;
  ctx.lineWidth = Math.max(1, radius * 0.004);
  ctx.stroke();
  ctx.restore();
}

function drawCenterHub(ctx: CanvasRenderingContext2D, radius: number) {
  const hubRadius = radius * CENTER_MECHANISM_STYLE.hubRadius;
  const highlightRadius = radius * CENTER_MECHANISM_STYLE.hubHighlightRadius;

  ctx.save();
  ctx.shadowColor = "rgba(26, 11, 1, 0.55)";
  ctx.shadowBlur = radius * 0.016;
  ctx.shadowOffsetY = radius * 0.008;

  ctx.beginPath();
  ctx.arc(0, 0, hubRadius, 0, TAU);
  ctx.fillStyle = createGoldRadialGradient(
    ctx,
    hubRadius,
    -hubRadius * 0.34,
    -hubRadius * 0.40,
  );
  ctx.fill();
  ctx.strokeStyle = WHEEL_COLORS.goldShadow;
  ctx.lineWidth = Math.max(1, radius * 0.006);
  ctx.stroke();

  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(-hubRadius * 0.23, -hubRadius * 0.29, highlightRadius, 0, TAU);
  const highlight = ctx.createRadialGradient(
    -hubRadius * 0.28,
    -hubRadius * 0.34,
    0,
    -hubRadius * 0.23,
    -hubRadius * 0.29,
    highlightRadius,
  );
  highlight.addColorStop(0, "rgba(255, 255, 224, 0.82)");
  highlight.addColorStop(1, "rgba(255, 239, 160, 0)");
  ctx.fillStyle = highlight;
  ctx.fill();

  ctx.restore();
}

function drawCenterMechanism(ctx: CanvasRenderingContext2D, radius: number) {
  drawCenterBase(ctx, radius);

  for (let index = 0; index < CENTER_MECHANISM_STYLE.armCount; index += 1) {
    const angle =
      CENTER_MECHANISM_STYLE.armStartAngle +
      index * (TAU / CENTER_MECHANISM_STYLE.armCount);
    drawCenterArm(ctx, radius, angle);
  }

  for (let index = 0; index < CENTER_MECHANISM_STYLE.armCount; index += 1) {
    const angle =
      CENTER_MECHANISM_STYLE.armStartAngle +
      index * (TAU / CENTER_MECHANISM_STYLE.armCount);
    drawCenterKnob(ctx, radius, angle);
  }

  drawCenterHub(ctx, radius);
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
  drawCenterMechanism(ctx, radius);

  ctx.restore();
}
