<script setup lang="ts">

import {ApexCommonMilesLanguages, ApexUncommonMilesLanguages} from "@/data/apex_launch_options_config.ts";
import {computed, ref} from "vue"
import {SteamLaunchOptionsImpl} from "@/data/steam.ts"
import {useI18n} from "vue-i18n"
import {apexStore} from "@/stores/game/apex.ts"

const {t} = useI18n()

const apex_store = apexStore()

function change_language(language: string) {
  apex_store.settings_config.miles_language = language
  apex_store.update_download_language_button_color()
}

const selected_language = ref<SteamLaunchOptionsImpl[]>([]);

const selected_language_parameter = computed(() => {
  return selected_language.value.map(m => m.parameter);
})
const other_miles_language = computed(() => {
  const language = ApexUncommonMilesLanguages.find((i) => apex_store.settings_config.miles_language === i.parameter);
  const sl = selected_language.value.find((i) => apex_store.settings_config.miles_language === i.parameter);
  if (language && !sl) {
    return language.name
  }
  return t("message.other")
})

function select_uncommon_miles_language(language_id: string) {
  const language = ApexUncommonMilesLanguages.find((i) => {
    return i.parameter === language_id
  });
  if (language && !selected_language.value.includes(language) && selected_language.value.length < 2) {
    selected_language.value.push(language)
  }
  change_language(language_id)
}

function get_par(p: SteamLaunchOptionsImpl) {
  if (p?.default_parameter) {
    return p.default_parameter
  }
  if (typeof p?.parameter === 'string') {
    return p.parameter
  }
  if (typeof p?.parameter === 'object') {
    return p.parameter[0]
  }
  return 'unknown'
}
</script>
<template>
  <v-btn
      size="small"
      v-for="pi in [...ApexCommonMilesLanguages, ...selected_language]"
      :value="pi?.default_parameter || pi.parameter"
      v-tooltip="{text:pi?.default_parameter || pi.parameter, location:'bottom', openDelay: '200', closeDelay: '150'}"
      @click.stop="change_language(get_par(pi)) "
  >
    {{ pi.name }}
  </v-btn>
  <v-menu activator="#menu-activator" closeOnBack openOnClick openOnHover openDelay="150" closeDelay="100">
    <template v-slot:activator="{ props }">
      <v-btn
          id="menu-activator"
          color="primary"
          size="small"
          v-bind="props"
          :value="apex_store.settings_config.miles_language || 'menu value'"
          @click.stop="change_language( apex_store.settings_config.miles_language || 'menu click.stop')"
      >
        {{ other_miles_language }}
      </v-btn>
    </template>
    <v-list
        :items="ApexUncommonMilesLanguages.filter(f=> !selected_language_parameter.includes(f.parameter))"
        item-title="name"
        item-value="parameter"
        @click:select="value => select_uncommon_miles_language(value.id as string)"
    >
    </v-list>
  </v-menu>
</template>

<style scoped>

</style>