use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::PathBuf;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

pub async fn initialize_db(db_path: PathBuf) -> Result<Pool<Sqlite>, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                sqlx::Error::Configuration(format!("Failed to create database directory: {}", e).into())
            })?;
        }
    }

    let connect_options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(20)
        .connect_with(connect_options)
        .await?;

    MIGRATOR.run(&pool).await?;

    Ok(pool)
}
