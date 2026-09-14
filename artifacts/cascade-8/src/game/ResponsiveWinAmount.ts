export type ResponsiveWinAmountOptions = {
  maxFontSize?: number;
  minFontSize?: number;
};

export type ResponsiveWinAmountHandle = {
  fit: () => void;
  destroy: () => void;
};

const pixels = (value: string) => Number.parseFloat(value) || 0;

/**
 * Fits the exact formatted reward value to its safe inner container.
 * The final value is measured before a count-up begins so the type does not
 * jump through progressively smaller sizes while the amount is animating.
 */
export function mountResponsiveWinAmount(
  element: HTMLElement,
  targetText: string,
  options: ResponsiveWinAmountOptions = {},
): ResponsiveWinAmountHandle {
  const maxFontSize = options.maxFontSize ?? 148;
  const minFontSize = options.minFontSize ?? 22;
  const fit = () => {
    const container = element.parentElement;
    if (!container || container.clientWidth <= 0) return;
    const previousText = element.textContent ?? "";

    const containerStyle = window.getComputedStyle(container);
    const safeWidth = Math.max(
      1,
      container.clientWidth
        - pixels(containerStyle.paddingLeft)
        - pixels(containerStyle.paddingRight),
    );

    element.style.whiteSpace = "nowrap";
    element.style.fontSize = `${maxFontSize}px`;
    element.textContent = targetText;

    let fontSize = maxFontSize;
    while (element.scrollWidth > safeWidth && fontSize > minFontSize) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;
    }

    element.dataset.responsiveFontSize = String(fontSize);
    element.textContent = previousText;
  };

  fit();
  const observer = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(fit);
  observer?.observe(element.parentElement!);

  return {
    fit,
    destroy: () => observer?.disconnect(),
  };
}