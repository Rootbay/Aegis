# Aegis Messenger

## ⚠️ Project Status ⚠️

This project is in **early development** and is **far from production ready**. Features may be incomplete, and breaking changes are expected.

> A secure, off-grid messenger built with Tauri v2, Svelte 5, TypeScript, and bun.

[![Build Status](https://img.shields.io/github/actions/workflow/status/xeintdm/aegis/build.yml?branch=main&style=for-the-badge)](https://github.com/xeintdm/aegis/actions)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Apache%202.0-blue?style=for-the-badge)](./LICENSE)
[![Discord](https://img.shields.io/discord/123456789?color=7289DA&label=Join%20Community&logo=discord&logoColor=white&style=for-the-badge)](https://discord.com/users/941268694733041715)

**Aegis is a messenger that works with or without the internet.** It provides fast, private, end-to-end encrypted communication over a global network, but automatically creates a resilient, off-grid Bluetooth and Wi-Fi Direct mesh network with nearby peers when connectivity fails.

_(Imagine a sleek animation showing the UI switch from "Online Mode" to "Mesh Mode," with the network visualizer lighting up to show nearby peers)_

---

## Core Philosophy

Aegis is built on four unshakable pillars:

1.  **Resilience:** Communication is a fundamental need, not a privilege. Our platform is designed to function in any environment—from a bustling city to a remote area after a natural disaster.
2.  **Absolute Privacy:** Your identity and your conversations belong to you, and no one else. We don't use phone numbers or emails. Our end-to-end encryption is uncompromising, and our design minimizes metadata leakage by default.
3.  **Extreme Performance:** Communication tools should be instant and lightweight. Built with Rust and Tauri v2, Aegis is ridiculously fast, with a tiny memory footprint and near-zero CPU usage when idle. No bloat, ever.
4.  **Openness & Empowerment:** We believe in empowering communities. The Aegis Protocol (AEP) is open, allowing anyone to build clients, tools, and even hardware relays to extend and strengthen their local networks.

---

## ✨ Features

Aegis is more than just a chat app. It's a complete communication suite for a decentralized world.

### Networking & Connectivity

- **Seamless Hybrid Network:** The app **intelligently switches** between Internet and Offline Mesh modes without any user intervention.
- **Dual-Tech Mesh:** Automatically uses the best available P2P technology, preferring **high-bandwidth Wi-Fi Direct** for local peers and falling back to a **long-range, power-efficient Bluetooth Low Energy mesh**.
- **"Bridge Mode" Gateway:** A user who regains internet can become a **temporary, secure gateway** for their entire local mesh group, routing their encrypted messages to the global network.
- **Intelligent Mesh Routing:** Implements a dynamic routing protocol (AERP) that finds the **most efficient path for messages** to travel through the mesh, adapting in real-time as nodes join or leave.
- **The Mesh Explorer:** A beautiful, real-time visualization of the local mesh network. **See peers as nodes**, watch message paths, and understand the shape of your local connectivity.
- **Community Relay Support:** Supports dedicated, low-power hardware relays running the open-source Aegis firmware to create **permanent, wide-area mesh coverage** for a neighborhood or campus.

### Communication & Collaboration

- **Uncompromising End-to-End Encryption:** Using the Signal Protocol for **forward secrecy and post-compromise security** on all messages, whether online or offline.
- **Resilient File Transfer:** Share images, videos, and documents. In mesh mode, files are **broken into encrypted chunks** and reassembled by the recipient, allowing for large transfers over an unreliable network.
- **"Walkie-Talkie" Voice Memos:** **Asynchronous, low-bandwidth voice messages** that are perfect for quick coordination over the mesh.
- **Decentralized Broadcast Channels:** Create public or private channels that **propagate through the local network**, ideal for community announcements or emergency alerts.
- **Ephemeral Messages:** Set messages to **disappear automatically** after a set time for perfect conversational hygiene.
- **P2P Collaborative Documents:** Launch a secure, **shared text document or whiteboard** with a contact. Edits are synchronized directly between devices—no server involved.
- **Location & Status Sharing:** Temporarily share your live location or set a status (e.g., "Safe," "Need Supplies") that is **broadcast to trusted contacts** on the local mesh.

### ️ Security & Privacy

- **Cryptographic Identity:** **No phone numbers, no emails.** Your identity is a self-sovereign keypair generated and stored securely on your device. Connect by scanning a QR code.
- **Metadata Protection:** The protocol is designed to **reveal as little as possible** about who is talking to whom, especially in mesh mode where traffic analysis is a concern.
- **Panic Button:** A configurable feature to **instantly and securely wipe** all local application data.
- **Encrypted & Decentralized Profile:** Your profile picture and display name are encrypted and **synchronized directly with your contacts**, not stored on a central server.
- **On-Device AI for Spam Prevention:** A lightweight, privacy-preserving machine learning model runs **entirely on-device** to filter out potential spam or malicious contact requests without sending any data to a server.

### User Experience & Platform

- **Blazingly Fast Native Feel:** Thanks to Tauri and Rust, Aegis **launches instantly and runs smoothly**, using a fraction of the resources of Electron-based apps.
- **True Cross-Platform:** A single, unified application for **Windows, macOS, Linux, Android, and iOS**.
- **Command Palette:** A **`Ctrl+K` power-user interface** to instantly jump to any conversation, command, or setting.
- **Battery-Aware Operation:** In mesh mode, the app intelligently **adjusts its discovery and advertising intervals** to maximize battery life, especially on mobile devices.
- **Secure Cross-Device Sync:** Your cryptographic identity can be **securely synced to your other devices** without compromising your keys. One identity, multiple devices.

---

For more technical details, see the [Technical Details](./docs/TECHNICAL_DETAILS.md) document.

---

## 🤝 Contributing

Aegis is a community-driven project. We welcome contributions of all kinds, from bug reports to feature requests and code submissions. Please see our [Contributing Guidelines](./CONTRIBUTING.md) for more information on how to get involved.

## 💖 Show Your Support

If you believe in our mission of building a resilient, private, and open communication platform, please consider starring the project on [GitHub](https://github.com/xeintdm/aegis). It helps us gain visibility and attract more contributors.

---

## 🚀 Getting Started

To get Aegis Messenger up and running on your local machine, follow these steps:

### Prerequisites

Before you begin, ensure you have the following installed:

- **Rust:** Install Rust and Cargo using `rustup`:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
  Or, for Windows, download the installer from [rustup.rs](https://rustup.rs/).
- **Node.js:** We recommend using the latest LTS version. You can download it from [nodejs.org](https://nodejs.org/).
- **bun:** Install bun globally:
  ```bash
  npm install -g bun
  ```
- **Tauri Prerequisites:** Ensure you have all the necessary development dependencies for Tauri v2 for your specific operating system. Refer to the [Tauri documentation](https://v2.tauri.app/start/prerequisites/) for detailed instructions.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/xeintdm/aegis.git
    cd aegis
    ```
2.  **Install frontend dependencies:**
    ```bash
    bun install
    ```
3.  **Install Rust dependencies:**
    ```bash
    cargo build
    ```

### Running the Development Server

To run the application in development mode with hot-reloading:

```bash
bun tauri dev
```

This will open the Aegis Messenger application, connected to the Rust backend, and will automatically reload as you make changes to the frontend code.

### Building for Production

To build a production-ready executable:

```bash
bun tauri build
```

The compiled application will be located in the `src-tauri/target/release` directory (or `src-tauri/target/debug` for debug builds).

---

## License

This project is dual-licensed under the [MIT License](./LICENSE-MIT) and [Apache License 2.0](./LICENSE-APACHE).
