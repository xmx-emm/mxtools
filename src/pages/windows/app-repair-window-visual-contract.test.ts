import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const repairSource = readFileSync(
  new URL('./AppRepairPage.vue', import.meta.url),
  'utf8',
);
const independentWindowTemplate = repairSource.slice(
  repairSource.indexOf('<v-main v-else'),
  repairSource.indexOf('</template>'),
);
const independentWindowStyles = repairSource.slice(
  repairSource.indexOf('.repair-window-root'),
);

describe('app repair window visual contract', () => {
  it('keeps each independent repair flow inside one fixed workbench', () => {
    expect(independentWindowTemplate).toContain('<main class="repair-window-content">');
    expect(independentWindowTemplate).toContain('class="repair-workbench icon-cache-workbench"');
    expect(independentWindowTemplate).toContain('<section v-else class="repair-workbench">');
    expect(independentWindowTemplate).not.toContain('repair-window-heading');
    expect(independentWindowTemplate).not.toContain('app-section repair-workbench');
    expect(independentWindowStyles).toMatch(/\.repair-window-body \{[^}]*overflow: hidden;/s);
    expect(independentWindowStyles).toMatch(/\.repair-workbench \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/s);
    expect(independentWindowStyles).toMatch(/\.repair-footer \{[^}]*flex: 0 0 auto;/s);
  });

  it('limits scrolling to details and uses compact readable controls', () => {
    expect(independentWindowStyles).toMatch(/\.repair-checks \{[^}]*overflow-y: auto;/s);
    expect(independentWindowStyles).toMatch(/\.icon-cache-details \{[^}]*overflow-y: auto;/s);
    expect(independentWindowStyles).toMatch(/\.repair-window-action\.v-btn \{[^}]*--app-control-height-action/s);
    expect(independentWindowStyles).toMatch(/\.repair-check__copy span \{[^}]*overflow-wrap: anywhere;/s);
    expect(independentWindowStyles).not.toContain('text-overflow: ellipsis');
    expect(independentWindowTemplate).not.toContain('size="68"');
  });
});
