<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.aspect.title')">
    <div class="text-body-2 mx-6 aspect-tip">
      <p class="tip-intro">
        {{ t('apexTips.aspect.line1') }}
      </p>

      <p class="tip-desc-block">
        {{ t('apexTips.aspect.line2') }}<br/>
        {{ t('apexTips.aspect.line3') }}<br/>
        - {{ t('apexTips.aspect.example1') }}<br/>
        - {{ t('apexTips.aspect.example2') }}<br/>
        - {{ t('apexTips.aspect.example3') }}
      </p>

      <p class="tip-desc-block">
        {{ t('apexTips.aspect.line4') }}
      </p>

      <p class="tip-desc-block">
        {{ t('apexTips.aspect.line5') }}
      </p>

      <div class="tip-item">
        <p class="tip-title"><code>mat_letterbox_aspect_min</code></p>
        <p class="tip-desc">
          {{ t('apexTips.aspect.minTitle') }}<br/>
          {{ t('apexTips.aspect.minExample') }}<br/>
          {{ t('apexTips.aspect.minDesc1') }}<br/>
          {{ t('apexTips.aspect.minDesc2') }}
        </p>
      </div>

      <div class="tip-item">
        <p class="tip-title"><code>mat_letterbox_aspect_goal</code></p>
        <p class="tip-desc">
          {{ t('apexTips.aspect.goalTitle') }}<br/>
          {{ t('apexTips.aspect.goalExample') }}<br/>
          {{ t('apexTips.aspect.goalDesc') }}
        </p>
      </div>

      <div class="tip-item">
        <p class="tip-title"><code>mat_letterbox_aspect_threshold</code></p>
        <p class="tip-desc">
          {{ t('apexTips.aspect.thresholdTitle') }}<br/>
          {{ t('apexTips.aspect.thresholdExample') }}<br/>
          {{ t('apexTips.aspect.thresholdDesc') }}
        </p>
      </div>
    </div>
  </ApexTipCard>
</template>

<style scoped>
.aspect-tip {
  padding: 2px 2px 14px;
}

.tip-intro {
  margin-bottom: 14px;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.9;
  line-height: 1.7;
}

.tip-desc-block {
  margin-bottom: 12px;
  line-height: 1.75;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.92;
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

</style>
