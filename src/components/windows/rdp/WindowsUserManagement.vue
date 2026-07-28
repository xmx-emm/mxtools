<script setup lang="ts">
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useWindowsUserStore} from '@/stores/windows_user.ts';
import {
  addWindowsUser,
  deleteWindowsUser,
  modifyWindowsUserPassword,
  renameWindowsUser,
} from '@/ipc/commands.ts';

const { t } = useI18n();
const toast = useToast();
const store = useWindowsUserStore();

const showAddDialog = ref(false);
const showModifyDialog = ref(false);
const showRenameDialog = ref(false);

const newUsername = ref('');
const newPassword = ref('');
const modifyUsername = ref('');
const modifyPassword = ref('');
const renameOldName = ref('');
const renameNewName = ref('');
const actionLoading = ref(false);

async function addUser() {
  if (!newUsername.value || !newPassword.value) {
    toast.error(t('rdp.user.fillRequired'));
    return;
  }
  actionLoading.value = true;
  try {
    await addWindowsUser({ username: newUsername.value, password: newPassword.value });
    toast.success(t('rdp.user.addSuccess'));
    newUsername.value = '';
    newPassword.value = '';
    showAddDialog.value = false;
    await store.loadUsers();
  } catch (e: unknown) {
    toast.error(String(e));
  }
  actionLoading.value = false;
}

async function deleteUser(username: string) {
  if (!confirm(t('rdp.user.deleteConfirm', { name: username }))) return;
  actionLoading.value = true;
  try {
    await deleteWindowsUser({ username });
    toast.success(t('rdp.user.deleteSuccess'));
    await store.loadUsers();
  } catch (e: unknown) {
    toast.error(String(e));
  }
  actionLoading.value = false;
}

function openModifyDialog(username: string) {
  modifyUsername.value = username;
  modifyPassword.value = '';
  showModifyDialog.value = true;
}

async function modifyPassword_() {
  if (!modifyPassword.value) {
    toast.error(t('rdp.user.fillNewPassword'));
    return;
  }
  actionLoading.value = true;
  try {
    await modifyWindowsUserPassword({
      username: modifyUsername.value,
      newPassword: modifyPassword.value,
    });
    toast.success(t('rdp.user.modifyPasswordSuccess'));
    showModifyDialog.value = false;
  } catch (e: unknown) {
    toast.error(String(e));
  }
  actionLoading.value = false;
}

function openRenameDialog(username: string) {
  renameOldName.value = username;
  renameNewName.value = '';
  showRenameDialog.value = true;
}

async function renameUser() {
  if (!renameNewName.value) {
    toast.error(t('rdp.user.fillNewName'));
    return;
  }
  actionLoading.value = true;
  try {
    await renameWindowsUser({
      oldName: renameOldName.value,
      newName: renameNewName.value,
    });
    toast.success(t('rdp.user.renameSuccess'));
    showRenameDialog.value = false;
    await store.loadUsers();
  } catch (e: unknown) {
    toast.error(String(e));
  }
  actionLoading.value = false;
}
</script>

<template>
  <v-card variant="flat" class="rdp-card mb-4">
    <v-card-title class="d-flex align-center text-subtitle-1 font-weight-medium pb-1">
      <span class="flex-grow-1">{{ t('rdp.user.title') }}</span>
      <v-btn
        size="small"
        variant="tonal"
        rounded="lg"
        prepend-icon="mdi-refresh"
        :loading="store.loading"
        @click="store.loadUsers()"
      >
        {{ t('common.refresh') }}
      </v-btn>
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('rdp.user.subtitle') }}
    </v-card-subtitle>
    <v-card-text>
      <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-3"/>
      <v-list v-else-if="store.users.length > 0" density="compact">
        <v-list-item
          v-for="user in store.users"
          :key="user.name"
          :title="user.name"
        >
          <template v-slot:prepend>
            <v-icon icon="mdi-account"/>
          </template>
          <template v-slot:append>
            <v-chip v-if="user.is_rdp_user" color="primary" size="small" variant="tonal" class="mr-2">
              {{ t('rdp.user.rdpBadge') }}
            </v-chip>
            <v-btn icon="mdi-pencil" size="small" variant="text" @click="openRenameDialog(user.name)"
                   :title="t('rdp.user.rename')"/>
            <v-btn icon="mdi-lock-reset" size="small" variant="text" @click="openModifyDialog(user.name)"
                   :title="t('rdp.user.modifyPassword')"/>
            <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteUser(user.name)"
                   :title="t('rdp.user.delete')"/>
          </template>
        </v-list-item>
      </v-list>
      <p v-else class="text-caption text-medium-emphasis mb-0">
        {{ t('rdp.user.empty') }}
      </p>
    </v-card-text>
    <v-card-actions class="pt-0">
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-account-plus" @click="showAddDialog = true">
        {{ t('rdp.user.add') }}
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="showAddDialog" max-width="420">
      <v-card :title="t('rdp.user.addTitle')">
        <v-card-text>
          <v-text-field v-model="newUsername" :label="t('rdp.user.username')" variant="outlined" density="compact"
                        class="mb-2"/>
          <v-text-field v-model="newPassword" :label="t('rdp.user.password')" variant="outlined" density="compact"
                        type="password"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showAddDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="actionLoading" @click="addUser">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showModifyDialog" max-width="420">
      <v-card :title="t('rdp.user.modifyPasswordTitle')">
        <v-card-text>
          <div class="text-body-2 mb-2">{{ t('rdp.user.modifyPasswordFor') }} <strong>{{ modifyUsername }}</strong>
          </div>
          <v-text-field v-model="modifyPassword" :label="t('rdp.user.newPassword')" variant="outlined" density="compact"
                        type="password"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showModifyDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="actionLoading" @click="modifyPassword_">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showRenameDialog" max-width="420">
      <v-card :title="t('rdp.user.renameTitle')">
        <v-card-text>
          <div class="text-body-2 mb-2">{{ t('rdp.user.renameFrom') }} <strong>{{ renameOldName }}</strong></div>
          <v-text-field v-model="renameNewName" :label="t('rdp.user.newName')" variant="outlined" density="compact"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showRenameDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="actionLoading" @click="renameUser">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
