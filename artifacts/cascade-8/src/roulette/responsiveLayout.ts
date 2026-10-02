import type { RouletteScenePhase } from "./scenePhase";

export type RouletteResponsiveMode =
  | "portrait"
  | "landscape";

export type RouletteReferenceScene = {
  width: number;
  height: number;
};

export type RoulettePhaseGeometry = {
  wheel: {
    x: number;
    y: number;
    size: number;
  };
  table: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    railWidth: number;
  };
};

export type RouletteResponsiveLayout = {
  mode: RouletteResponsiveMode;
  reference: RouletteReferenceScene;
  phase: RouletteScenePhase;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
  geometry: RoulettePhaseGeometry;
};

export const ROULETTE_REFERENCE_SCENES = {
  portrait: {
    width: 390,
    height: 844,
  },
  landscape: {
    width: 1600,
    height: 900,
  },
} as const satisfies Record<
  RouletteResponsiveMode,
  RouletteReferenceScene
>;

export const ROULETTE_PHASE_GEOMETRY = {
  portrait: {
    betting: {
      wheel: {
        x: 52,
        y: 82,
        size: 286,
      },
      table: {
        x: 1.5,
        y: 248,
        width: 335,
        height: 590,
        scale: 1,
        railWidth: 52,
      },
    },
    spinning: {
      wheel: {
        x: 12,
        y: 82,
        size: 366,
      },
      table: {
        x: 75,
        y: 466,
        width: 335,
        height: 590,
        scale: 0.62,
        railWidth: 52,
      },
    },
    settled: {
      wheel: {
        x: 14,
        y: 82,
        size: 362,
      },
      table: {
        x: 79,
        y: 462,
        width: 335,
        height: 590,
        scale: 0.60,
        railWidth: 52,
      },
    },
  },
  landscape: {
    betting: {
      wheel: {
        x: 521,
        y: 92,
        size: 558,
      },
      table: {
        x: 181,
        y: 558,
        width: 1180,
        height: 315,
        scale: 1,
        railWidth: 58,
      },
    },
    spinning: {
      wheel: {
        x: 431,
        y: 88,
        size: 738,
      },
      table: {
        x: 416,
        y: 662,
        width: 1180,
        height: 315,
        scale: 0.62,
        railWidth: 58,
      },
    },
    settled: {
      wheel: {
        x: 440,
        y: 90,
        size: 720,
      },
      table: {
        x: 379,
        y: 642,
        width: 1180,
        height: 315,
        scale: 0.68,
        railWidth: 58,
      },
    },
  },
} as const satisfies Record<
  RouletteResponsiveMode,
  Record<RouletteScenePhase, RoulettePhaseGeometry>
>;

function finitePositive(
  value: number,
  fallback: number,
) {
  return Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function getRouletteResponsiveMode(
  width: number,
  height: number,
): RouletteResponsiveMode {
  return width > height
    ? "landscape"
    : "portrait";
}

export function computeRouletteResponsiveLayout(
  viewportWidth: number,
  viewportHeight: number,
  phase: RouletteScenePhase,
): RouletteResponsiveLayout {
  const width =
    finitePositive(
      viewportWidth,
      ROULETTE_REFERENCE_SCENES.portrait.width,
    );
  const height =
    finitePositive(
      viewportHeight,
      ROULETTE_REFERENCE_SCENES.portrait.height,
    );
  const mode =
    getRouletteResponsiveMode(
      width,
      height,
    );
  const reference =
    ROULETTE_REFERENCE_SCENES[
      mode
    ];
  const scale =
    Math.min(
      width / reference.width,
      height / reference.height,
    );
  const renderedWidth =
    reference.width * scale;
  const renderedHeight =
    reference.height * scale;

  return {
    mode,
    reference,
    phase,
    scale,
    renderedWidth,
    renderedHeight,
    offsetX:
      (width - renderedWidth) / 2,
    offsetY:
      (height - renderedHeight) / 2,
    geometry:
      ROULETTE_PHASE_GEOMETRY[
        mode
      ][phase],
  };
}

export function applyRouletteResponsiveLayout(
  page: HTMLElement,
  phase: RouletteScenePhase,
  viewportWidth: number,
  viewportHeight: number,
) {
  const layout =
    computeRouletteResponsiveLayout(
      viewportWidth,
      viewportHeight,
      phase,
    );
  const geometry =
    layout.geometry;

  page.dataset.responsiveLayout =
    "canonical-v1";
  page.dataset.responsiveMode =
    layout.mode;

  page.style.setProperty(
    "--roulette-scene-width",
    `${layout.reference.width}px`,
  );
  page.style.setProperty(
    "--roulette-scene-height",
    `${layout.reference.height}px`,
  );
  page.style.setProperty(
    "--roulette-scene-scale",
    String(layout.scale),
  );
  page.style.setProperty(
    "--roulette-wheel-x",
    `${geometry.wheel.x}px`,
  );
  page.style.setProperty(
    "--roulette-wheel-y",
    `${geometry.wheel.y}px`,
  );
  page.style.setProperty(
    "--roulette-wheel-size",
    `${geometry.wheel.size}px`,
  );
  page.style.setProperty(
    "--roulette-table-x",
    `${geometry.table.x}px`,
  );
  page.style.setProperty(
    "--roulette-table-y",
    `${geometry.table.y}px`,
  );
  page.style.setProperty(
    "--roulette-table-width",
    `${geometry.table.width}px`,
  );
  page.style.setProperty(
    "--roulette-table-scale",
    String(geometry.table.scale),
  );

  return layout;
}
