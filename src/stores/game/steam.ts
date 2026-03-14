import {defineStore} from "pinia";
import {SteamUser} from "@/type.ts";
import {invoke} from "@tauri-apps/api/core";
import {useToast} from "vue-toastification";

const toast = useToast();

export const steamStore = defineStore("steam", {
    state: () => ({
        active_steam_user: <SteamUser | null>null,
        last_steam_user: <SteamUser | null>null,
        steam_users: <SteamUser[]>[],
        is_steam_running: false
    }),
    actions: {
        refresh_users() {
            invoke<SteamUser[]>("get_steam_users")
                .then((users) => {
                    if ((this.last_steam_user === null || this.active_steam_user === null) && users.length !== 0) {
                        this.last_steam_user = this.active_steam_user = users[0]
                    }
                    this.steam_users = users;
                }).catch((e) => {
                toast.error(e);
            });
        },
        set_active_steam_user(user: SteamUser) {
            this.last_steam_user = this.active_steam_user = user
        },
        async check_is_steam_running() {
            const is_running = await invoke<boolean>("steam_is_running_by_tasklist")
            if (this.is_steam_running !== is_running) {
                this.is_steam_running = is_running
            }
        }
    },
    tauri: { autoStart: true },
})