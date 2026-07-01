import { Capacitor } from "@capacitor/core";

const EDGE_WIDTH = 28;
const MIN_DISTANCE = 72;
const MAX_VERTICAL_DRIFT = 64;
const HORIZONTAL_BIAS = 1.35;

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="dialog"], [data-back-swipe-ignore]'
    )
  );
}

function canGoBack() {
  return window.history.length > 1 && window.location.pathname !== "/scan";
}

export function installNativeBackSwipe() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  let tracking = false;
  let didNavigate = false;
  let startX = 0;
  let startY = 0;

  window.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || isInteractiveTarget(event.target) || !canGoBack()) {
        tracking = false;
        return;
      }

      const touch = event.touches[0];
      tracking = touch.clientX <= EDGE_WIDTH;
      didNavigate = false;
      startX = touch.clientX;
      startY = touch.clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!tracking || didNavigate || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);

      if (dx < 0 || dy > MAX_VERTICAL_DRIFT) {
        tracking = false;
        return;
      }

      if (dx > 18 && dx > dy * HORIZONTAL_BIAS) {
        event.preventDefault();
      }

      if (dx >= MIN_DISTANCE && dx > dy * HORIZONTAL_BIAS) {
        didNavigate = true;
        tracking = false;
        window.history.back();
      }
    },
    { passive: false }
  );

  window.addEventListener(
    "touchend",
    () => {
      tracking = false;
      didNavigate = false;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchcancel",
    () => {
      tracking = false;
      didNavigate = false;
    },
    { passive: true }
  );
}
