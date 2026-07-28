<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {ref} from 'vue';
import {getLogFolderPath, getLogsForFeedback, getSystemInfo} from '@/ipc/commands.ts';
import {openPath, openUrl} from '@tauri-apps/plugin-opener';
import {useToast} from 'vue-toastification';
import {version} from '@/env.ts';
import {GITHUB_ISSUE_URL} from '@/data/url_other.ts';

const { t } = useI18n();
const toast = useToast();

const dialog = ref(false);
const description = ref('');
const loading = ref(false);

async function buildIssueBody(): Promise<string> {
  loading.value = true;
  try {
    const [sysRows, logs] = await Promise.all([
      getSystemInfo(),
      getLogsForFeedback(),
    ]);

    const systemSection = (sysRows || [])
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const empty = t('settings.feedbackBodyEmpty');
    const body = [
      t('settings.feedbackBodyEnv'),
      '',
      t('settings.feedbackBodyAppVersion', { version: version.value || 'unknown' }),
      '',
      t('settings.feedbackBodySystem'),
      systemSection,
      '',
      t('settings.feedbackBodyDescription'),
      '',
      description.value || t('settings.feedbackBodyDescriptionEmpty'),
      '',
      t('settings.feedbackBodyLogs'),
      '',
      t('settings.feedbackBodyLogsHint'),
      '',
      t('settings.feedbackBodyBackendLogs'),
      '```',
      logs?.backend || empty,
      '```',
      '',
      t('settings.feedbackBodyFrontendLogs'),
      '```',
      logs?.frontend || empty,
      '```',
    ].join('\n');

    // URL 长度限制约 2KB,超长时截断日志部分
    const maxLen = 6000;
    if (body.length > maxLen) {
      return body.slice(0, maxLen) + t('settings.feedbackBodyTruncated');
    }
    return body;
  } finally {
    loading.value = false;
  }
}

async function openGitHubIssue() {
  try {
    const body = await buildIssueBody();
    const summary = description.value?.slice(0, 50) || t('settings.feedbackIssueTitleFallback');
    const params = new URLSearchParams({
      title: t('settings.feedbackIssueTitle', { summary }),
      body,
    });
    const url = `${GITHUB_ISSUE_URL}?${params.toString()}`;
    await openUrl(url);
    // 打开日志文件夹,方便用户将 backend.log、frontend.log 拖入 Issue
    try {
      const logFolder = await getLogFolderPath();
      await openPath(logFolder);
    } catch {
      // 忽略打开文件夹失败
    }
    dialog.value = false;
    description.value = '';
    toast.success(t('settings.feedbackSuccess'));
  } catch (e) {
    console.error('openGitHubIssue error', e);
    toast.error(String(e));
  }
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="500" persistent>
    <template v-slot:activator="{ props }">
      <v-btn color="warning" variant="tonal" rounded="lg" v-bind="props">
        {{ t('settings.feedbackError') }}
      </v-btn>
    </template>
    <v-card>
      <v-card-title>{{ t('settings.feedbackError') }}</v-card-title>
      <v-card-subtitle>{{ t('settings.feedbackErrorDesc') }}</v-card-subtitle>
      <v-card-text class="d-flex flex-column gap-3">
        <v-textarea
          v-model="description"
          :label="t('settings.feedbackDescription')"
          :placeholder="t('settings.feedbackDescriptionPlaceholder')"
          rows="4"
          variant="outlined"
          hide-details
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn @click="dialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          @click="openGitHubIssue"
        >
          {{ t('settings.feedbackOpenIssue') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
