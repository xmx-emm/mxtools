pub mod apex;
pub mod ea_desktop;
pub mod pubg;
pub mod steam;

pub use ea_desktop::{
  ea_desktop_is_running_by_tasklist, get_apex_launch_option_ea, get_ea_desktop_users,
  set_apex_launch_option_ea, thoroughly_kill_ea_desktop,
};
pub use steam::{
    get_steam_users, steam_is_running, steam_is_running_by_tasklist, thoroughly_kill_steam,
};
