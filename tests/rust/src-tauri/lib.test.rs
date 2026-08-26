#[cfg(test)]
mod tests {
    use windows_tool::input_method::get_input_methods;

    #[test]
    #[cfg(windows)]
    fn test_reg_raw() {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let assembly_item = hkcu
            .open_subkey("Software\\Microsoft\\CTF\\SortOrder\\AssemblyItem")
            .unwrap();
        let lang_sub = assembly_item.open_subkey("0x00000804").unwrap();
        for assem_name in lang_sub.enum_keys().filter_map(|k| k.ok()) {
            println!("assem_name={:?}", assem_name);
            let assem = lang_sub.open_subkey(&assem_name).unwrap();
            for idx in assem.enum_keys().filter_map(|k| k.ok()) {
                let item_key = assem.open_subkey(&idx).unwrap();
                let clsid: String = item_key.get_value("CLSID").unwrap();
                println!(
                    "  {} CLSID from get_value: len={} {:?}",
                    idx,
                    clsid.len(),
                    clsid
                );
            }
        }
    }

    #[test]
    fn test_get_input_methods_matches_switcher() {
        use windows_tool::input_method::InputMethodKind;

        let items = get_input_methods().expect("get_input_methods failed");
        assert!(!items.is_empty(), "should have at least one input method");
        assert!(
            !items
                .iter()
                .any(|i| matches!(i.kind, InputMethodKind::LanguageKeyboard)),
            "list should not include synthetic language base keyboards, got {:?}",
            items.iter().map(|i| (&i.id, &i.name)).collect::<Vec<_>>()
        );
        for (i, it) in items.iter().enumerate() {
            println!(
                "[{}] id={:?} name={:?} kind={:?}",
                i, it.id, it.name, it.kind
            );
        }
    }
}
