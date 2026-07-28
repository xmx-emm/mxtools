pub mod alter_q;
pub mod alter_q_ocr;
pub mod alter_q_ocr_download;
pub mod alter_q_rapid_ocr;
pub mod apex;
pub mod apex_settings;
pub mod apex_theta;
pub mod ea_desktop;
pub mod pubg;
pub mod steam;

pub use ea_desktop::{
    ea_desktop_is_running_by_tasklist, get_apex_launch_option_ea, get_ea_desktop_users,
    set_apex_launch_option_ea, thoroughly_kill_ea_desktop,
};
pub use steam::{get_steam_users, steam_is_running_by_tasklist, thoroughly_kill_steam};
