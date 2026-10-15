"use client";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import ChatOutput from "@/components/ui/ChatOutput";
import ChatInput from "@/components/ui/ChatInput";
import Footer from "@/components/Footer";

export default function ChatBox() {
  const [input, setInput] = useState("");
  const { messages, status, sendMessage } = useChat();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <main className="w-full py-5 px-4">
      <div className="max-w-3xl mx-auto">

      <h1 className="text-xl font-semibold mb-4">PhoneGPT</h1>

      <div className="space-y-4 mb-4 max-h-[80vh] overflow-y-auto">
        <ChatOutput messages={messages} status={status} />
      </div>

      <ChatInput
        input={input}
        handleInputChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setInput(e.target.value)
        }
        handleSubmit={handleSubmit}
      />
      <Footer />
      </div>
    </main>
  );
}
