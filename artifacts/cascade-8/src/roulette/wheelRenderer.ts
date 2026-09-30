import {
  BALL_STYLE,
  BALL_TRACK_STYLE,
  CENTER_MECHANISM_STYLE,
  DEFLECTOR_STYLE,
  EUROPEAN_WHEEL_SEQUENCE,
  NUMBER_RING_STYLE,
  OUTER_RIM_STYLE,
  POCKET_RING_STYLE,
  SEGMENT_ANGLE,
  TOP_SEGMENT_CENTER,
  WHEEL_COLORS,
  WHEEL_GEOMETRY,
  getDeflectorAngle,
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

function clipAnnulus(
  ctx: CanvasRenderingContext2D,
  innerRadius: number,
  outerRadius: number,
) {
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, 0, TAU);
  ctx.arc(0, 0, innerRadius, 0, TAU, true);
  ctx.clip("evenodd");
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

  const width = scale * OUTER_RIM_STYLE.markerWidth;
  const height = scale * OUTER_RIM_STYLE.markerHeight;

  ctx.shadowColor = "rgba(0, 0, 0, 0.50)";
  ctx.shadowBlur = scale * 0.010;
  ctx.shadowOffsetY = scale * 0.006;

  const gradient = ctx.createLinearGradient(-width, -height, width, height);
  gradient.addColorStop(0, WHEEL_COLORS.goldShadow);
  gradient.addColorStop(0.22, WHEEL_COLORS.gold);
  gradient.addColorStop(0.52, WHEEL_COLORS.goldSpecular);
  gradient.addColorStop(0.76, WHEEL_COLORS.goldLight);
  gradient.addColorStop(1, WHEEL_COLORS.goldDark);

  ctx.beginPath();
  ctx.moveTo(-width, 0);
  ctx.quadraticCurveTo(-width * 0.18, -height, width, 0);
  ctx.quadraticCurveTo(-width * 0.18, height, -width, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = WHEEL_COLORS.goldDark;
  ctx.lineWidth = Math.max(1, scale * 0.002);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-width * 0.56, -height * 0.14);
  ctx.quadraticCurveTo(0, -height * 0.52, width * 0.58, -height * 0.06);
  ctx.strokeStyle = "rgba(246, 249, 251, 0.82)";
  ctx.lineWidth = Math.max(0.7, scale * 0.0014);
  ctx.stroke();

  ctx.restore();
}

function drawOuterWoodGrain(ctx: CanvasRenderingContext2D, radius: number) {
  const inner = radius * OUTER_RIM_STYLE.grainInnerRadius;
  const outer = radius * OUTER_RIM_STYLE.grainOuterRadius;

  ctx.save();
  clipAnnulus(ctx, inner, outer);
  ctx.lineCap = "round";

  for (let index = 0; index < OUTER_RIM_STYLE.grainCount; index += 1) {
    const t = index / Math.max(1, OUTER_RIM_STYLE.grainCount - 1);
    const grainRadius = inner + (outer - inner) * t;
    const phase = index * 1.61803398875;
    const start = -Math.PI * 0.88 + Math.sin(phase) * 0.38;
    const span = Math.PI * (1.12 + 0.34 * Math.cos(phase * 0.77));

    ctx.beginPath();
    ctx.arc(0, 0, grainRadius, start, start + span);
    ctx.strokeStyle =
      index % 3 === 0
        ? `rgba(0, 0, 0, ${OUTER_RIM_STYLE.grainOpacity})`
        : `rgba(126, 138, 147, ${OUTER_RIM_STYLE.grainOpacity * 0.52})`;
    ctx.lineWidth = Math.max(0.65, radius * (0.0013 + (index % 4) * 0.00025));
    ctx.stroke();
  }

  ctx.restore();
}

function drawOuterWoodVarnish(ctx: CanvasRenderingContext2D, radius: number) {
  const inner = radius * WHEEL_GEOMETRY.outerWoodInnerRadius;
  const outer = radius;

  ctx.save();
  clipAnnulus(ctx, inner, outer);

  const sheen = ctx.createRadialGradient(
    -radius * 0.26,
    -radius * 0.34,
    radius * 0.12,
    -radius * 0.04,
    -radius * 0.05,
    radius * 0.95,
  );
  sheen.addColorStop(0, "rgba(210, 220, 228, 0.22)");
  sheen.addColorStop(0.30, "rgba(168, 180, 188, 0.09)");
  sheen.addColorStop(0.62, "rgba(25, 29, 32, 0.08)");
  sheen.addColorStop(1, "rgba(4, 5, 6, 0.34)");

  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, TAU);
  ctx.fillStyle = sheen;
  ctx.fill();

  drawCircleStroke(
    ctx,
    radius * OUTER_RIM_STYLE.varnishRadius,
    "rgba(225, 232, 237, 0.08)",
    radius * OUTER_RIM_STYLE.varnishWidth,
  );

  ctx.restore();
}

function drawOuterWoodBevels(ctx: CanvasRenderingContext2D, radius: number) {
  drawCircleStroke(
    ctx,
    radius * OUTER_RIM_STYLE.outerBevelRadius,
    WHEEL_COLORS.goldShadow,
    radius * 0.015,
  );
  drawCircleStroke(
    ctx,
    radius * OUTER_RIM_STYLE.outerHighlightRadius,
    WHEEL_COLORS.goldLight,
    radius * 0.0065,
  );
  drawCircleStroke(
    ctx,
    radius * (OUTER_RIM_STYLE.outerHighlightRadius - 0.010),
    "rgba(245, 248, 250, 0.58)",
    radius * 0.0022,
  );

  drawCircleStroke(
    ctx,
    radius * OUTER_RIM_STYLE.innerShadowRadius,
    "rgba(8, 10, 12, 0.88)",
    radius * 0.018,
  );
  drawCircleStroke(
    ctx,
    radius * OUTER_RIM_STYLE.innerBevelRadius,
    WHEEL_COLORS.goldDark,
    radius * 0.012,
  );
  drawCircleStroke(
    ctx,
    radius * (OUTER_RIM_STYLE.innerBevelRadius - 0.005),
    WHEEL_COLORS.goldLight,
    radius * 0.0052,
  );
}

function drawOuterWood(ctx: CanvasRenderingContext2D, radius: number) {
  const wood = ctx.createRadialGradient(
    -radius * 0.26,
    -radius * 0.31,
    radius * 0.10,
    0,
    0,
    radius,
  );
  wood.addColorStop(0, WHEEL_COLORS.woodGlow);
  wood.addColorStop(0.20, WHEEL_COLORS.woodLight);
  wood.addColorStop(0.52, WHEEL_COLORS.woodMid);
  wood.addColorStop(0.82, WHEEL_COLORS.woodDark);
  wood.addColorStop(1, WHEEL_COLORS.woodDeep);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = radius * 0.050;
  ctx.shadowOffsetY = radius * 0.020;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.restore();

  drawOuterWoodGrain(ctx, radius);
  drawOuterWoodVarnish(ctx, radius);

  const inner = radius * WHEEL_GEOMETRY.outerWoodInnerRadius;
  const panelInner = inner * 1.018;
  const panelOuter = radius * 0.964;

  for (let index = 0; index < OUTER_RIM_STYLE.panelCount; index += 1) {
    const angle = -Math.PI / 2 + index * (TAU / OUTER_RIM_STYLE.panelCount);
    const a = polar(panelInner, angle);
    const b = polar(panelOuter, angle);

    ctx.strokeStyle = "rgba(4, 5, 6, 0.62)";
    ctx.lineWidth = Math.max(1, radius * 0.0042);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(118, 130, 139, 0.22)";
    ctx.lineWidth = Math.max(0.7, radius * 0.0015);
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

  drawOuterWoodBevels(ctx, radius);
}

function drawBallTrack(ctx: CanvasRenderingContext2D, radius: number) {
  const inner = radius * BALL_TRACK_STYLE.innerRadius;
  const outer = radius * BALL_TRACK_STYLE.outerRadius;
  const pathRadius = radius * BALL_TRACK_STYLE.pathRadius;

  const track = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  track.addColorStop(0, WHEEL_COLORS.trackDeep);
  track.addColorStop(0.22, WHEEL_COLORS.trackDark);
  track.addColorStop(0.52, WHEEL_COLORS.trackMid);
  track.addColorStop(0.78, WHEEL_COLORS.trackLight);
  track.addColorStop(1, WHEEL_COLORS.trackDark);

  drawAnnularSegment(
    ctx,
    inner,
    outer,
    0,
    TAU,
    track,
  );

  ctx.save();
  clipAnnulus(ctx, inner, outer);

  const bowlShadow = ctx.createRadialGradient(
    0,
    0,
    pathRadius - radius * 0.035,
    0,
    0,
    pathRadius + radius * 0.035,
  );
  bowlShadow.addColorStop(0, "rgba(4, 6, 8, 0.70)");
  bowlShadow.addColorStop(0.34, "rgba(10, 12, 14, 0.38)");
  bowlShadow.addColorStop(0.50, "rgba(222, 230, 235, 0.06)");
  bowlShadow.addColorStop(0.72, "rgba(176, 187, 195, 0.14)");
  bowlShadow.addColorStop(1, "rgba(5, 7, 9, 0.58)");

  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, TAU);
  ctx.fillStyle = bowlShadow;
  ctx.fill();

  const directionalSheen = ctx.createLinearGradient(
    -radius * 0.78,
    -radius * 0.72,
    radius * 0.72,
    radius * 0.78,
  );
  directionalSheen.addColorStop(0, "rgba(232, 237, 241, 0.20)");
  directionalSheen.addColorStop(0.36, "rgba(194, 205, 213, 0.08)");
  directionalSheen.addColorStop(0.62, "rgba(32, 36, 40, 0.05)");
  directionalSheen.addColorStop(1, "rgba(6, 8, 10, 0.30)");

  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, TAU);
  ctx.fillStyle = directionalSheen;
  ctx.fill();

  ctx.restore();

  drawCircleStroke(
    ctx,
    pathRadius,
    "rgba(7, 9, 11, 0.55)",
    radius * BALL_TRACK_STYLE.troughWidth,
  );

  drawCircleStroke(
    ctx,
    outer - radius * BALL_TRACK_STYLE.shadowInset,
    "rgba(8, 10, 12, 0.62)",
    radius * 0.014,
  );

  drawCircleStroke(
    ctx,
    radius * BALL_TRACK_STYLE.sheenRadius,
    "rgba(222, 230, 235, 0.20)",
    radius * BALL_TRACK_STYLE.sheenWidth,
  );

  drawCircleStroke(
    ctx,
    inner,
    WHEEL_COLORS.goldShadow,
    radius * BALL_TRACK_STYLE.innerLipWidth * 1.7,
  );
  drawCircleStroke(
    ctx,
    inner,
    WHEEL_COLORS.goldLight,
    radius * BALL_TRACK_STYLE.innerLipWidth,
  );
  drawCircleStroke(
    ctx,
    inner + radius * 0.006,
    "rgba(246, 249, 251, 0.46)",
    Math.max(0.8, radius * 0.0018),
  );

  drawCircleStroke(
    ctx,
    outer,
    WHEEL_COLORS.goldShadow,
    radius * BALL_TRACK_STYLE.outerLipWidth * 1.65,
  );
  drawCircleStroke(
    ctx,
    outer,
    WHEEL_COLORS.goldDark,
    radius * BALL_TRACK_STYLE.outerLipWidth * 1.15,
  );
  drawCircleStroke(
    ctx,
    outer - radius * 0.004,
    WHEEL_COLORS.goldLight,
    radius * BALL_TRACK_STYLE.outerLipWidth * 0.58,
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

  ctx.strokeStyle = "rgba(45, 50, 55, 0.88)";
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
    "rgba(235, 240, 244, 0.46)",
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
  ctx.shadowColor = "rgba(7, 9, 11, 0.68)";
  ctx.shadowBlur = radius * 0.003;
  ctx.shadowOffsetY = radius * 0.0024;
  ctx.strokeStyle = "rgba(58, 64, 70, 0.70)";
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

  ctx.strokeStyle = "rgba(42, 47, 52, 0.86)";
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

  drawCircleStroke(ctx, outer, "rgba(50, 56, 62, 0.90)", railWidth * 1.62);
  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldDark, railWidth * 1.18);
  drawCircleStroke(ctx, outer, WHEEL_COLORS.goldLight, railWidth * 0.72);
  drawCircleStroke(
    ctx,
    outer - radius * POCKET_RING_STYLE.outerShadowInset,
    "rgba(5, 48, 20, 0.58)",
    radius * 0.008,
  );

  drawCircleStroke(ctx, inner, "rgba(48, 54, 60, 0.92)", railWidth * 1.55);
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

function drawCenterWoodGrain(
  ctx: CanvasRenderingContext2D,
  discRadius: number,
  radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, discRadius * 0.97, 0, TAU);
  ctx.clip();

  for (let index = 0; index < 12; index += 1) {
    const ringRadius = discRadius * (0.22 + index * 0.063);
    ctx.beginPath();
    ctx.arc(
      discRadius * 0.12,
      -discRadius * 0.08,
      ringRadius,
      -Math.PI * 0.72,
      Math.PI * 0.55,
    );
    ctx.strokeStyle =
      index % 2 === 0
        ? "rgba(3, 4, 5, 0.28)"
        : "rgba(112, 124, 133, 0.18)";
    ctx.lineWidth = Math.max(0.6, radius * 0.0014);
    ctx.stroke();
  }

  ctx.restore();
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
  wood.addColorStop(0, WHEEL_COLORS.woodGlow);
  wood.addColorStop(0.34, "#3a4248");
  wood.addColorStop(0.68, "#151a1e");
  wood.addColorStop(1, WHEEL_COLORS.woodDeep);

  ctx.save();
  ctx.shadowColor = "rgba(2, 3, 4, 0.34)";
  ctx.shadowBlur = radius * 0.012;
  ctx.shadowOffsetY = radius * 0.007;
  ctx.beginPath();
  ctx.arc(0, 0, discRadius, 0, TAU);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.restore();

  drawCenterWoodGrain(ctx, discRadius, radius);

  ctx.save();
  ctx.strokeStyle = "rgba(8, 10, 12, 0.52)";
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

  drawCircleStroke(ctx, discRadius, WHEEL_COLORS.goldShadow, radius * 0.013);
  drawCircleStroke(ctx, discRadius * 0.987, WHEEL_COLORS.goldLight, radius * 0.006);
  drawCircleStroke(ctx, discRadius * 0.970, "rgba(239, 243, 246, 0.44)", radius * 0.002);
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
  ctx.shadowColor = "rgba(5, 7, 9, 0.52)";
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
  drawCircleStroke(ctx, middle * 0.86, "rgba(238, 243, 246, 0.74)", radius * 0.0025);

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

  ctx.shadowColor = "rgba(4, 6, 8, 0.56)";
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
  ctx.strokeStyle = "rgba(245, 248, 250, 0.70)";
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
  ctx.shadowColor = "rgba(4, 6, 8, 0.58)";
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
  gradient.addColorStop(0, "#ffffff");
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
  ctx.shadowColor = "rgba(3, 5, 7, 0.62)";
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
  highlight.addColorStop(0, "rgba(255, 255, 255, 0.88)");
  highlight.addColorStop(1, "rgba(232, 238, 242, 0)");
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

export type RouletteWheelRenderState = {
  rotorAngle?: number;
  ballAngle?: number;
  ballRadiusRatio?: number;
  ballVisible?: boolean;
  resultMarkerAngle?: number | null;
};

export function normalizeRotorAngle(angle: number) {
  if (!Number.isFinite(angle)) return 0;
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function drawStator(ctx: CanvasRenderingContext2D, radius: number) {
  drawOuterWood(ctx, radius);
  drawBallTrack(ctx, radius);
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  radius: number,
  ballAngle: number,
  ballRadiusRatio: number,
) {
  const safeRadiusRatio =
    Number.isFinite(ballRadiusRatio) && ballRadiusRatio > 0
      ? ballRadiusRatio
      : BALL_TRACK_STYLE.pathRadius;
  const orbitRadius = radius * safeRadiusRatio;
  const point = polar(orbitRadius, normalizeRotorAngle(ballAngle));
  const visualScale = BALL_STYLE.renderScale;
  const ballRadius =
    radius *
    BALL_STYLE.radius *
    visualScale;

  ctx.save();

  ctx.beginPath();
  ctx.arc(
    point.x + radius * BALL_STYLE.shadowOffsetX * visualScale,
    point.y + radius * BALL_STYLE.shadowOffsetY * visualScale,
    radius * BALL_STYLE.shadowRadius * visualScale,
    0,
    TAU,
  );
  ctx.fillStyle = WHEEL_COLORS.ballShadow;
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    point.x + radius * BALL_STYLE.highlightOffsetX * visualScale,
    point.y + radius * BALL_STYLE.highlightOffsetY * visualScale,
    radius * 0.001,
    point.x,
    point.y,
    ballRadius,
  );
  gradient.addColorStop(0, WHEEL_COLORS.ballLight);
  gradient.addColorStop(0.28, "#faf9f4");
  gradient.addColorStop(0.64, WHEEL_COLORS.ballMid);
  gradient.addColorStop(1, WHEEL_COLORS.ballEdge);

  ctx.beginPath();
  ctx.arc(point.x, point.y, ballRadius, 0, TAU);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(92, 83, 68, 0.72)";
  ctx.lineWidth = Math.max(0.8, radius * BALL_STYLE.rimWidth * visualScale);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    point.x + radius * BALL_STYLE.highlightOffsetX * visualScale,
    point.y + radius * BALL_STYLE.highlightOffsetY * visualScale,
    radius * BALL_STYLE.highlightRadius * visualScale,
    0,
    TAU,
  );
  const highlight = ctx.createRadialGradient(
    point.x + radius * BALL_STYLE.highlightOffsetX * visualScale,
    point.y + radius * BALL_STYLE.highlightOffsetY * visualScale,
    0,
    point.x + radius * BALL_STYLE.highlightOffsetX * visualScale,
    point.y + radius * BALL_STYLE.highlightOffsetY * visualScale,
    radius * BALL_STYLE.highlightRadius * visualScale,
  );
  highlight.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = highlight;
  ctx.fill();

  ctx.restore();
}

function drawDeflector(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
) {
  const center = polar(radius * DEFLECTOR_STYLE.radius, angle);
  const radialLength = radius * DEFLECTOR_STYLE.radialLength;
  const tangentialWidth = radius * DEFLECTOR_STYLE.tangentialWidth;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);

  ctx.shadowColor = "rgba(5, 7, 9, 0.58)";
  ctx.shadowBlur = radius * 0.009;
  ctx.shadowOffsetY = radius * 0.005;

  const gradient = ctx.createLinearGradient(
    -radialLength * 0.5,
    -tangentialWidth * 0.5,
    radialLength * 0.5,
    tangentialWidth * 0.5,
  );
  gradient.addColorStop(0, WHEEL_COLORS.goldShadow);
  gradient.addColorStop(0.30, WHEEL_COLORS.gold);
  gradient.addColorStop(0.58, WHEEL_COLORS.goldSpecular);
  gradient.addColorStop(1, WHEEL_COLORS.goldDark);

  ctx.beginPath();
  ctx.moveTo(-radialLength * 0.52, 0);
  ctx.lineTo(0, -tangentialWidth * 0.54);
  ctx.lineTo(radialLength * 0.52, 0);
  ctx.lineTo(0, tangentialWidth * 0.54);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = WHEEL_COLORS.goldDark;
  ctx.lineWidth = Math.max(0.8, radius * 0.0023);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-radialLength * 0.24, -tangentialWidth * 0.16);
  ctx.lineTo(radialLength * 0.24, -tangentialWidth * 0.06);
  ctx.strokeStyle = "rgba(248, 250, 252, 0.84)";
  ctx.lineWidth = Math.max(0.65, radius * 0.0012);
  ctx.stroke();

  ctx.restore();
}

function drawDeflectors(ctx: CanvasRenderingContext2D, radius: number) {
  for (let index = 0; index < DEFLECTOR_STYLE.count; index += 1) {
    drawDeflector(ctx, radius, getDeflectorAngle(index));
  }
}


function drawWinningPocketMarker(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
) {
  if (!Number.isFinite(angle)) return;

  const normalizedAngle =
    normalizeRotorAngle(angle);
  const markerRadius =
    radius * 0.755;
  const point =
    polar(
      markerRadius,
      normalizedAngle,
    );
  const markerWidth =
    Math.max(8, radius * 0.048);
  const markerHeight =
    Math.max(10, radius * 0.064);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(
    normalizedAngle + Math.PI / 2,
  );

  ctx.shadowColor =
    "rgba(247, 222, 151, 0.48)";
  ctx.shadowBlur =
    radius * 0.028;

  const fill =
    ctx.createLinearGradient(
      0,
      -markerHeight * 0.55,
      0,
      markerHeight * 0.55,
    );
  fill.addColorStop(
    0,
    "#ffffff",
  );
  fill.addColorStop(
    0.58,
    "#f6edd7",
  );
  fill.addColorStop(
    1,
    "#d9b96c",
  );

  ctx.beginPath();
  ctx.moveTo(
    0,
    markerHeight * 0.58,
  );
  ctx.lineTo(
    -markerWidth * 0.46,
    -markerHeight * 0.28,
  );
  ctx.quadraticCurveTo(
    0,
    -markerHeight * 0.54,
    markerWidth * 0.46,
    -markerHeight * 0.28,
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.shadowColor =
    "transparent";
  ctx.strokeStyle =
    "rgba(86, 65, 24, 0.88)";
  ctx.lineWidth =
    Math.max(
      1,
      radius * 0.005,
    );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    0,
    -markerHeight * 0.16,
    Math.max(
      1.8,
      radius * 0.010,
    ),
    0,
    TAU,
  );
  ctx.fillStyle =
    "rgba(255, 255, 255, 0.94)";
  ctx.fill();

  ctx.restore();
}

function drawRotor(
  ctx: CanvasRenderingContext2D,
  radius: number,
  rotorAngle: number,
) {
  ctx.save();
  ctx.rotate(normalizeRotorAngle(rotorAngle));

  drawNumberRing(ctx, radius);
  drawPocketRing(ctx, radius);
  drawCenterDisc(ctx, radius);
  drawCenterMechanism(ctx, radius);

  ctx.restore();
}

type RouletteWheelRenderCache = {
  width: number;
  height: number;
  background: HTMLCanvasElement;
  rotor: HTMLCanvasElement;
};

const rouletteWheelRenderCache =
  new WeakMap<
    HTMLCanvasElement,
    RouletteWheelRenderCache
  >();

function buildRouletteWheelRenderCache(
  target: HTMLCanvasElement,
  width: number,
  height: number,
): RouletteWheelRenderCache | null {
  const ownerDocument =
    target.ownerDocument;

  if (!ownerDocument) {
    return null;
  }

  const background =
    ownerDocument.createElement(
      "canvas",
    );
  const rotor =
    ownerDocument.createElement(
      "canvas",
    );

  background.width = width;
  background.height = height;
  rotor.width = width;
  rotor.height = height;

  const backgroundContext =
    background.getContext("2d");
  const rotorContext =
    rotor.getContext("2d");

  if (
    !backgroundContext ||
    !rotorContext
  ) {
    return null;
  }

  const scale =
    Math.min(width, height);
  const radius =
    scale * 0.47;

  backgroundContext.save();
  backgroundContext.translate(
    width / 2,
    height / 2,
  );
  drawStator(
    backgroundContext,
    radius,
  );
  backgroundContext.restore();

  rotorContext.save();
  rotorContext.translate(
    width / 2,
    height / 2,
  );
  drawRotor(
    rotorContext,
    radius,
    0,
  );
  rotorContext.restore();

  return {
    width,
    height,
    background,
    rotor,
  };
}

function getRouletteWheelRenderCache(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const target =
    ctx.canvas;
  const cached =
    rouletteWheelRenderCache.get(
      target,
    );

  if (
    cached &&
    cached.width === width &&
    cached.height === height
  ) {
    return cached;
  }

  const next =
    buildRouletteWheelRenderCache(
      target,
      width,
      height,
    );

  if (next) {
    rouletteWheelRenderCache.set(
      target,
      next,
    );
  }

  return next;
}

export function renderRouletteWheel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RouletteWheelRenderState = {},
) {
  ctx.clearRect(0, 0, width, height);

  const scale = Math.min(width, height);
  const radius = scale * 0.47;
  const cached =
    getRouletteWheelRenderCache(
      ctx,
      width,
      height,
    );

  ctx.save();

  if (cached) {
    ctx.drawImage(
      cached.background,
      0,
      0,
    );
    ctx.translate(
      width / 2,
      height / 2,
    );
    ctx.rotate(
      normalizeRotorAngle(
        state.rotorAngle ?? 0,
      ),
    );
    ctx.drawImage(
      cached.rotor,
      -width / 2,
      -height / 2,
    );
    ctx.rotate(
      -normalizeRotorAngle(
        state.rotorAngle ?? 0,
      ),
    );
  } else {
    ctx.translate(
      width / 2,
      height / 2,
    );
    drawStator(ctx, radius);
    drawRotor(
      ctx,
      radius,
      state.rotorAngle ?? 0,
    );
  }

  drawDeflectors(ctx, radius);

  if (
    state.resultMarkerAngle !== null &&
    state.resultMarkerAngle !== undefined
  ) {
    drawWinningPocketMarker(
      ctx,
      radius,
      state.resultMarkerAngle,
    );
  }

  if (state.ballVisible ?? true) {
    drawBall(
      ctx,
      radius,
      state.ballAngle ?? -0.72,
      state.ballRadiusRatio ?? BALL_TRACK_STYLE.pathRadius,
    );
  }

  ctx.restore();
}
