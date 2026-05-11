import { ConversationList } from '../components/ConversationList';
import { ChatWindow } from '../components/ChatWindow';

export function Inbox() {
  return (
    <div className="h-full flex">
      <div className="w-96 border-r border-slate-200 bg-white overflow-y-auto">
        <header className="px-4 py-3 border-b border-slate-200 bg-wa-panel">
          <h2 className="font-semibold text-slate-800">Conversas</h2>
        </header>
        <ConversationList />
      </div>
      <div className="flex-1 min-w-0">
        <ChatWindow />
      </div>
    </div>
  );
}
