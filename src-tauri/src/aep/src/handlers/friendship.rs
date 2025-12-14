use crate::database::{self, Friendship, FriendshipStatus};
use crate::rkyv_utils::serialize;
use crate::utils::verify_signature;
use aegis_protocol::{
    BlockUserData, FriendRequestData, FriendRequestResponseData, RemoveFriendshipData,
    UnblockUserData,
};
use aegis_types::AegisError;
use scu128::Scu128;
use sqlx::{Pool, Sqlite};

pub async fn handle_friend_request(
    db_pool: &Pool<Sqlite>,
    sender_id: String,
    target_id: String,
    signature: Option<Vec<u8>>,
) -> Result<(), AegisError> {
    let data = FriendRequestData {
        sender_id: sender_id.clone(),
        target_id: target_id.clone(),
    };
    let bytes = serialize(&data)?;
    verify_signature(db_pool, &sender_id, &bytes, signature.as_ref()).await?;

    println!("Received friend request from {} to {}", sender_id, target_id);
    let now = chrono::Utc::now();
    let friendship = Friendship {
        id: Scu128::new().to_string(),
        user_a_id: sender_id,
        user_b_id: target_id,
        status: FriendshipStatus::Pending.to_string(),
        created_at: now,
        updated_at: now,
    };
    database::insert_friendship(db_pool, &friendship).await?;
    Ok(())
}

pub async fn handle_friend_response(
    db_pool: &Pool<Sqlite>,
    sender_id: String,
    target_id: String,
    accepted: bool,
    signature: Option<Vec<u8>>,
) -> Result<(), AegisError> {
    let data = FriendRequestResponseData {
        sender_id: sender_id.clone(),
        target_id: target_id.clone(),
        accepted,
    };
    let bytes = serialize(&data)?;
    verify_signature(db_pool, &sender_id, &bytes, signature.as_ref()).await?;

    println!(
        "Received friend request response from {} to {}: Accepted = {}",
        sender_id, target_id, accepted
    );
    if let Some(friendship) = database::get_friendship(db_pool, &sender_id, &target_id).await? {
        if accepted {
            database::update_friendship_status(
                db_pool,
                &friendship.id,
                FriendshipStatus::Accepted,
            )
            .await?;
        } else {
            database::delete_friendship(db_pool, &friendship.id).await?;
        }
    }
    Ok(())
}

pub async fn handle_block_user(
    db_pool: &Pool<Sqlite>,
    blocker_id: String,
    blocked_id: String,
    signature: Option<Vec<u8>>,
) -> Result<(), AegisError> {
    let data = BlockUserData {
        blocker_id: blocker_id.clone(),
        blocked_id: blocked_id.clone(),
    };
    let bytes = serialize(&data)?;
    verify_signature(db_pool, &blocker_id, &bytes, signature.as_ref()).await?;

    println!("Received block user message: {} blocked {}", blocker_id, blocked_id);
    let now = chrono::Utc::now();
    if let Some(friendship) = database::get_friendship(db_pool, &blocker_id, &blocked_id).await? {
        let new_status = if friendship.user_a_id == blocker_id {
            FriendshipStatus::BlockedByA
        } else {
            FriendshipStatus::BlockedByB
        };
        database::update_friendship_status(db_pool, &friendship.id, new_status).await?;
    } else {
        let friendship = Friendship {
            id: Scu128::new().to_string(),
            user_a_id: blocker_id,
            user_b_id: blocked_id,
            status: FriendshipStatus::BlockedByA.to_string(),
            created_at: now,
            updated_at: now,
        };
        database::insert_friendship(db_pool, &friendship).await?;
    }
    Ok(())
}

pub async fn handle_unblock_user(
    db_pool: &Pool<Sqlite>,
    unblocker_id: String,
    unblocked_id: String,
    signature: Option<Vec<u8>>,
) -> Result<(), AegisError> {
    let data = UnblockUserData {
        unblocker_id: unblocker_id.clone(),
        unblocked_id: unblocked_id.clone(),
    };
    let bytes = serialize(&data)?;
    verify_signature(db_pool, &unblocker_id, &bytes, signature.as_ref()).await?;

    println!("Received unblock user message: {} unblocked {}", unblocker_id, unblocked_id);
    if let Some(friendship) = database::get_friendship(db_pool, &unblocker_id, &unblocked_id).await? {
        database::delete_friendship(db_pool, &friendship.id).await?;
    }
    Ok(())
}

pub async fn handle_remove_friendship(
    db_pool: &Pool<Sqlite>,
    remover_id: String,
    removed_id: String,
    signature: Option<Vec<u8>>,
) -> Result<(), AegisError> {
    let data = RemoveFriendshipData {
        remover_id: remover_id.clone(),
        removed_id: removed_id.clone(),
    };
    let bytes = serialize(&data)?;
    verify_signature(db_pool, &remover_id, &bytes, signature.as_ref()).await?;

    println!("Received remove friendship message: {} removed {}", remover_id, removed_id);
    if let Some(friendship) = database::get_friendship(db_pool, &remover_id, &removed_id).await? {
        database::delete_friendship(db_pool, &friendship.id).await?;
    }
    Ok(())
}