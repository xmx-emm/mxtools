import {WebviewWindow} from "@tauri-apps/api/webviewWindow";
import type {WindowOptions} from "@tauri-apps/api/window";

async function openWebWindow(route: string, options?: WindowOptions) {
    const title = options?.title;
    const windowName = `${route}-window`
    const window = await WebviewWindow.getByLabel(windowName);
    if (window !== null) {
        await window.setTitle(title || route);
        await window.setFocus();
        await window.show();
        return;
    }
    const webview = new WebviewWindow(windowName, {
        url: `#/${route}`, // 对应 Vue Router 的路径(Hash 模式加 #)
        title: title || route,
        width: options?.width || (route === 'about' ? 750 : 600),
        height: options?.height || (route === 'about' ? 600 : 400),
        // decorations:false,
        ...options,
    });
    await webview.once('tauri://created', (e) => {
        console.log(`${route}窗口创建成功`, e);
    })
    await webview.once('tauri://error', (e) => {
        console.error(`${route}窗口创建失败：`, e);
    });
}
function  openAboutWindow() {
    openWebWindow('about', {height: 600, title: '关于'}).then( () =>{})
}
export {
    openWebWindow,
    openAboutWindow,
}