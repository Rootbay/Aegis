use aep::database;
use std::path::PathBuf;

#[tokio::test]
async fn run_migrations_for_dev_db() {
    let mut db_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    db_path.push("dev.db");
    let pool = database::initialize_db(db_path).await.expect("migrate dev db");
    drop(pool);
}
