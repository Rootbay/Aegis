import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  collaborationStore,
  generateCollaborationDocumentId,
} from "$lib/features/collaboration/collabDocumentStore";

function waitForMicrotask() {
  return new Promise<void>((resolve) => queueMicrotask(() => resolve()));
}

describe("collaborationStore", () => {
  it("applies remote Yjs updates and converges with local state", async () => {
    const documentId = "test-doc";
    const session = collaborationStore.openSession(documentId, {
      initialContent: "",
    });

    let localContent = "";
    const unsubscribe = session.content.subscribe((value) => {
      localContent = value;
    });

    const remoteDoc = new Y.Doc();
    const localDoc = session.doc;
    const localText = localDoc.getText("content");
    const remoteText = remoteDoc.getText("content");

    const bootstrapUpdate = Y.encodeStateAsUpdate(localDoc);
    Y.applyUpdate(remoteDoc, bootstrapUpdate);

    session.updateContent("Hello from peer A");
    await waitForMicrotask();

    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));
    remoteDoc.transact(() => {
      if (remoteText.length > 0) {
        remoteText.delete(0, remoteText.length);
      }
      remoteText.insert(0, "Peer B was here");
    }, "remote-test");

    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc);

    collaborationStore.receiveRemoteUpdate({
      documentId,
      update: Array.from(remoteUpdate),
      kind: "document",
      participants: ["peer-b"],
    });

    await waitForMicrotask();

    expect(localText.toString()).toBe("Peer B was here");
    expect(localContent).toBe("Peer B was here");

    unsubscribe();
    collaborationStore.closeSession(documentId);
  });

  it("records remote participants", async () => {
    const documentId = "participants-doc";
    const session = collaborationStore.openSession(documentId);

    let participants: string[] = [];
    const unsubscribe = session.participants.subscribe((list) => {
      participants = list.map((entry) => entry.id).sort();
    });

    collaborationStore.receiveRemoteUpdate({
      documentId,
      update: [],
      kind: "document",
      participants: ["peer-one", "peer-two"],
    });

    await waitForMicrotask();

    expect(participants).toEqual(["peer-one", "peer-two"]);

    unsubscribe();
    collaborationStore.closeSession(documentId);
  });

  it("sanitizes generated document identifiers", () => {
    const id = generateCollaborationDocumentId("Server 123!@#");
    expect(id.startsWith("server-123")).toBe(true);
    expect(id).toMatch(/^server-123-[a-z0-9-]+$/);
  });
});
