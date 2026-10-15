//! Minimal quality report of a game database: it counts suspicious games and never changes them.
//!
//! Every check is a column comparison, so the whole report is one scan of `Games` (about 12–20 s on
//! a 10 M game base). Duplicate detection needs to compare movetexts and is left to the full report.

use std::path::PathBuf;

use diesel::{sql_query, sql_types::BigInt, QueryableByName, RunQueryDsl};
use serde::Serialize;
use specta::Type;

use super::{get_db_or_create, ConnectionOptions};
use crate::{error::Error, AppState};

/// Fewer plies than this with a decisive result: the game may have been cut short.
pub const SHORT_DECISIVE_MAX_PLIES: i64 = 20;
/// Ratings outside this range are almost certainly wrong.
pub const PLAUSIBLE_ELO: (i64, i64) = (100, 2900);

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type, QueryableByName)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQualityReport {
    #[diesel(sql_type = BigInt)]
    pub games: i64,
    /// No moves at all.
    #[diesel(sql_type = BigInt)]
    pub empty: i64,
    /// Decisive result with fewer than `SHORT_DECISIVE_MAX_PLIES` plies.
    #[diesel(sql_type = BigInt)]
    pub short_decisive: i64,
    /// Result missing or `*`.
    #[diesel(sql_type = BigInt)]
    pub unknown_result: i64,
    /// Date missing or without a known year.
    #[diesel(sql_type = BigInt)]
    pub missing_date: i64,
    /// Date after today.
    #[diesel(sql_type = BigInt)]
    pub future_date: i64,
    /// The same player on both sides.
    #[diesel(sql_type = BigInt)]
    pub same_players: i64,
    /// A rating outside `PLAUSIBLE_ELO`.
    #[diesel(sql_type = BigInt)]
    pub implausible_elo: i64,
    /// Starts from a custom position (FEN tag): not standard chess from the initial position.
    #[diesel(sql_type = BigInt)]
    pub custom_start: i64,
}

fn report_sql() -> String {
    let (min_elo, max_elo) = PLAUSIBLE_ELO;
    format!(
        "SELECT
            COUNT(*) AS games,
            COALESCE(SUM(PlyCount = 0), 0) AS empty,
            COALESCE(SUM(PlyCount > 0 AND PlyCount < {SHORT_DECISIVE_MAX_PLIES}
                AND Result IN ('1-0', '0-1')), 0) AS short_decisive,
            COALESCE(SUM(Result IS NULL OR Result NOT IN ('1-0', '0-1', '1/2-1/2')), 0)
                AS unknown_result,
            COALESCE(SUM(Date IS NULL OR Date = '' OR substr(Date, 1, 4) GLOB '*[^0-9]*'
                OR length(Date) < 4), 0) AS missing_date,
            COALESCE(SUM(substr(Date, 1, 4) NOT GLOB '*[^0-9]*'
                AND replace(Date, '?', '0') > strftime('%Y.%m.%d', 'now')), 0) AS future_date,
            COALESCE(SUM(WhiteID = BlackID), 0) AS same_players,
            COALESCE(SUM((WhiteElo IS NOT NULL AND WhiteElo <> 0
                    AND (WhiteElo < {min_elo} OR WhiteElo > {max_elo}))
                OR (BlackElo IS NOT NULL AND BlackElo <> 0
                    AND (BlackElo < {min_elo} OR BlackElo > {max_elo}))), 0) AS implausible_elo,
            COALESCE(SUM(FEN IS NOT NULL AND FEN <> ''), 0) AS custom_start
        FROM Games"
    )
}

#[tauri::command]
#[specta::specta]
pub async fn get_database_quality(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<DatabaseQualityReport, Error> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    Ok(sql_query(report_sql()).get_result(db)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use diesel::{connection::SimpleConnection, sqlite::SqliteConnection, Connection};

    #[test]
    fn counts_each_problem_without_changing_games() {
        let conn = &mut SqliteConnection::establish(":memory:").unwrap();
        conn.batch_execute(
            "CREATE TABLE Games (ID INTEGER PRIMARY KEY, Date TEXT, WhiteID INTEGER,
                WhiteElo INTEGER, BlackID INTEGER, BlackElo INTEGER, Result TEXT,
                PlyCount INTEGER, FEN TEXT);
             INSERT INTO Games (Date, WhiteID, WhiteElo, BlackID, BlackElo, Result, PlyCount, FEN)
             VALUES
                ('2024.05.01', 1, 2000, 2, 2100, '1-0', 60, NULL),
                ('2024.??.??', 1, 2000, 2, 2100, '1/2-1/2', 10, NULL),
                ('????.??.??', 1, 0, 2, NULL, '0-1', 12, NULL),
                ('2999.01.01', 3, 2000, 3, 4000, '*', 0, NULL),
                (NULL, 1, 50, 2, 2000, '1-0', 40, '8/8/8/8/8/8/8/K6k w - - 0 1');",
        )
        .unwrap();
        let report: DatabaseQualityReport = sql_query(report_sql()).get_result(conn).unwrap();
        assert_eq!(
            report,
            DatabaseQualityReport {
                games: 5,
                empty: 1,
                short_decisive: 1,
                unknown_result: 1,
                missing_date: 2,
                future_date: 1,
                same_players: 1,
                implausible_elo: 2,
                custom_start: 1,
            }
        );
    }

    #[test]
    fn an_empty_database_reports_zeros() {
        let conn = &mut SqliteConnection::establish(":memory:").unwrap();
        conn.batch_execute(
            "CREATE TABLE Games (ID INTEGER PRIMARY KEY, Date TEXT, WhiteID INTEGER,
                WhiteElo INTEGER, BlackID INTEGER, BlackElo INTEGER, Result TEXT,
                PlyCount INTEGER, FEN TEXT);",
        )
        .unwrap();
        let report: DatabaseQualityReport = sql_query(report_sql()).get_result(conn).unwrap();
        assert_eq!(report, DatabaseQualityReport::default());
    }
}
