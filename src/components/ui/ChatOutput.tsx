import { UIMessage, isTextUIPart } from "ai";
import ReactMarkdown from "react-markdown";

const ChatOutput = ({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: string;
}) => {
  return (
    <>
      {messages.map((message, index) => {
        const content = message.parts
          .filter(isTextUIPart)
          .map((part) => part.text)
          .join("");

        return message.role === "user" ? (
          <UserChat key={message.id ?? index} content={content} />
        ) : (
          <AssistantChat key={message.id ?? index} content={content} />
        );
      })}
      {status === "submitted" && (
        <div className="text-muted-foreground">Generating response...</div>
      )}
      {status === "error" && (
        <div className="text-red-500">An error occurred.</div>
      )}
    </>
  );
};

// Displays user prompts as plain text
const UserChat = ({ content }: { content: string }) => {
  return (
    <div className="bg-muted rounded-2xl ml-auto max-w-[80%] w-fit px-3 py-2 mb-6">
      {content}
    </div>
  );
};

// Displays responses with basic MarkDown formatting
const AssistantChat = ({ content }: { content: string }) => {
  return (
    <div className="pr-8 w-full mb-6 prose prose-neutral dark:prose-invert prose-sm">
      <ReactMarkdown
        components={{
          // You can override more components for further custom styling
          // This simply means links in the response will open in a new tab
          a: ({ href, children }) => (
            <a target="_blank" href={href}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default ChatOutput;