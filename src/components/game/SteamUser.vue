<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useSteamStore} from '@/stores/game/steam.ts';
import {steamAvatarUrl} from '@/utils/game/steam.ts';

withDefaults(
  defineProps<{ accountHint?: string }>(),
  { accountHint: '' },
);

const emits = defineEmits(['update_user']);
const gameStore = useSteamStore();
const { t } = useI18n();

const activeAvatarSrc = computed(() => steamAvatarUrl(gameStore.active_steam_user?.avatar));
</script>

<template>
  <v-menu class="not_select">
    <v-list>
      <template v-if="gameStore.steam_users.length > 0">
        <v-list-item
          v-for="user in gameStore.steam_users"
          :key="user.id"
          :title="user.name"
          :subtitle="user.id"
          @click="gameStore.set_active_steam_user(user); emits('update_user')"
        >
          <template #prepend>
            <v-avatar :title="user.config_path">
              <v-img
                v-if="steamAvatarUrl(user.avatar)"
                :src="steamAvatarUrl(user.avatar)"
                cover
                alt=""
              />
              <v-icon v-else icon="mdi-steam" />
            </v-avatar>
          </template>
        </v-list-item>
      </template>
      <v-list-item v-else>
        {{ t('steam.emptyUserList') }}
      </v-list-item>
    </v-list>
    <template v-slot:activator="{ props }">
      <div class="steam-user-trigger">
        <v-btn
          icon
          size="small"
          density="compact"
          variant="text"
          class="steam-user-avatar"
          v-bind="props"
          :title="gameStore.active_steam_user?.name || t('steam.emptyUserList')"
          :aria-label="gameStore.active_steam_user?.name || t('steam.emptyUserList')"
        >
          <v-avatar size="32">
            <v-img
              v-if="activeAvatarSrc"
              :src="activeAvatarSrc"
              cover
              alt=""
            />
            <v-icon v-else icon="mdi-steam" />
          </v-avatar>
        </v-btn>
        <div class="launcher-user-text">
          <div class="steam-user-name-row">
            <v-tooltip v-if="accountHint" :text="accountHint">
              <template #activator="{ props: tipProps }">
                <span v-bind="tipProps" class="steam-user-provider" :aria-label="accountHint">
                  <v-icon icon="mdi-steam" size="small" color="primary" />
                </span>
              </template>
            </v-tooltip>
            <v-icon v-else icon="mdi-steam" size="small" color="primary" />
            <span v-bind="props" class="text-body-2 launcher-user-name">
              {{ gameStore.active_steam_user?.name || t('steam.emptyUserList') }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </v-menu>
</template>

<style scoped>
.steam-user-trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  max-width: 100%;
}

.steam-user-avatar {
  flex: 0 0 32px;
  width: 32px !important;
  min-width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
}

.steam-user-avatar :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.launcher-user-text {
  display: flex;
  flex-direction: column;
  margin-inline-start: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.steam-user-name-row {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
}

.steam-user-provider {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.launcher-user-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
