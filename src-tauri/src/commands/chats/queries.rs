use crate::commands::state::{with_state_async, AppStateContainer};
use tauri::State;

use super::helpers::GroupChatPayload;

#[tauri::command]
pub async fn get_group_chats(
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<GroupChatPayload>, String> {
    with_state_async(state_container, move |state| async move {
        let current_user_id = state.identity.peer_id().to_base58();
        let records = aep::database::get_group_chats_for_user(&state.db_pool, &current_user_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(records
            .into_iter()
            .map(GroupChatPayload::from_record)
            .collect())
    })
    .await
}
