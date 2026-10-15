export default function Footer() {
  return (
    <footer className="text-xs text-muted-foreground mt-2 text-center">
      Output genarated using content from{" "}
      <a
        href="https://www.wikipedia.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold"
      >
        Wikipedia
      </a>{" "}
      available under the{" "}
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold"
      >
        Creative Commons Licence
      </a>
    </footer>
  );
}
