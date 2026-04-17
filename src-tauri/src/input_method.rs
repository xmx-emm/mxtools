//! Windows input method (keyboard layout) order and enable/disable via registry.
//! Preload: HKEY_CURRENT_USER\Keyboard Layout\Preload (values "1","2",... = layout id)
//! Layout names: HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Keyboard Layouts\{id}
//! CTF (Win10+): AssemblyItem 含各 IME(微软拼音、五笔等),TIP\LanguageProfile 含显示名

#[tauri::command]
#[cfg(not(windows))]
pub fn get_input_methods() -> Result<Vec<InputMethodItem>, String> {
    Err("Input method management is only supported on Windows".to_string())
}

#[tauri::command]
#[cfg(not(windows))]
pub fn set_input_method_order(_ids: Vec<String>) -> Result<(), String> {
    Err("Input method management is only supported on Windows".to_string())
}

#[tauri::command]
#[cfg(not(windows))]
pub fn set_input_method_enabled(_id: String, _enabled: bool) -> Result<(), String> {
    Err("Input method management is only supported on Windows".to_string())
}

#[cfg(windows)]
const PRELOAD_PATH: &str = "Keyboard Layout\\Preload";
#[cfg(windows)]
const CTF_LANGUAGE_PATH: &str = "Software\\Microsoft\\CTF\\SortOrder\\Language";
#[cfg(windows)]
const CTF_ASSEMBLY_ITEM_PATH: &str = "Software\\Microsoft\\CTF\\SortOrder\\AssemblyItem";
#[cfg(windows)]
const CTF_TIP_PATH: &str = "SOFTWARE\\Microsoft\\CTF\\TIP";
#[cfg(windows)]
const LAYOUTS_PATH: &str = "SYSTEM\\CurrentControlSet\\Control\\Keyboard Layouts";

#[derive(serde::Serialize, Clone, Debug)]
pub struct InputMethodItem {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub order: u32,
}

#[cfg(windows)]
fn normalize_layout_id(id: &str) -> String {
    let s = id.trim().replace("0x", "").replace("0X", "");
    let n = s.len();
    if n >= 8 {
        s[..8].to_uppercase()
    } else {
        format!("{:0>8}", s.to_uppercase())
    }
}

#[cfg(windows)]
fn reg_value_to_string(value: &winreg::RegValue) -> Option<String> {
    use winreg::enums::RegType;

    if value.bytes.is_empty() {
        return None;
    }
    // REG_DWORD: 4 字节,转为 8 位十六进制字符串(如 0x0804 -> "00000804")
    if value.vtype == RegType::REG_DWORD && value.bytes.len() >= 4 {
        let v = u32::from_le_bytes([
            value.bytes[0],
            value.bytes[1],
            value.bytes[2],
            value.bytes[3],
        ]);
        return Some(format!("{:08X}", v));
    }
    // REG_SZ / REG_EXPAND_SZ / REG_MULTI_SZ: UTF-16LE(与 winreg 一致：仅去除末尾 \0)
    let u16_len = value.bytes.len() / 2;
    let words = unsafe { std::slice::from_raw_parts(value.bytes.as_ptr() as *const u16, u16_len) };
    let mut s = String::from_utf16_lossy(words);
    while s.ends_with('\u{0}') {
        s.pop();
    }
    Some(s).filter(|x| !x.is_empty())
}

#[cfg(windows)]
fn get_layout_name(id: &str) -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let id = normalize_layout_id(id);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let layouts = match hklm.open_subkey(LAYOUTS_PATH) {
        Ok(k) => k,
        Err(_) => return id.clone(),
    };
    let key = match layouts.open_subkey(&id) {
        Ok(k) => k,
        Err(_) => return id.clone(),
    };
    key.get_value("Layout Text")
        .or_else(|_| key.get_value("Layout Display Name"))
        .unwrap_or(id)
}

/// 从 TIP LanguageProfile 获取 IME 显示名(微软拼音、微软五笔等)
#[cfg(windows)]
fn get_tip_profile_name(clsid: &str, lang_id: &str, profile: &str) -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let clsid_br = if clsid.starts_with('{') {
        clsid.to_string()
    } else {
        format!("{{{}}}", clsid)
    };
    let profile_br = if profile.starts_with('{') {
        profile.to_string()
    } else {
        format!("{{{}}}", profile)
    };
    let path = format!(
        "{}\\{}\\LanguageProfile\\0x{}\\{}",
        CTF_TIP_PATH, clsid_br, lang_id, profile_br
    );
    let key = hklm.open_subkey(&path).ok()?;
    key.get_value("Description").ok()
}

#[cfg(windows)]
fn get_ctf_language_order(hkcu: &winreg::RegKey) -> Vec<String> {
    let mut order: Vec<(u32, String)> = Vec::new();
    if let Ok(ctf) = hkcu.open_subkey(CTF_LANGUAGE_PATH) {
        for (name, value) in ctf.enum_values().filter_map(|v| v.ok()) {
            if let (Ok(o), Some(s)) = (name.parse::<u32>(), reg_value_to_string(&value)) {
                let id = normalize_layout_id(&s);
                if !id.is_empty() {
                    order.push((o, id));
                }
            }
        }
    }
    order.sort_by_key(|(o, _)| *o);
    order.into_iter().map(|(_, id)| id).collect()
}

#[tauri::command]
pub fn get_input_methods() -> Result<Vec<InputMethodItem>, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut order_to_id: Vec<(u32, String)> = Vec::new();

    // 优先从 Preload 读取(传统方式)
    if let Ok(preload) = hkcu.open_subkey(PRELOAD_PATH) {
        for (name, value) in preload.enum_values().filter_map(|v| v.ok()) {
            let order: u32 = name.parse().unwrap_or(0);
            if let Some(s) = reg_value_to_string(&value) {
                let id = normalize_layout_id(&s);
                if !id.is_empty() {
                    order_to_id.push((order, id));
                }
            }
        }
    }

    // Win10/11: Preload 可能为空,回退到 CTF(Language 含美式键盘,AssemblyItem 含微软拼音、五笔等)
    if order_to_id.is_empty() {
        if let Ok(assembly_item) = hkcu.open_subkey(CTF_ASSEMBLY_ITEM_PATH) {
            let lang_order = get_ctf_language_order(&hkcu);
            let mut named_items: Vec<(String, String)> = Vec::new();
            for lang_id in lang_order {
                // 先加入该语言的基础键盘布局(美式键盘 / Chinese - US Keyboard)
                let layout_name = get_layout_name(&lang_id);
                named_items.push((lang_id.clone(), layout_name));

                let lang_key = format!("0x{}", lang_id);
                if let Ok(lang_sub) = assembly_item.open_subkey(&lang_key) {
                    for assem_name in lang_sub.enum_keys().filter_map(|k| k.ok()) {
                        if let Ok(assem) = lang_sub.open_subkey(&assem_name) {
                            let mut indices: Vec<String> =
                                assem.enum_keys().filter_map(|k| k.ok()).collect();
                            indices.sort();
                            for idx in indices {
                                if let Ok(item_key) = assem.open_subkey(&idx) {
                                    let mut clsid = None;
                                    let mut profile = None;
                                    let mut layout_val = None;
                                    for (n, val) in item_key.enum_values().filter_map(|x| x.ok()) {
                                        match n.as_str() {
                                            "CLSID" => {
                                                clsid = reg_value_to_string(&val).map(|s| {
                                                    s.trim_matches('{')
                                                        .trim_matches('}')
                                                        .to_uppercase()
                                                })
                                            }
                                            "Profile" => {
                                                profile = reg_value_to_string(&val).map(|s| {
                                                    s.trim_matches('{')
                                                        .trim_matches('}')
                                                        .to_uppercase()
                                                })
                                            }
                                            "KeyboardLayout" => {
                                                if val.bytes.len() >= 4 {
                                                    layout_val = Some(u32::from_le_bytes([
                                                        val.bytes[0],
                                                        val.bytes[1],
                                                        val.bytes[2],
                                                        val.bytes[3],
                                                    ]));
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                    let (id, name) = if let (Some(c), Some(p)) = (clsid, profile) {
                                        #[cfg(test)]
                                        if c.len() < 30 {
                                            eprintln!(
                                                "DEBUG c.len={} c={:?} p.len={} p={:?}",
                                                c.len(),
                                                c,
                                                p.len(),
                                                p
                                            );
                                        }
                                        let tip_id = format!("TIP:{}:{}", c, p);
                                        let n = get_tip_profile_name(&c, &lang_id, &p)
                                            .unwrap_or_else(|| tip_id.clone());
                                        (tip_id, n)
                                    } else if let Some(layout) = layout_val {
                                        if layout != 0 {
                                            let lid = format!("{:08X}", layout);
                                            (lid.clone(), get_layout_name(&lid))
                                        } else {
                                            continue;
                                        }
                                    } else {
                                        continue;
                                    };
                                    named_items.push((id, name));
                                }
                            }
                        }
                    }
                }
            }
            let result: Vec<InputMethodItem> = named_items
                .into_iter()
                .enumerate()
                .map(|(i, (id, name))| InputMethodItem {
                    id,
                    name,
                    enabled: true,
                    order: (i + 1) as u32,
                })
                .collect();
            return Ok(result);
        }
        // AssemblyItem 也不存在时,最后尝试 Language
        if let Ok(ctf) = hkcu.open_subkey(CTF_LANGUAGE_PATH) {
            for (name, value) in ctf.enum_values().filter_map(|v| v.ok()) {
                let order: u32 = name.parse().unwrap_or(0);
                if let Some(s) = reg_value_to_string(&value) {
                    let id = normalize_layout_id(&s);
                    if !id.is_empty() {
                        order_to_id.push((order, id));
                    }
                }
            }
        }
    }

    order_to_id.sort_by_key(|(o, _)| *o);

    let result: Vec<InputMethodItem> = order_to_id
        .into_iter()
        .enumerate()
        .map(|(i, (_, id))| InputMethodItem {
            name: get_layout_name(&id),
            id: id.clone(),
            enabled: true,
            order: (i + 1) as u32,
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub fn set_input_method_order(ids: Vec<String>) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let preload = hkcu
        .open_subkey_with_flags(
            PRELOAD_PATH,
            winreg::enums::KEY_READ | winreg::enums::KEY_WRITE,
        )
        .map_err(|e| format!("Open Preload for write failed: {}", e))?;

    // Delete existing values then write new order
    let names: Vec<String> = preload
        .enum_values()
        .filter_map(|v| v.ok().map(|(n, _)| n))
        .collect();
    for name in names {
        let _ = preload.delete_value(&name);
    }
    for (i, id) in ids.iter().enumerate() {
        let name = (i + 1).to_string();
        let id_normalized = normalize_layout_id(id);
        preload
            .set_value(&name, &id_normalized)
            .map_err(|e| format!("Set Preload {} failed: {}", name, e))?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(windows)]
pub fn set_input_method_enabled(id: String, enabled: bool) -> Result<(), String> {
    let id = normalize_layout_id(&id);
    let items = get_input_methods()?;
    let ids_enabled: Vec<String> = items
        .iter()
        .filter(|x| x.enabled)
        .map(|x| x.id.clone())
        .collect();
    let mut new_order: Vec<String> = ids_enabled.into_iter().filter(|x| *x != id).collect();
    if enabled {
        if !new_order.contains(&id) {
            new_order.push(id);
        }
    }
    set_input_method_order(new_order)
}
