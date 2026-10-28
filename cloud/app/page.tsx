import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import App from "../src/App";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user)
    return (
      <main className="login-page">
        <a className="wordmark" href="/">
          hozm<span>iii</span>
          <i />
        </a>
        <section className="login-panel">
          <span className="eyebrow">SOUKROMÁ CLOUDOVÁ ANALYTIKA</span>
          <h1>
            Váš prodej.
            <br />
            <span>Na všech zařízeních.</span>
          </h1>
          <p>
            Přihlaste se a mějte své G2G reporty, výdělky a objednávky vždy po
            ruce. Data se ukládají do vašeho soukromého cloudového účtu.
          </p>
          <a
            className="button primary"
            href={chatGPTSignInPath("/")}
            target="_top"
          >
            Přihlásit se přes ChatGPT <span aria-hidden="true">→</span>
          </a>
          <small>
            Zdrojový kód je veřejný. Vaše reporty a API klíče patří jen vám.
          </small>
        </section>
        <div className="login-footer">
          Excel a CSV · G2G OpenAPI · automatické aktualizace
        </div>
      </main>
    );
  return <App />;
}
