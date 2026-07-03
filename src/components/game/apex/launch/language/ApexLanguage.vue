<script setup lang="ts">
// 语音包的选择页面
import {ApexCommonMilesLanguages, ApexUncommonMilesLanguages} from '@/data/apex_launch_options_config.ts';
import {computed, ref} from 'vue';
import {SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {useI18n} from 'vue-i18n';
import apexStore from '@/stores/game/apex.ts';

const { t } = useI18n();

const apex_store = apexStore();

function change_language(language: string) {
  apex_store.settings_config.miles_language = language;
  apex_store.update_download_language_button_color();
}

const selected_language = ref<SteamLaunchOptionsImpl[]>([]);

const selected_language_parameter = computed(() => {
  return selected_language.value.map(m => m.parameter);
});
const other_miles_language = computed(() => {
  const language = ApexUncommonMilesLanguages.find((i) => apex_store.settings_config.miles_language === i.parameter);
  const sl = selected_language.value.find((i) => apex_store.settings_config.miles_language === i.parameter);
  if (language && !sl) {
    return t(language.name);
  }
  return t('message.other');
});

function select_uncommon_miles_language(language_id: string) {
  const language = ApexUncommonMilesLanguages.find((i) => {
    return i.parameter === language_id;
  });
  if (language && !selected_language.value.includes(language) && selected_language.value.length < 2) {
    selected_language.value.push(language);
  }
  change_language(language_id);
}

function get_par(p: SteamLaunchOptionsImpl) {
  if (p?.default_parameter) {
    return p.default_parameter;
  }
  if (typeof p?.parameter === 'string') {
    return p.parameter;
  }
  if (typeof p?.parameter === 'object') {
    return p.parameter[0];
  }
  return 'unknown';
}

function parameterString(p: SteamLaunchOptionsImpl): string {
  if (typeof p.parameter === 'string') return p.parameter;
  if (Array.isArray(p.parameter)) return p.parameter[0] ?? '';
  return '';
}
</script>
<template>
  <v-btn
    size="small"
    v-for="pi in [...ApexCommonMilesLanguages, ...selected_language]"
    :key="parameterString(pi)"
    :value="pi?.default_parameter || pi.parameter"
    :title="String(pi?.default_parameter || pi.parameter)"
    @click.stop="change_language(get_par(pi)) "
  >
    {{ t(pi.name) }}
  </v-btn>
  <v-menu closeOnBack :open-on-click="false" openOnHover openDelay="150" closeDelay="100">
    <template v-slot:activator="{ props }">
      <v-btn
        color="primary"
        size="small"
        v-bind="props"
        :value="apex_store.settings_config.miles_language || 'menu value'"
        @click.stop.prevent
      >
        {{ other_miles_language }}
      </v-btn>
    </template>
    <v-list>
      <v-list-item
        v-for="f in ApexUncommonMilesLanguages.filter((x) => !selected_language_parameter.includes(x.parameter))"
        :key="parameterString(f)"
        :title="t(f.name)"
        @click="select_uncommon_miles_language(parameterString(f))"
      />
    </v-list>
  </v-menu>
</template>

<style scoped>

</style>
