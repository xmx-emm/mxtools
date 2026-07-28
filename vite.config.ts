import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import vuetify from 'vite-plugin-vuetify';

// ts-expect-error process is a Node.js global
const host = process.env.TAURI_DEV_HOST;
// https://vite.dev/config/

export default defineConfig(async () => ({
    plugins: [vue(),
        vuetify({
            autoImport: true,
            styles: {
                configFile: 'src/styles/vuetify-settings.scss',
            },
        }), // Enabled by default
    ],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        css: {
            preprocessorOptions: {
                scss: {api: 'modern-compiler'},
            },
        },
        // 避开常见 5173 占用(其它 Tauri 项目)与 Hyper-V 低段保留端口
        port: 14200,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: 'ws',
                host,
                port: 14201,
            }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'), // 设置 @ 指向 src
            'ASSETS': path.join(path.resolve(__dirname, 'src'), "assets"), // 设置 @ 指向 src
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
    },
    build: {
        manifest: true,
        rollupOptions: {
            onwarn(warning, warn) {
                if (
                    warning.code === 'IMPORT_IS_UNDEFINED' &&
                    warning.message?.includes('currentInstance') &&
                    warning.id?.includes('vue-i18n')
                ) {
                    return;
                }
                warn(warning);
            },
        },
        chunkSizeWarningLimit: 1000, // 调整警告限制为 1000 kB
    },
}));
