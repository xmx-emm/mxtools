const TOOLTIP_GAP = 8;
const VIEWPORT_MARGIN = 8;
const SHOW_DELAY = 220;
const HIDE_DELAY = 60;

function findTitledElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const titled = target.closest<HTMLElement>('[title]');
  return titled?.getAttribute('title')?.trim() ? titled : null;
}

export function installNativeTooltip(className: string): () => void {
  const bubble = document.createElement('div');
  const bubbleId = `${className}-bubble`;
  bubble.id = bubbleId;
  bubble.className = className;
  bubble.dataset.visible = 'false';
  bubble.dataset.placement = 'bottom';
  bubble.setAttribute('role', 'tooltip');
  bubble.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bubble);

  let active: HTMLElement | null = null;
  let activeTitle = '';
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  const clearShowTimer = () => {
    if (showTimer !== undefined) window.clearTimeout(showTimer);
    showTimer = undefined;
  };

  const clearHideTimer = () => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    hideTimer = undefined;
  };

  const removeDescription = (target: HTMLElement) => {
    const ids = (target.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(id => id && id !== bubbleId);
    if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
    else target.removeAttribute('aria-describedby');
  };

  const restoreActiveTitle = () => {
    if (!active) return;
    removeDescription(active);
    if (active.isConnected && activeTitle && !active.hasAttribute('title')) {
      active.setAttribute('title', activeTitle);
    }
    active = null;
    activeTitle = '';
  };

  const hideNow = () => {
    clearShowTimer();
    clearHideTimer();
    bubble.dataset.visible = 'false';
    bubble.setAttribute('aria-hidden', 'true');
    restoreActiveTitle();
  };

  const positionBubble = (target: HTMLElement) => {
    const targetRect = target.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    let placement: 'top' | 'bottom' = 'bottom';
    let top = targetRect.bottom + TOOLTIP_GAP;

    if (
      top + bubbleRect.height > window.innerHeight - VIEWPORT_MARGIN
      && targetRect.top - TOOLTIP_GAP - bubbleRect.height >= VIEWPORT_MARGIN
    ) {
      placement = 'top';
      top = targetRect.top - TOOLTIP_GAP - bubbleRect.height;
    }

    const idealLeft = targetRect.left + (targetRect.width - bubbleRect.width) / 2;
    const left = Math.min(
      window.innerWidth - bubbleRect.width - VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, idealLeft),
    );

    bubble.dataset.placement = placement;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  };

  const showFor = (target: HTMLElement) => {
    clearHideTimer();
    if (active === target) {
      if (bubble.dataset.visible === 'true') return;
      restoreActiveTitle();
    }

    clearShowTimer();
    restoreActiveTitle();

    const title = target.getAttribute('title')?.trim();
    if (!title) return;

    active = target;
    activeTitle = title;
    target.removeAttribute('title');

    showTimer = window.setTimeout(() => {
      if (!active || active !== target || !target.isConnected) return;
      bubble.textContent = activeTitle;
      bubble.classList.remove('v-theme--light', 'v-theme--dark');
      const themeHost = target.closest<HTMLElement>('.v-theme--light, .v-theme--dark');
      if (themeHost?.classList.contains('v-theme--dark')) bubble.classList.add('v-theme--dark');
      else bubble.classList.add('v-theme--light');

      const describedBy = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      if (!describedBy.includes(bubbleId)) {
        describedBy.push(bubbleId);
        target.setAttribute('aria-describedby', describedBy.join(' '));
      }

      bubble.dataset.visible = 'true';
      bubble.setAttribute('aria-hidden', 'false');
      positionBubble(target);
      showTimer = undefined;
    }, SHOW_DELAY);
  };

  const scheduleHide = () => {
    clearShowTimer();
    clearHideTimer();
    hideTimer = window.setTimeout(hideNow, HIDE_DELAY);
  };

  const onPointerOver = (event: PointerEvent) => {
    if (active && event.target instanceof Node && active.contains(event.target)) return;
    const target = findTitledElement(event.target);
    if (target) showFor(target);
  };

  const onPointerOut = (event: PointerEvent) => {
    if (!active) return;
    if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
    scheduleHide();
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = findTitledElement(event.target);
    if (target) showFor(target);
  };

  const onFocusOut = (event: FocusEvent) => {
    if (!active) return;
    if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
    scheduleHide();
  };

  document.addEventListener('pointerover', onPointerOver);
  document.addEventListener('pointerout', onPointerOut);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', hideNow, true);
  document.addEventListener('scroll', hideNow, true);
  window.addEventListener('resize', hideNow);
  window.addEventListener('blur', hideNow);

  return () => {
    hideNow();
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('pointerdown', hideNow, true);
    document.removeEventListener('scroll', hideNow, true);
    window.removeEventListener('resize', hideNow);
    window.removeEventListener('blur', hideNow);
    bubble.remove();
  };
}
