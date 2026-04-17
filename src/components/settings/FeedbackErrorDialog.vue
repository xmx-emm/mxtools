<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {openPath, openUrl} from '@tauri-apps/plugin-opener';
import {useToast} from 'vue-toastification';
import {version} from '@/env';
import {GITHUB_ISSUE_URL} from '@/data/url.ts';

const { t } = useI18n();
const toast = useToast();

const dialog = ref(false);
const description = ref('');
const loading = ref(false);

async function buildIssueBody(): Promise<string> {
  loading.value = true;
  try {
    const [systemInfo, logs] = await Promise.all([
      invoke<[string, string][]>('system_info'),
      invoke<{ backend: string; frontend: string }>('get_logs_for_feedback'),
    ]);

    const systemSection = (systemInfo || [])
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');

    const body = [
      '## 环境信息',
      '',
      `- **软件版本**: ${version.value || 'unknown'}`,
      '',
      '### 系统信息',
      systemSection,
      '',
      '## 问题描述',
      '',
      description.value || '(未填写)',
      '',
      '## 日志',
      '',
      '> 请将 Documents/mxtools/ 下的 **backend.log** 和 **frontend.log** 拖入本 Issue 编辑区以上传完整日志',
      '',
      '### 后端日志(摘要)',
      '```',
      logs?.backend || '(无)',
      '```',
      '',
      '### 前端日志(摘要)',
      '```',
      logs?.frontend || '(无)',
      '```',
    ].join('\n');

    // URL 长度限制约 2KB,超长时截断日志部分
    const maxLen = 6000;
    if (body.length > maxLen) {
      return body.slice(0, maxLen) + '\n\n...(日志已截断,请将 Documents/mxtools/ 下的日志文件拖入本 Issue)';
    }
    return body;
  } finally {
    loading.value = false;
  }
}

async function openGitHubIssue() {
  try {
    const body = await buildIssueBody();
    const params = new URLSearchParams({
      title: `[反馈] ${description.value?.slice(0, 50) || '问题反馈'}`,
      body,
    });
    const url = `${GITHUB_ISSUE_URL}?${params.toString()}`;
    await openUrl(url);
    // 打开日志文件夹,方便用户将 backend.log、frontend.log 拖入 Issue
    try {
      const logFolder = await invoke<string>('get_log_folder_path');
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
