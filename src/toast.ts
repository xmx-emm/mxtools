import {PluginOptions} from "vue-toastification";
import {POSITION} from "vue-toastification/src/ts/constants.ts";

const toastOptions: PluginOptions = {
    // You can set your default options here
    position: POSITION.TOP_RIGHT,
    timeout: 2500,
    closeOnClick: true,
    pauseOnFocusLoss: true,
    pauseOnHover: true,
    draggable: true,
    draggablePercent: .6,
    showCloseButtonOnHover: false,
    hideProgressBar: false,
    // closeButton: 'button',
    icon: true,
    rtl: false
};

export {toastOptions}