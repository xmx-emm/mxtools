use super::{
    deduplicate_candidates, merge_candidates, CandidateGame, GameSource,
};
use std::path::PathBuf;

fn candidate(location: Option<&str>) -> CandidateGame {
    CandidateGame {
        source: GameSource::Steam,
        source_game_id: Some("1172470".to_string()),
        name: "Apex Legends".to_string(),
        install_location: location.map(PathBuf::from),
        matchers: Vec::new(),
    }
}

#[test]
fn merge_backfills_the_install_location_from_a_later_duplicate() {
    let games = merge_candidates(vec![candidate(None), candidate(Some(r"D:\Games\Apex"))]);
    assert_eq!(games.len(), 1);
    assert_eq!(games[0].installations.len(), 1);
    assert_eq!(
        games[0].installations[0].install_location.as_deref(),
        Some(r"D:\Games\Apex")
    );
}

#[test]
fn deduplicate_backfills_without_replacing_a_known_location() {
    let mut candidates = vec![candidate(None), candidate(Some(r"D:\Games\Apex"))];
    deduplicate_candidates(&mut candidates);
    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].install_location,
        Some(PathBuf::from(r"D:\Games\Apex"))
    );

    let mut candidates = vec![
        candidate(Some(r"D:\Games\Apex")),
        candidate(None),
    ];
    deduplicate_candidates(&mut candidates);
    assert_eq!(
        candidates[0].install_location,
        Some(PathBuf::from(r"D:\Games\Apex"))
    );
}
