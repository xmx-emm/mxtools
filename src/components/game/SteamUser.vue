<script setup lang="ts">
import {steamStore} from "@/stores/game/steam.ts";
const emits = defineEmits(["update_user"]);
const gameStore = steamStore();
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
          <v-avatar :image="`https://avatars.fastly.steamstatic.com/${user.avatar}_full.jpg`"
                    :title="user.config_path"></v-avatar>
        </template>
      </v-list-item>
      <v-list-item v-else>
        Not find steam user
      </v-list-item>
    </v-list>
    <template v-slot:activator="{ props }">
      <div style="display: flex; align-items: end; justify-content: start;">
        <v-btn
            icon
            v-bind="props"
            :title="gameStore.active_steam_user?.name"
        >
          <v-avatar
              size="large"
              :image="`https://avatars.fastly.steamstatic.com/${gameStore.active_steam_user?.avatar}_full.jpg`"
          >
          </v-avatar>
        </v-btn>
        <div>
          <slot/>
          <div v-bind="props">{{ gameStore.active_steam_user?.name }}</div>
        </div>
      </div>
    </template>
  </v-menu>
</template>

<style scoped>

</style>