#[cfg(test)]
mod tests {
    use windows_tool::input_method::get_input_methods;

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
