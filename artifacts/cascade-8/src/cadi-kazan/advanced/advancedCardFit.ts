export const ADVANCED_CARD_WIDTH = 1200;
export const ADVANCED_CARD_HEIGHT = 546;
export const ADVANCED_CARD_RATIO = ADVANCED_CARD_WIDTH / ADVANCED_CARD_HEIGHT;
export const ADVANCED_CARD_MAX_WIDTH = 1180;
export const ADVANCED_CARD_FIT_INSET_PX = 4;

export type AdvancedCardBounds = {
  width: number;
  height: number;
};

export function fitAdvancedCardBounds(
  containerWidth: number,
  containerHeight: number,
  maxWidth = ADVANCED_CARD_MAX_WIDTH,
  insetPx = ADVANCED_CARD_FIT_INSET_PX,
): AdvancedCardBounds {
  const usableWidth = Math.max(0, containerWidth - insetPx * 2);
  const usableHeight = Math.max(0, containerHeight - insetPx * 2);
  if (usableWidth <= 0 || usableHeight <= 0) return { width: 0, height: 0 };

  const width = Math.min(usableWidth, usableHeight * ADVANCED_CARD_RATIO, maxWidth);
  return {
    width: Math.max(0, Math.floor(width * 1000) / 1000),
    height: Math.max(0, Math.floor((width / ADVANCED_CARD_RATIO) * 1000) / 1000),
  };
}
