export default function NotFound() {
  return (
    <div className="wrap">
      <div className="nf">
        <h1>There&apos;s no manual for this page.</h1>
        <p>
          The page you&apos;re looking for doesn&apos;t exist — or its manual was unpublished. But we can
          build you a manual for almost anything else.
        </p>
        <a href="/">Get a manual</a>
      </div>
      <div className="footer">ManualMind · finds the real manual first, builds one when it can’t</div>
    </div>
  );
}
