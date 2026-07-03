<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {SteamUser} from '@/types/steam.ts';
import {steamAvatarUrl} from '@/utils/game/steam.ts';

const props = defineProps<{
  user: SteamUser | null | undefined;
}>();

const { t } = useI18n();
const avatarSrc = computed(() => steamAvatarUrl(props.user?.avatar));
</script>

<template>
  <div
    v-if="user"
    class="apply-account-hint mt-3"
  >
    <div class="text-caption text-medium-emphasis mb-2">
      {{ t('apex.closeSteamApplyAccount') }}
    </div>
    <div class="d-flex align-center ga-3 apply-account-row">
      <v-avatar size="40">
        <v-img
          v-if="avatarSrc"
          :src="avatarSrc"
          cover
          alt=""
        />
        <v-icon
          v-else
          icon="mdi-steam"
        />
      </v-avatar>
      <div class="min-w-0">
        <div class="text-body-2 font-weight-medium text-truncate">
          {{ user.name }}
        </div>
        <div class="text-caption text-medium-emphasis">
          Steam ID: {{ user.id }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.apply-account-hint {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.apply-account-row {
  min-width: 0;
}
</style>
