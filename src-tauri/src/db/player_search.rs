//! Player name search that does not depend on word order, accents or punctuation.
//!
//! PGN files store names as "Surname Surname, Name", so a plain `LIKE '%David Cabezas%'` never
//! finds "Cabezas Solano, David Alejandro". The query is split into normalized tokens and every
//! token must appear in the normalized name. Normalization runs in Rust through a SQL function
//! registered on each connection, so existing databases need no schema change or migration.

use diesel::{
    dsl::sql,
    sql_types::{Bool, Integer, Nullable, Text},
    sqlite::SqliteConnection,
    QueryResult,
};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

diesel::sql_function! {
    /// Normalized form of a player name (see [`name_key`]).
    #[sql_name = "onyx_name_key"]
    fn onyx_name_key(name: Nullable<Text>) -> Text;
}

/// Lowercase, without diacritics and with every run of non-alphanumeric characters turned into a
/// single space: "Cabezas Solano, Dávid" → "cabezas solano david".
pub fn name_key(name: &str) -> String {
    if name.is_ascii() {
        return push_key(name.chars(), name.len());
    }
    push_key(name.nfkd().filter(|ch| !is_combining_mark(*ch)), name.len())
}

fn push_key(chars: impl Iterator<Item = char>, capacity: usize) -> String {
    let mut key = String::with_capacity(capacity);
    let mut pending_space = false;
    for ch in chars {
        if ch.is_alphanumeric() {
            if pending_space && !key.is_empty() {
                key.push(' ');
            }
            pending_space = false;
            key.extend(ch.to_lowercase());
        } else {
            pending_space = true;
        }
    }
    key
}

/// Distinct normalized tokens of a search query, in order.
pub fn search_tokens(query: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    for token in name_key(query).split(' ').filter(|token| !token.is_empty()) {
        if !tokens.iter().any(|known| known == token) {
            tokens.push(token.to_string());
        }
    }
    tokens
}

/// Registers `onyx_name_key` on a connection; the search filters cannot run without it.
pub fn register_name_key(conn: &mut SqliteConnection) -> QueryResult<()> {
    onyx_name_key::register_impl(conn, |name: Option<String>| {
        name.as_deref().map(name_key).unwrap_or_default()
    })
}

/// The normalized name contains `token`. Tokens are alphanumeric after normalization, so they never
/// contain LIKE wildcards.
///
/// For an ASCII name that is the same as SQLite's case-insensitive `LIKE` on the raw name, which is
/// native and fast; the Rust normalization only runs for names with other characters (`GLOB` below
/// matches any character outside printable ASCII).
pub fn name_contains(token: &str) -> diesel::expression::SqlLiteral<Bool> {
    debug_assert!(token.chars().all(char::is_alphanumeric));
    sql::<Bool>(&format!(
        "(Players.Name LIKE '%{token}%'          OR (Players.Name GLOB '*[^ -~]*' AND onyx_name_key(Players.Name) LIKE '%{token}%'))"
    ))
}

/// The player appears in at least one game. Both checks use the WhiteID/BlackID indexes.
pub fn has_games() -> diesel::expression::SqlLiteral<Bool> {
    sql::<Bool>(
        "(EXISTS (SELECT 1 FROM Games WHERE Games.WhiteID = Players.ID) \
         OR EXISTS (SELECT 1 FROM Games WHERE Games.BlackID = Players.ID))",
    )
}

/// Number of games of the player, for sorting. Counted through the WhiteID/BlackID indexes.
pub fn game_count() -> diesel::expression::SqlLiteral<Integer> {
    sql::<Integer>(
        "((SELECT COUNT(*) FROM Games WHERE Games.WhiteID = Players.ID) \
         + (SELECT COUNT(*) FROM Games WHERE Games.BlackID = Players.ID))",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_ignore_case_accents_and_punctuation() {
        assert_eq!(
            name_key("Cabezas Solano, David Alejandro"),
            "cabezas solano david alejandro"
        );
        assert_eq!(name_key("  Núñez-Peña,  José  "), "nunez pena jose");
        assert_eq!(name_key("O'Brien, J."), "o brien j");
        assert_eq!(name_key("Müller"), "muller");
        assert_eq!(name_key("..."), "");
    }

    #[test]
    fn tokens_are_normalized_and_deduplicated() {
        assert_eq!(search_tokens("David Cabezas"), vec!["david", "cabezas"]);
        assert_eq!(
            search_tokens("cabezas, DAVID cabezas"),
            vec!["cabezas", "david"]
        );
        assert_eq!(search_tokens("Jösé"), vec!["jose"]);
        assert!(search_tokens(" , ").is_empty());
    }

    fn search(conn: &mut SqliteConnection, query: &str) -> Vec<(i32, Option<String>)> {
        use crate::db::schema::players;
        use diesel::prelude::*;

        let mut sql_query = players::table.into_boxed();
        for token in search_tokens(query) {
            sql_query = sql_query.filter(name_contains(&token));
        }
        sql_query
            .filter(has_games())
            .order((game_count().desc(), players::id))
            .select((players::id, players::name))
            .load(conn)
            .unwrap()
    }

    #[test]
    fn finds_names_in_any_order_without_accents_and_sorts_by_games() {
        use diesel::{connection::SimpleConnection, Connection};

        let conn = &mut SqliteConnection::establish(":memory:").unwrap();
        register_name_key(conn).unwrap();
        conn.batch_execute(
            "CREATE TABLE Players (ID INTEGER PRIMARY KEY, Name TEXT, Elo INTEGER);
             CREATE TABLE Games (ID INTEGER PRIMARY KEY, WhiteID INTEGER, BlackID INTEGER);
             INSERT INTO Players VALUES
                (1, 'Cabezas Solano, David Alejandro', NULL),
                (2, 'Cabezas, David', NULL),
                (3, 'Cabezas Ayala, Ivan', NULL),
                (4, 'Cabézas, Dávid', NULL),
                (5, 'Other, Player', NULL);
             INSERT INTO Games (WhiteID, BlackID) VALUES
                (1, 5), (5, 1), (1, 3), (4, 5), (3, 5);",
        )
        .unwrap();

        // Player 2 has no games; player 1 has three, so it comes first.
        assert_eq!(
            search(conn, "David Cabezas"),
            vec![
                (1, Some("Cabezas Solano, David Alejandro".to_string())),
                (4, Some("Cabézas, Dávid".to_string())),
            ]
        );
        assert_eq!(search(conn, "solano cabezas").len(), 1);
        assert_eq!(search(conn, "AYALA").len(), 1);
        assert!(search(conn, "Cabezas Smith").is_empty());
    }

    /// Timing on a real base: `ONYX_BENCH_DB=<file.db3> cargo test --release player_search -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn benchmark_on_real_database() {
        use diesel::Connection;

        let Ok(path) = std::env::var("ONYX_BENCH_DB") else {
            return;
        };
        let conn = &mut SqliteConnection::establish(&format!("file:{path}?mode=ro")).unwrap();
        register_name_key(conn).unwrap();
        for query in ["David Cabezas", "cabezas", "garc", "jose"] {
            let started = std::time::Instant::now();
            let found = search(conn, query);
            println!(
                "{query:>14}: {:>5} players in {:?}; first: {:?}",
                found.len(),
                started.elapsed(),
                found.first()
            );
        }
    }
}
