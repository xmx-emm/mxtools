<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useRdpStore} from '@/stores/rdp.ts';
import type {RdpConnection} from '@/type.ts';
import {save} from '@tauri-apps/plugin-dialog';

const { t } = useI18n();
const toast = useToast();
const store = useRdpStore();

const showAddDialog = ref(false);
const showEditDialog = ref(false);
const editIndex = ref(-1);
const connecting = ref<number | null>(null);

const form = ref<RdpConnection>({
  name: '',
  ip: '',
  port: 3389,
  username: '',
});

function resetForm() {
  form.value = { name: '', ip: '', port: 3389, username: '' };
}

function openAddDialog() {
  resetForm();
  showAddDialog.value = true;
}

function openEditDialog(index: number) {
  editIndex.value = index;
  form.value = { ...store.connections[index] };
  showEditDialog.value = true;
}

async function addConnection() {
  if (!form.value.name || !form.value.ip) return;
  store.connections.push({ ...form.value });
  await store.saveConnections();
  showAddDialog.value = false;
  toast.success(t('rdp.connect.addSuccess'));
}

async function saveEdit() {
  if (!form.value.name || !form.value.ip) return;
  store.connections[editIndex.value] = { ...form.value };
  await store.saveConnections();
  showEditDialog.value = false;
  toast.success(t('common.save'));
}

async function deleteConnection(index: number) {
  store.connections.splice(index, 1);
  await store.saveConnections();
  toast.success(t('rdp.connect.deleted'));
}

async function connectTo(conn: RdpConnection, index: number) {
  connecting.value = index;
  try {
    await invoke('connect_rdp', { ip: conn.ip, port: conn.port });
  } catch (e: any) {
    toast.error(String(e));
  }
  connecting.value = null;
}

async function exportRdp(conn: RdpConnection) {
  try {
    const path = await save({
      defaultPath: `${conn.name}.rdp`,
      filters: [{ name: 'RDP File', extensions: ['rdp'] }],
    });
    if (path) {
      await invoke('export_rdp_file', { connection: conn, path });
      toast.success(t('rdp.connect.exportSuccess'));
    }
  } catch (e: any) {
    toast.error(String(e));
  }
}

onMounted(() => {
  store.loadConnections();
});
</script>

<template>
  <v-card variant="flat" class="mb-4">
    <v-card-title>{{ t('rdp.connect.title') }}</v-card-title>
    <v-card-subtitle>{{ t('rdp.connect.subtitle') }}</v-card-subtitle>
    <v-card-text>
      <v-list v-if="store.connections.length > 0" density="compact">
        <v-list-item
          v-for="(conn, index) in store.connections"
          :key="index"
          :title="conn.name"
          :subtitle="`${conn.ip}:${conn.port}${conn.username ? ' (' + conn.username + ')' : ''}`"
        >
          <template v-slot:prepend>
            <v-icon icon="mdi-monitor"/>
          </template>
          <template v-slot:append>
            <v-btn
              icon="mdi-play"
              size="small"
              variant="text"
              color="success"
              :loading="connecting === index"
              @click="connectTo(conn, index)"
              :title="t('rdp.connect.connect')"
            />
            <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEditDialog(index)"
                   :title="t('rdp.connect.edit')"/>
            <v-btn icon="mdi-export" size="small" variant="text" @click="exportRdp(conn)"
                   :title="t('rdp.connect.export')"/>
            <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteConnection(index)"
                   :title="t('rdp.connect.delete')"/>
          </template>
        </v-list-item>
      </v-list>
      <div v-else class="text-body-2 text-medium-emphasis">
        {{ t('rdp.connect.empty') }}
      </div>
    </v-card-text>
    <v-card-actions>
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-plus" @click="openAddDialog">
        {{ t('rdp.connect.add') }}
      </v-btn>
    </v-card-actions>

    <!-- Add Dialog -->
    <v-dialog v-model="showAddDialog" max-width="460">
      <v-card :title="t('rdp.connect.addTitle')">
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('rdp.connect.connName')" variant="outlined" density="compact"
                        class="mb-2"/>
          <v-row dense>
            <v-col cols="8">
              <v-text-field v-model="form.ip" label="IP" variant="outlined" density="compact"
                            placeholder="192.168.1.100"/>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model.number="form.port" :label="t('rdp.port.label')" variant="outlined" density="compact"
                            type="number"/>
            </v-col>
          </v-row>
          <v-text-field v-model="form.username" :label="t('rdp.user.username')" variant="outlined" density="compact"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showAddDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" @click="addConnection">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit Dialog -->
    <v-dialog v-model="showEditDialog" max-width="460">
      <v-card :title="t('rdp.connect.editTitle')">
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('rdp.connect.connName')" variant="outlined" density="compact"
                        class="mb-2"/>
          <v-row dense>
            <v-col cols="8">
              <v-text-field v-model="form.ip" label="IP" variant="outlined" density="compact"/>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model.number="form.port" :label="t('rdp.port.label')" variant="outlined" density="compact"
                            type="number"/>
            </v-col>
          </v-row>
          <v-text-field v-model="form.username" :label="t('rdp.user.username')" variant="outlined" density="compact"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showEditDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" @click="saveEdit">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
