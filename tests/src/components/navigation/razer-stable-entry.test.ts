import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';

it('shows the independent Razer branded entry without requiring Beta', () => {
  const page = readFileSync(new URL('../../../../src/pages/GamePage.vue', import.meta.url), 'utf8');
  const router = readFileSync(new URL('../../../../src/router.ts', import.meta.url), 'utf8');
  const card = page.slice(page.indexOf("path: '/razer_polling'"), page.indexOf('].filter(item =>'));
  const routes = router.slice(router.indexOf('const game_tools: ToolChild[] = ['), router.indexOf('];\nconst windows_tools'));
  const route = routes.slice(routes.indexOf("path: '/razer_polling'"));
  expect(card).toContain('iconComponent: RazerIcon');
  expect(route).toContain('iconComponent: markRaw(RazerIcon)');
  expect(card).not.toContain('beta:');
  expect(route).not.toContain('beta:');
  expect(card).not.toContain("icon: 'mdi-mouse'");
  expect(route).not.toContain("icon: 'mdi-mouse'");
  expect(card.trimEnd()).toMatch(/},$/);
  expect(route.trimEnd()).toMatch(/},$/);
});
