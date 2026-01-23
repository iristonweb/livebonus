import fs from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default async function DocsPage() {
  const mdPath = path.join(process.cwd(), "docs", "all-in-guide.md");
  const content = await fs.readFile(mdPath, "utf-8");

  return (
    <main>
      <section className="pageHero">
        <div className="container">
          <div className="pageHeroInner">
            <div className="pageHeroPanel">
              <div className="kicker">
                <span className="kickerDot" />
                Документы и спецификация
              </div>
              <h1>Документация продукта</h1>
              <p className="subhead">
                Бриф, техспека, регуляторика и UX‑логика. Всё в одном месте, без лишнего шума.
              </p>
              <div className="pageMeta">
                <span className="pageMetaTag">Reader Mode</span>
                <span className="pageMetaTag">GFM</span>
                <span className="pageMetaTag">Compliance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="card cardHolo">
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
