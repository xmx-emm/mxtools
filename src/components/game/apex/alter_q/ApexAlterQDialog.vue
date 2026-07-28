<script setup lang="ts">
import ApexAlterQSetupPanel from './ApexAlterQSetupPanel.vue';
import ApexAlterQWorkbench from './ApexAlterQWorkbench.vue';
import ApexAlterQRoiCalibrateDialog from './ApexAlterQRoiCalibrateDialog.vue';
import ApexAlterQOverlayPlaceDialog from './ApexAlterQOverlayPlaceDialog.vue';
import {useAlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';

const controller = useAlterQDialogController();
const {calibrateOpen, canNext, confirmDeleteOcr, deleteConfirmOpen, deletingOcr, enterMainUi, nextStep, onCalibrateConfirm, onOverlayPlaceConfirm, overlayPlaceOpen, prefs, prevStep, t, wizardStep} = controller;
</script>

<template>
  <v-card class="alter-q-card alter-q-window-card" flat>
      <v-card-text class="alter-q-body">
        <!-- Wizard -->
        <ApexAlterQSetupPanel v-if="wizardStep >= 0" :controller="controller" />

        <!-- Main -->
        <ApexAlterQWorkbench v-else :controller="controller" />
      </v-card-text>

      <v-divider v-if="wizardStep >= 0" />
      <v-card-actions v-if="wizardStep >= 0" class="alter-q-actions">
        <v-btn variant="text" :disabled="wizardStep === 0" @click="prevStep">
          {{ t('apex.alterQ.prev') }}
        </v-btn>
        <v-btn variant="text" @click="enterMainUi({skipped: true})">
          {{ t('apex.alterQ.skipSetup') }}
        </v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!canNext" @click="nextStep">
          {{ wizardStep === 6 ? t('apex.alterQ.finish') : wizardStep === 0 ? t('apex.alterQ.startSetup') : t('apex.alterQ.next') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <ApexAlterQRoiCalibrateDialog
      v-model="calibrateOpen"
      :folder="prefs.screenshotFolder"
      :showpos-roi="prefs.showposRoi"
      :ping-roi="prefs.pingRoi"
      @confirm="onCalibrateConfirm"
    />
    <ApexAlterQOverlayPlaceDialog
      v-model="overlayPlaceOpen"
      :folder="prefs.screenshotFolder"
      :overlay-x="prefs.overlayX"
      :overlay-y="prefs.overlayY"
      :overlay-w="prefs.overlayW"
      :overlay-h="prefs.overlayH"
      :placement="prefs.overlayPlacement"
      @confirm="onOverlayPlaceConfirm"
    />

    <v-dialog v-model="deleteConfirmOpen" max-width="420" persistent>
      <v-card>
        <v-card-title>{{ t('apex.alterQ.ocrDeleteConfirmTitle') }}</v-card-title>
        <v-card-text>{{ t('apex.alterQ.ocrDeleteConfirmText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deletingOcr" @click="deleteConfirmOpen = false">
            {{ t('apex.alterQ.cancel') }}
          </v-btn>
          <v-btn color="error" variant="flat" :loading="deletingOcr" @click="confirmDeleteOcr">
            {{ t('apex.alterQ.ocrDeleteConfirmAction') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
</template>

<style src="./styles/alter-q-workbench.css"></style>
