<script setup lang="ts">
/**
 * Steam：半自动下载语音包(Steam 控制台 + Depot)
 */
import {openUrl} from '@tauri-apps/plugin-opener';
import {
  applyApexMilesLanguage,
  openApexAudioFolderPath,
  openApexDepotDownloadFolderPath,
} from '@/ipc/commands.ts';
import {computed, ref} from 'vue';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useI18n} from 'vue-i18n';
import CodeDisplay from '@/components/utils/CodeDisplay.vue';
import steamConsoleImg from '@/assets/game/steam_console.png';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';

const {t} = useI18n();
const apex_store = useApexStore();
const copied_command = ref<string | null>(null);
const is_apply_language = ref(false);
const toast = useToast();

const stepper_ref = ref();

const stepper = computed(() => [
  t('apex.milesDownload.stepConsole'),
  t('apex.milesDownload.stepDepot'),
  t('apex.milesDownload.stepApply'),
  t('apex.milesDownload.stepNotes'),
]);
const is_code_copied = computed(() => (
  copied_command.value !== null
  && copied_command.value === apex_store.download_language_depot_command
));

function apply_miles_language() {
  is_apply_language.value = true;
  applyApexMilesLanguage({
    depot: Number(apex_store.language_depot),
    platform: 'steam',
    eaUserId: null,
  }).then(() => {
    toast.success(t('toast.applyMilesLanguageSuccess'));
    is_apply_language.value = false;
    apex_store.update_download_language_button_color();
    stepper_ref.value?.next();
  }).catch(err => {
    toast.error(String(err));
    is_apply_language.value = false;
    apex_store.update_download_language_button_color();
  });
}

async function copy_code() {
  const command = apex_store.download_language_depot_command;
  try {
    await writeText(command);
    copied_command.value = command;
  } catch (error) {
    copied_command.value = null;
    toast.error(`${t('toast.copyError')}: ${String(error)}`);
  }
}

async function open_console(advance_step: boolean) {
  try {
    await openUrl('steam://nav/console');
    if (advance_step) stepper_ref.value?.next();
  } catch (error) {
    toast.error(t('apex.milesDownload.openFailed', {message: String(error)}));
  }
}

async function open_depot_page() {
  try {
    await openUrl('https://steamdb.info/app/1172470/depots/');
  } catch (error) {
    toast.error(t('apex.milesDownload.openFailed', {message: String(error)}));
  }
}

function open_audio_folder() {
  openApexAudioFolderPath({
    platform: 'steam',
    eaUserId: null,
  }).catch((e) => {
    toast.error(String(e));
  });
}

function open_depot_download_folder() {
  openApexDepotDownloadFolderPath({
    depot: Number(apex_store.language_depot),
    platform: 'steam',
    eaUserId: null,
  }).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.download_miles_language_semi_automatic_dialog">
    <template v-slot:default="{  }">
      <v-card :title="t('apex.milesDownload.semiAutoTitle')">
        <v-stepper :items="stepper" ref="stepper_ref">
          <template v-slot:item.1>
            <v-card
              flat
              :subtitle="t('apex.milesDownload.openConsoleSubtitle')"
              :title="t('apex.milesDownload.openConsoleTitle')"
            >
              <v-row class="d-flex flex-row align-center" style="flex:1;width: 100%;padding: 30px"
                     align-content="space-between">
                <v-img
                  maxHeight="70px"
                  maxWidth="400px"
                  :src="steamConsoleImg"></v-img>
                <v-spacer/>
                <v-tooltip :text="t('apex.milesDownload.openDepotPage')" location="bottom">
                  <template #activator="{props}">
                    <v-btn
                      v-bind="props"
                      icon="mdi-open-in-new"
                      size="small"
                      variant="text"
                      :aria-label="t('apex.milesDownload.openDepotPage')"
                      @click="open_depot_page"
                    />
                  </template>
                </v-tooltip>
              </v-row>
              <div style="padding: 10px">
                <v-btn block @click="open_console(true)"
                       prepend-icon="mdi-console" variant="tonal"
                >{{ t('apex.milesDownload.openConsoleBtn') }}
                </v-btn>
              </div>
            </v-card>
          </template>
          <template v-slot:item.2>
            <v-card :title="t('apex.milesDownload.downloadDepotTitle')" flat>
              <v-col>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-console"
                    size="small"
                    variant="text"
                    :title="t('apex.milesDownload.openConsoleBtn')"
                    :aria-label="t('apex.milesDownload.openConsoleBtn')"
                    @click="open_console(false)"
                  />
                  {{ t('apex.milesDownload.enterCode') }}
                  <button type="button" class="link" @click="copy_code">
                    {{ apex_store.download_language_depot_command }}
                  </button>
                  <div v-if="is_code_copied">
                    <v-icon icon="mdi-check" color="green"></v-icon>
                    {{ t('apex.milesDownload.copied') }}
                  </div>
                  <div v-else> {{ t('apex.milesDownload.clickToCopy') }}</div>
                </div>
                <v-divider></v-divider>
                <v-layout>
                  <CodeDisplay
                    :title="t('apex.milesDownload.waitDownloadTitle')"
                    :code="apex_store.download_language_depot_command"
                  >
                    {{ t('apex.milesDownload.waitDownloadHintDownloading') }}<br/>
                    Downloading depot {{ apex_store.language_depot }} (2 files, xxxx MB) ...<br/>
                    {{ t('apex.milesDownload.waitDownloadHintSize') }}<br/>
                    {{ t('apex.milesDownload.waitDownloadHintDone') }}<br/>
                    {{ t('apex.milesDownload.waitDownloadPathHint', { depot: apex_store.language_depot }) }}<br/>
                    (manifest xxxxxxxxxxxxxxxxxxx)
                  </CodeDisplay>
                </v-layout>
              </v-col>
            </v-card>
          </template>
          <template v-slot:item.3>
            <v-card :title="t('apex.milesDownload.applyTitle')" flat>
              <div class="d-flex flex-row flex-wrap">
                {{ t('apex.milesDownload.applyCopyPrefix') }}
                <button type="button" class="link" @click="open_depot_download_folder">
                  {{ t('apex.milesDownload.applyVoicePackLink') }}
                </button>
                {{ t('apex.milesDownload.applyCopyMiddle') }}
                <button type="button" class="link" @click="open_audio_folder">
                  {{ t('apex.milesDownload.applyApexDirLink') }}
                </button>
                {{ t('apex.milesDownload.applyCopySuffix') }}
              </div>
              <div>{{ t('apex.milesDownload.applyThenSetLaunch') }}</div>
              <v-btn
                @click="apply_miles_language"
                :loading="is_apply_language"
                variant="tonal"
              >{{ t('apex.milesDownload.applyBtn') }}
              </v-btn>
            </v-card>
          </template>
          <template v-slot:item.4>
            <v-card :title="t('apex.milesDownload.noteTitle')" flat class="error_color warning-red-text-edge-animate">
              <div>{{ t('apex.milesDownload.noteLine1') }}</div>
              <div>{{ t('apex.milesDownload.noteLine2') }}</div>
            </v-card>
          </template>
        </v-stepper>
      </v-card>
    </template>
  </v-dialog>

</template>

<style scoped>
.link {
  border: 0;
  color: #747bff;
  cursor: pointer;
  background: #151212;
  font: inherit;
  padding: 2px 5px;
  border-radius: 5px;
  line-height: 1.1;
}

.link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

</style>
