<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.inputMouse.title')">
    <div class="text-body-2 mx-6 mouse-tip">
      <p class="tip-intro">
        {{ t('apexTips.inputMouse.intro') }}
      </p>

      <div class="tip-item">
        <p class="tip-title"><code>+m_rawinput 1</code></p>
        <p class="tip-desc">
          <strong>{{ t('apexTips.inputMouse.effect') }}</strong>{{ t('apexTips.inputMouse.rawinputEffect') }}<br/>
          <strong>{{ t('apexTips.inputMouse.explain') }}</strong>{{ t('apexTips.inputMouse.rawinputExplain') }}<br/>
        </p>
      </div>

      <div class="tip-item">
        <p class="tip-title"><code>-noforcemaccel</code></p>
        <p class="tip-desc">
          <strong>{{ t('apexTips.inputMouse.effect') }}</strong>{{ t('apexTips.inputMouse.accelEffect') }}<br/>
          <strong>{{ t('apexTips.inputMouse.explain') }}</strong>{{ t('apexTips.inputMouse.accelExplain') }}
        </p>
      </div>

      <div class="tip-item">
        <p class="tip-title"><code>-noforcemspd</code></p>
        <p class="tip-desc">
          <strong>{{ t('apexTips.inputMouse.effect') }}</strong>{{ t('apexTips.inputMouse.spdEffect') }}<br/>
          <strong>{{ t('apexTips.inputMouse.explain') }}</strong>{{ t('apexTips.inputMouse.spdExplain') }}
        </p>
      </div>

      <div class="tip-item">
        <p class="tip-title"><code>-noforcemparms</code></p>
        <p class="tip-desc">
          <strong>{{ t('apexTips.inputMouse.effect') }}</strong>{{ t('apexTips.inputMouse.parmsEffect') }}<br/>
          <strong>{{ t('apexTips.inputMouse.explain') }}</strong>{{ t('apexTips.inputMouse.parmsExplain') }}
        </p>
      </div>

      <p class="tip-footer">
        {{ t('apexTips.inputMouse.footer') }}
      </p>
    </div>
  </ApexTipCard>
</template>

<style scoped>
.mouse-tip {
  padding: 2px 2px 14px;
}

.tip-intro {
  margin-bottom: 14px;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.9;
  line-height: 1.7;
}

.tip-item {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-left: 4px solid rgb(var(--v-theme-primary));
  background: linear-gradient(
    120deg,
    rgba(var(--v-theme-primary), 0.08),
    rgba(var(--v-theme-on-surface), 0.02)
  );
  border-radius: 10px;
}

.tip-title {
  margin-bottom: 7px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.tip-title code {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.12);
  font-size: 0.82rem;
  font-family: Consolas, "Courier New", monospace;
  color: rgb(var(--v-theme-primary));
}

.tip-desc {
  margin: 0;
  line-height: 1.75;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.92;
}

.tip-footer {
  margin-top: 8px;
  margin-bottom: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  line-height: 1.7;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.86;
}
</style>
