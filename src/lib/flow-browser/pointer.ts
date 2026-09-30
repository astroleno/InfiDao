export type PointerPoint = { x: number; y: number };
export type CanvasRect = { left: number; top: number; width: number; height: number };

export function pointerLocalPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>, rect: CanvasRect, logicalWidth = rect.width, logicalHeight = rect.height): PointerPoint {
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

export function crossedDragThreshold(start: PointerPoint, current: PointerPoint, threshold = 7) {
  return Math.hypot(current.x - start.x, current.y - start.y) > threshold;
}

export function isPrimaryPointer(event: Pick<PointerEvent, 'button'> & Partial<Pick<PointerEvent, 'isPrimary'>>) {
  return event.button <= 0 && event.isPrimary !== false;
}
