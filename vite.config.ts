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
    // `preprocessorOptions` 是顶层 `css` 选项；放在 `server` 下不会生效
    css: {
        preprocessorOptions: {
            scss: {api: 'modern-compiler'},
        },
    },
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
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
        // 路由页面按需加载，开发期首次点开某页才会触发转换与 Vuetify 样式编译，
        // 表现为切换卡顿。启动时提前预热这些入口，把该成本移出交互路径。
        warmup: {
            clientFiles: [
                './src/main.ts',
                './src/App.vue',
                './src/views/*.vue',
                './src/pages/**/*.vue',
                './src/components/Navigation.vue',
                './src/components/AppTopBar.vue',
            ],
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
        include: ['tests/**/*.{test,spec}.ts'],
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
