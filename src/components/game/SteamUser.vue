<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import steamStore from '@/stores/game/steam.ts';
import {steamAvatarUrl} from '@/utils/game/steam.ts';

withDefaults(
  defineProps<{ accountHint?: string }>(),
  { accountHint: 'Steam id 578080' },
);

const emits = defineEmits(['update_user']);
const gameStore = steamStore();
const { t } = useI18n();

const activeAvatarSrc = computed(() => steamAvatarUrl(gameStore.active_steam_user?.avatar));
</script>

<template>
  <v-menu class="not_select">
    <v-list>
      <v-list-item v-for="user in gameStore.steam_users"
                   v-if="gameStore.steam_users.length > 0"
                   :title="user.name"
                   :subtitle="user.id"
                   @click="gameStore.set_active_steam_user(user);emits('update_user')"
      >
        <template v-slot:prepend>
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
      <v-list-item v-else>
        {{ t('steam.emptyUserList') }}
      </v-list-item>
    </v-list>
    <template v-slot:activator="{ props }">
      <div style="display: flex; align-items: end; justify-content: start;">
        <v-btn
          icon
          v-bind="props"
          :title="gameStore.active_steam_user?.name"
        >
          <v-avatar size="large">
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
          <v-tooltip :text="accountHint">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps" class="d-inline-flex align-center">
                <v-icon icon="mdi-steam" size="small" color="primary" />
              </span>
            </template>
          </v-tooltip>
          <div v-bind="props" class="text-body-2">{{ gameStore.active_steam_user?.name }}</div>
        </div>
      </div>
    </template>
  </v-menu>
</template>

<style scoped>
.launcher-user-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin-inline-start: 8px;
}
</style>
