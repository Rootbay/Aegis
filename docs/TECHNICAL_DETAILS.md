# Aegis Technical Details

This document outlines the architectural principles, technology stack, and core features of the Aegis secure communication platform.

## ️ Architectural Principles

Development of Aegis is guided by these technical principles:

- **Privacy by Design:** Every feature is built with the assumption that network traffic can be monitored. We minimize metadata, encrypt everything possible, and avoid centralized data stores.
- **Offline First:** The application must remain fully functional without an internet connection. Online features are an enhancement, not a dependency.
- **Crate-First Mentality:** Core logic (like the AEP protocol) is built as independent Rust crates. This encourages code reuse, modularity, and allows others to build on our work.
- **Lean and Mean:** We relentlessly optimize for low memory usage, small binary size, and minimal power consumption. If a dependency adds significant bloat, we will find an alternative or build it ourselves.
- **Security is Not a Feature, It's the Foundation:** We use battle-tested cryptographic libraries and subject our code to regular audits. We encourage responsible disclosure of vulnerabilities.

---

## ️ Technology Stack

| Component                   | Technology                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------- |
| **Application Framework**   | [Tauri v2](https://tauri.app/)                                                     |
| **Core Logic & Networking** | [Rust](https://www.rust-lang.org/)                                                 |
| **Frontend**                | [Svelte 5](https://svelte.dev/) with [TypeScript](https://www.typescriptlang.org/) |
| **Package Manager**         | [bun](https://bun.com/)                                                            |
| **Core Rust Crates**        | `tokio`, `btleplug` / `bleasy`, `libp2p`, `ring`, `sqlx`                           |

---

## Aegis Protocol (AEP)

The Aegis Protocol (AEP) is a custom-built protocol for secure, decentralized communication. It is designed to be lightweight, efficient, and resilient, with a focus on privacy and security. AEP is built on top of `libp2p` and uses the Noise protocol for end-to-end encryption.

### Mesh Routing

Aegis uses a custom mesh routing protocol called AERP (Aegis Efficient Routing Protocol). AERP is a reactive routing protocol that is optimized for low-power, low-bandwidth devices. It is designed to be resilient to network changes and can quickly adapt to new network topologies.

AERP maintains a weighted graph of recently observed peers and updates link scores every few seconds. Each candidate path is scored using:

- **Hop count** – longer routes incur a configurable penalty.
- **Cumulative latency** – moving averages are tracked for every edge.
- **Reliability** – success/failure ratios and delivery confirmations adjust per-link confidence.

The router exposes a snapshot API used by the connectivity UI to display hop counts, path quality, and per-link latency. Configuration is persisted as part of the application settings and surfaced in the Network Settings panel:

| Setting | Description | Default |
| --- | --- | --- |
| `aerpRouteUpdateIntervalSeconds` | How often the router recomputes candidate paths and emits refreshed metrics. | `10` seconds |
| `aerpMinRouteQuality` | Minimum confidence (0–1) required before a path is considered viable. | `0.4` |
| `aerpMaxHops` | Maximum hop count for multi-hop forwarding. | `6` |

Users can tune these values to prefer ultra-stable links (raise the quality floor) or faster convergence (shorten the interval). Every change is pushed to the Rust backend through the `set_routing_config` command, which immediately refreshes the connectivity snapshot so the UI reflects the new routing posture.

### On-Device AI

Aegis uses a lightweight, on-device AI model for spam prevention. The model is trained to detect spam and malicious contact requests without sending any data to a server. This ensures that your privacy is protected while still providing a high level of security.

---

## Core Features

### Messaging

| Feature              | Direct Messages (DMs & GDMs)                                 | Servers                                                                         |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Message Editing**  | Shows an `(edited)` tag. History is not visible.             | Shows an `(edited)` tag. Admins can optionally enable transparent edit history. |
| **Message Deletion** | **Default (Ghost):** The message disappears completely.      | **Default (Ghost):** The message disappears completely.                         |
|                      | **Option (Tombstone):** Displays a "Message Deleted" notice. | **Option (Tombstone):** Displays a "Message Deleted" notice.                    |

### Authentication System

When you first open the app, you can either create a new account or log in. Creating an account is instant, but you must immediately complete a mandatory security setup. This involves saving a unique recovery phrase and enabling 2-factor authentication before you can proceed. To log in, you can either use that recovery phrase or, more easily, scan a QR code from another one of your trusted devices and approve it with your 2FA or a hardware key.

### Presence & Privacy

- **"Last Seen":** Never implemented.
- **Typing Indicators:** Disabled by default. Can be enabled by the user on a per-chat basis, but it is reciprocal (if you enable it to see others, they can see you).
- **Read Receipts:**
  - **Granular and Reciprocal:** Off by default.
  - **Reciprocal:** If a user enables read receipts (so they can see if others have read their messages), they must also broadcast their own read receipts.
  - **Per-Chat Control:** Users can disable read receipts for specific chats.
- **Status:** Instead of a passive "online" status, Aegis uses an active, intentional broadcast with a purpose. A user chooses to share "I'm available," "I'm safe," or "Heading to the rendezvous."

---

## Security Practices

### Data Encryption at Rest

All user data, including messages, contacts, and settings, is encrypted when stored on the user's device. Cryptographic keys and sensitive credentials are also encrypted, leveraging strong algorithms like AES-256 and, where available, hardware-backed security modules. Application-level encryption provides an additional layer of security beyond operating system features.

---

## Server Administration & Moderation

Server administration and moderation tools are designed to be powerful and flexible, while respecting the privacy and autonomy of users. All moderation actions are stored in a local, encrypted audit log on the devices of server administrators.

### Roles & Permissions

Server owners can create and manage roles with granular permissions.

| Permission            | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Manage Server**     | Change server name and icon.                                                        |
| **Manage Channels**   | Create, delete, and edit channels.                                                  |
| **Manage Roles**      | Create, delete, and edit roles (cannot edit roles higher than their own).           |
| **Manage Webhooks**   | Create, delete, and edit webhooks.                                                  |
| **View Audit Log**    | View the server's moderation log.                                                   |
| **Kick Members**      | Remove users from the server.                                                       |
| **Ban Members**       | Permanently remove users from the server and prevent them from rejoining.           |
| **Mute Members**      | Prevent users from sending messages in text channels or speaking in voice channels. |
| **Deafen Members**    | Prevent users from hearing others in voice channels.                                |
| **Move Members**      | Move users between voice channels.                                                  |
| **Send Messages**     | Send messages in text channels.                                                     |
| **Manage Messages**   | Delete messages from other users.                                                   |
| **Mention @everyone** | Ping all users in a channel.                                                        |

### Channel Management

- **Channel Types:** Create text and voice channels.
- **Private Channels:** Create channels that are only visible to specific roles.
- **Channel Settings:** Configure channel names, topics, and permissions.
- **Voice Channel Calls:** Selecting a voice channel in the server sidebar immediately launches a voice call session for that room, keeping active calls highlighted for quick re-entry.

### User Moderation

- **Kick:** Immediately removes a user from the server. They can rejoin with a new invite.
- **Ban:** Removes a user from the server and adds them to a ban list, preventing them from rejoining.
- **Mute:** Revokes a user's ability to send messages or speak in voice channels. Can be time-limited.
- **Moderation Log:** All moderation actions (kicks, bans, mutes, etc.) are recorded in a local, encrypted audit log that is only accessible to administrators.

---

## Manual QA Checklist

To guard against regressions in the realtime messaging pipeline:

- Send a message from one client and confirm it appears exactly once after a `messages-updated` broadcast (no duplicate optimistic entries).
- React to the freshly received realtime message and verify the reaction persists without requiring a manual refresh.
