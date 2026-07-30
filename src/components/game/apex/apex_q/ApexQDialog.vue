<script setup lang="ts">
import ApexQSetupPanel from './ApexQSetupPanel.vue';
import ApexQWorkbench from './ApexQWorkbench.vue';
import ApexQRoiCalibrateDialog from './ApexQRoiCalibrateDialog.vue';
import ApexQOverlayPlaceDialog from './ApexQOverlayPlaceDialog.vue';
import {useApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';

const controller = useApexQDialogController();
const {calibrateOpen, canNext, confirmDeleteOcr, deleteConfirmOpen, deletingOcr, enterMainUi, nextStep, onCalibrateConfirm, onOverlayPlaceConfirm, overlayPlaceOpen, prefs, prevStep, t, wizardStep} = controller;
</script>

<template>
  <v-card class="apex-q-card apex-q-window-card" flat>
      <v-card-text class="apex-q-body">
        <!-- Wizard -->
        <ApexQSetupPanel v-if="wizardStep >= 0" :controller="controller" />

        <!-- Main -->
        <ApexQWorkbench v-else :controller="controller" />
      </v-card-text>

      <v-divider v-if="wizardStep >= 0" />
      <v-card-actions v-if="wizardStep >= 0" class="apex-q-actions">
        <v-btn variant="text" :disabled="wizardStep === 0" @click="prevStep">
          {{ t('apex.apexQ.prev') }}
        </v-btn>
        <v-btn variant="text" @click="enterMainUi({skipped: true})">
          {{ t('apex.apexQ.skipSetup') }}
        </v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!canNext" @click="nextStep">
          {{ wizardStep === 6 ? t('apex.apexQ.finish') : wizardStep === 0 ? t('apex.apexQ.startSetup') : t('apex.apexQ.next') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <ApexQRoiCalibrateDialog
      v-model="calibrateOpen"
      :folder="prefs.screenshotFolder"
      :showpos-roi="prefs.showposRoi"
      :ping-roi="prefs.pingRoi"
      @confirm="onCalibrateConfirm"
    />
    <ApexQOverlayPlaceDialog
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
        <v-card-title>{{ t('apex.apexQ.ocrDeleteConfirmTitle') }}</v-card-title>
        <v-card-text>{{ t('apex.apexQ.ocrDeleteConfirmText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deletingOcr" @click="deleteConfirmOpen = false">
            {{ t('apex.apexQ.cancel') }}
          </v-btn>
          <v-btn color="error" variant="flat" :loading="deletingOcr" @click="confirmDeleteOcr">
            {{ t('apex.apexQ.ocrDeleteConfirmAction') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
</template>

<style src="./styles/apex-q-workbench.css"></style>
