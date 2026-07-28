<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import InputMethodAddPanel from '@/components/windows/inputMethod/InputMethodAddPanel.vue';
import InputMethodList from '@/components/windows/inputMethod/InputMethodList.vue';
import WubiLexiconPanel from '@/components/windows/inputMethod/WubiLexiconPanel.vue';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import type {InputMethodItem} from '@/types/inputMethod.ts';
import {getAvailableInputMethods, getInputMethods} from '@/ipc/commands.ts';

const { t } = useI18n();
const toast = useToast();

const items = ref<InputMethodItem[]>([]);
const available = ref<InputMethodItem[]>([]);
const loading = ref(false);
const saving = ref(false);

const hasWubi = computed(() =>
  items.value.some((i) => i.capabilities.is_microsoft_wubi),
);

async function load() {
  loading.value = true;
  try {
    const [installed, pool] = await Promise.all([
      getInputMethods(),
      getAvailableInputMethods(),
    ]);
    items.value = installed;
    available.value = pool;
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="app-page input-method-page">
    <header class="app-page__header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">Windows</div>
        <h1 class="app-page__title">{{ t('inputMethod.title') }}</h1>
        <p class="app-page__subtitle">{{ t('inputMethod.description') }}</p>
      </div>
      <v-btn
        variant="tonal"
        size="small"
        rounded="lg"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="load"
      >
        {{ t('common.refresh') }}
      </v-btn>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content input-method-content">
        <RequestAdministratorPrivileges
          :text="t('inputMethod.requestAdmin')"
          class="input-method-admin"
        />

        <InputMethodList
          :items="items"
          :loading="loading"
          :saving="saving"
          @refresh="load"
          @update:saving="saving = $event"
        />

        <InputMethodAddPanel
          :items="available"
          :loading="loading"
          :saving="saving"
          @refresh="load"
          @update:saving="saving = $event"
        />

        <WubiLexiconPanel v-if="hasWubi" :visible="true"/>
      </main>
    </div>
  </div>
</template>

<style scoped>
.input-method-content {
  --app-page-max-width: 920px;
}

.input-method-admin {
  margin-bottom: 14px;
}
</style>
