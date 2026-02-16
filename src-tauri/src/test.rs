#[cfg(test)]
mod tests {
    use crate::input_method::get_input_methods;

    #[test]
    #[cfg(windows)]
    fn test_reg_raw() {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        // 模拟 get_input_methods 的路径遍历
        let assembly_item = hkcu.open_subkey("Software\\Microsoft\\CTF\\SortOrder\\AssemblyItem").unwrap();
        let lang_sub = assembly_item.open_subkey("0x00000804").unwrap();
        for assem_name in lang_sub.enum_keys().filter_map(|k| k.ok()) {
            println!("assem_name={:?}", assem_name);
            let assem = lang_sub.open_subkey(&assem_name).unwrap();
            for idx in assem.enum_keys().filter_map(|k| k.ok()) {
                let item_key = assem.open_subkey(&idx).unwrap();
                let clsid: String = item_key.get_value("CLSID").unwrap();
                println!("  {} CLSID from get_value: len={} {:?}", idx, clsid.len(), clsid);
            }
        }
    }

    #[test]
    fn test() {
        let a = get_input_methods();
        let items = a.expect("get_input_methods failed");
        assert!(!items.is_empty(), "should have at least one input method");
        if items.len() >= 2 {
            // 第二个应为 IME，id 格式为 TIP:CLSID:Profile，长度应 > 40
            assert!(items[1].id.len() > 40, "IME id should be full TIP:CLSID:Profile, got len={} id={:?}", items[1].id.len(), items[1].id);
            assert!(items[1].name == "Microsoft Pinyin" || items[1].name == "Microsoft Wubi" || items[1].name.contains("Microsoft"), 
                "IME name should be Microsoft Pinyin/Wubi, got {:?}", items[1].name);
        }
        for (i, it) in items.iter().enumerate() {
            println!("[{}] id={:?} name={:?}", i, it.id, it.name);
        }
    }
}
