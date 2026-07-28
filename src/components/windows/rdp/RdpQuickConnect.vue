<script setup lang="ts">
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useRdpStore} from '@/stores/rdp.ts';
import type {RdpConnection} from '@/types/rdp.ts';
import {save} from '@tauri-apps/plugin-dialog';
import {connectRdp, exportRdpFile} from '@/ipc/commands.ts';

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
  if (!form.value.name || !form.value.ip) {
    toast.error(t('rdp.connect.fillRequired'));
    return;
  }
  try {
    store.connections.push({ ...form.value });
    await store.saveConnections();
    showAddDialog.value = false;
    toast.success(t('rdp.connect.addSuccess'));
  } catch (e: unknown) {
    store.connections.pop();
    toast.error(String(e) || t('rdp.connect.saveFailed'));
  }
}

async function saveEdit() {
  if (!form.value.name || !form.value.ip) {
    toast.error(t('rdp.connect.fillRequired'));
    return;
  }
  const prev = { ...store.connections[editIndex.value] };
  try {
    store.connections[editIndex.value] = { ...form.value };
    await store.saveConnections();
    showEditDialog.value = false;
    toast.success(t('common.save'));
  } catch (e: unknown) {
    store.connections[editIndex.value] = prev;
    toast.error(String(e) || t('rdp.connect.saveFailed'));
  }
}

async function deleteConnection(index: number) {
  const name = store.connections[index]?.name ?? '';
  if (!confirm(t('rdp.connect.deleteConfirm', { name }))) return;
  const removed = store.connections.splice(index, 1);
  try {
    await store.saveConnections();
    toast.success(t('rdp.connect.deleted'));
  } catch (e: unknown) {
    if (removed[0]) store.connections.splice(index, 0, removed[0]);
    toast.error(String(e) || t('rdp.connect.saveFailed'));
  }
}

async function connectTo(conn: RdpConnection, index: number) {
  connecting.value = index;
  try {
    await connectRdp({
      ip: conn.ip,
      port: conn.port,
      username: conn.username || null,
    });
  } catch (e: unknown) {
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
      await exportRdpFile({ connection: conn, path });
      toast.success(t('rdp.connect.exportSuccess'));
    }
  } catch (e: unknown) {
    toast.error(String(e));
  }
}
</script>

<template>
  <v-card variant="flat" class="rdp-card mb-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.connect.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('rdp.connect.subtitle') }}
    </v-card-subtitle>
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
    <v-card-actions class="pt-0">
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-plus" @click="openAddDialog">
        {{ t('rdp.connect.add') }}
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="showAddDialog" max-width="460">
      <v-card :title="t('rdp.connect.addTitle')">
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('rdp.connect.connName')" variant="outlined" density="compact"
                        class="mb-2"/>
          <v-row dense>
            <v-col cols="8">
              <v-text-field v-model="form.ip" :label="t('rdp.portCheck.ipLabel')" variant="outlined" density="compact"
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

    <v-dialog v-model="showEditDialog" max-width="460">
      <v-card :title="t('rdp.connect.editTitle')">
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('rdp.connect.connName')" variant="outlined" density="compact"
                        class="mb-2"/>
          <v-row dense>
            <v-col cols="8">
              <v-text-field v-model="form.ip" :label="t('rdp.portCheck.ipLabel')" variant="outlined" density="compact"/>
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
