import { useEffect } from 'react';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/app-store';

/**
 * Subscribe to all main-process push events and wire them into the store.
 * Call this once near the app root.
 */
export function useSystemEvents() {
  const setStatus = useAppStore((s) => s.setStatus);
  const setConversations = useAppStore((s) => s.setConversations);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessageStatus = useAppStore((s) => s.updateMessageStatus);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    // Initial fetch
    api.getStatus().then(setStatus).catch(() => {});
    api.listConversations().then(setConversations).catch(() => {});

    const offStatus = api.onStatusChanged(setStatus);

    const offConvUpdated = api.onConversationUpdated(async () => {
      const list = await api.listConversations();
      setConversations(list);
    });

    const offMsgNew = api.onMessageNew((msg) => {
      appendMessage(msg);
    });

    const offMsgUpdated = api.onMessageUpdated(({ id, status }) => {
      updateMessageStatus(id, status);
    });

    const offToast = api.onToast(pushToast);

    return () => {
      offStatus();
      offConvUpdated();
      offMsgNew();
      offMsgUpdated();
      offToast();
    };
  }, [setStatus, setConversations, appendMessage, updateMessageStatus, pushToast]);
}
