import { useEffect, useRef } from "react";
import { AgentMessage } from "./AgentMessage";
import type { AgentMessage as AgentMessageType } from "../../lib/workbenchStore";

interface AgentMessageListProps {
  messages: AgentMessageType[];
  onTryAlternative?: (text: string) => void;
}

export function AgentMessageList({ messages, onTryAlternative }: AgentMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="jetbee-chat-list">
      {messages.map((msg) => (
        <AgentMessage key={msg.id} message={msg} onTryAlternative={onTryAlternative} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
