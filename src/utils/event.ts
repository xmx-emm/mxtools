const RIGHT_CLICK_GUARD_KEY = '__mx_disable_right_click_v1';

function DisableRightClick() {
  const g = globalThis as { [RIGHT_CLICK_GUARD_KEY]?: boolean };
  if (g[RIGHT_CLICK_GUARD_KEY]) return;
  g[RIGHT_CLICK_GUARD_KEY] = true;
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
}

export {
  DisableRightClick,
};
