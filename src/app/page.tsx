import { Suspense } from "react";
import ChatBox from "../components/ChatBox";

export default function Home() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto p-4">Loading...</div>}>
      <ChatBox />
    </Suspense>
  );
}