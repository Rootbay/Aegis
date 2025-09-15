<script lang="ts">
    import { invoke } from '@tauri-apps/api/core';
    import { get } from 'svelte/store';
    import { userStore } from '$lib/data/stores/userStore';
    import { toasts } from '$lib/data/stores/ToastStore';

    export let onRequestSent: () => void;
    export let onClose: () => void;

    let targetUserId = '';
    let errorMessage = '';
    let successMessage = '';

    async function sendRequest() {
        errorMessage = '';
        successMessage = '';
        const currentUser = get(userStore).me;

        if (!currentUser || !currentUser.id) {
            errorMessage = 'Current user not found.';
            return;
        }

        if (!targetUserId) {
            errorMessage = 'Please enter a target user ID.';
            return;
        }

        try {
            await invoke('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: targetUserId,
            });
            successMessage = 'Friend request sent successfully!';
            targetUserId = '';
            onRequestSent();
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error) {
            toasts.showErrorToast(`Error sending friend request: ${error}`);
        }
    }

    function closeModal() {
        onClose();
    }
</script>

<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-lg shadow-lg w-96">
        <h2 class="text-xl font-bold mb-4">Send Friend Request</h2>

        <div class="mb-4">
            <label for="targetUserId" class="block text-sm font-medium text-gray-300 mb-1"
                >Target User ID:</label
            >
            <input
                type="text"
                id="targetUserId"
                bind:value={targetUserId}
                class="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                placeholder="Enter user ID"
            />
        </div>

        {#if errorMessage}
            <p class="text-red-500 text-sm mb-4">{errorMessage}</p>
        {/if}

        {#if successMessage}
            <p class="text-green-500 text-sm mb-4">{successMessage}</p>
        {/if}

        <div class="flex justify-end space-x-2">
            <button
                class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                onclick={closeModal}
            >
                Cancel
            </button>
            <button
                class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                onclick={sendRequest}
            >
                Send Request
            </button>
        </div>
    </div>
</div>
