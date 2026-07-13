import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen, Plus, Trash2, Download, ChevronLeft, Sparkles,
  PenLine, RefreshCw, FileText, Check, Loader2, Library
} from "lucide-react";

/* ============================================================
   XƯỞNG VIẾT SÁCH — trợ lý AI viết sách trọn quy trình
   Thể loại → Ý tưởng → Dàn ý → Viết từng chương → Xuất bản thảo
   ============================================================ */

const GENRES = [
  { id: "tieu-thuyet", label: "Tiểu thuyết", desc: "Văn học, đời sống, tâm lý" },
  { id: "trinh-tham", label: "Trinh thám", desc: "Bí ẩn, phá án, hồi hộp" },
  { id: "lang-man", label: "Lãng mạn", desc: "Tình cảm, ngôn tình" },
  { id: "fantasy", label: "Fantasy / Kỳ ảo", desc: "Thế giới giả tưởng, phép thuật" },
  { id: "khoa-hoc-vien-tuong", label: "Khoa học viễn tưởng", desc: "Công nghệ, tương lai" },
  { id: "kinh-di", label: "Kinh dị", desc: "Rùng rợn, siêu nhiên" },
  { id: "thieu-nhi", label: "Thiếu nhi", desc: "Truyện cho trẻ em" },
  { id: "ky-nang", label: "Kỹ năng / Self-help", desc: "Phát triển bản thân" },
  { id: "kinh-doanh", label: "Kinh doanh", desc: "Khởi nghiệp, quản trị, marketing" },
  { id: "hoi-ky", label: "Hồi ký / Tự truyện", desc: "Câu chuyện đời thực" },
  { id: "ky-thuat", label: "Kỹ thuật / Chuyên môn", desc: "Sách hướng dẫn chuyên sâu" },
  { id: "lich-su", label: "Lịch sử", desc: "Sự kiện, nhân vật lịch sử" },
];

const TONES = ["Trang trọng", "Gần gũi", "Hài hước", "Sâu lắng", "Kịch tính", "Truyền cảm hứng"];

/* ---------------- Storage adapter ----------------
   Lưu vào FILE trên server (data/books.json) qua API /api/kv/*.
   Không dùng localStorage — dữ liệu nằm trong file, giữ nguyên sau khi deploy.
   API được cung cấp bởi:
   - Vite dev server (plugin trong vite.config.js) khi npm run dev
   - Server Node (server/index.js) khi chạy production / Docker */

const KV_BASE = "/api/kv/";

const store = {
  async get(key) {
    try {
      const r = await fetch(KV_BASE + encodeURIComponent(key));
      if (!r.ok) return null;
      const data = await r.json();
      return data.value ?? null;
    } catch (e) { console.error(e); return null; }
  },
  async set(key, value) {
    try {
      await fetch(KV_BASE + encodeURIComponent(key), {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: value,
      });
    } catch (e) { console.error(e); }
  },
  async del(key) {
    try {
      await fetch(KV_BASE + encodeURIComponent(key), { method: "DELETE" });
    } catch (e) { console.error(e); }
  },
};

async function loadIndex() {
  const v = await store.get("books-index");
  try { return v ? JSON.parse(v) : []; } catch { return []; }
}
async function saveIndex(index) {
  await store.set("books-index", JSON.stringify(index));
}
async function loadBook(id) {
  const v = await store.get("book:" + id);
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}
async function saveBookToStorage(book) {
  await store.set("book:" + book.id, JSON.stringify(book));
}
async function deleteBookFromStorage(id) {
  await store.del("book:" + id);
}

/* ---------------- Cấu hình Gemini ----------------
   Key đọc từ biến môi trường VITE_GEMINI_API_KEY (file .env — KHÔNG commit lên git).
   Xem .env.example. Lấy key tại https://aistudio.google.com/apikey */
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-3.5-flash";

/* ---------------- Claude API ---------------- */

/* ---------------- Gọi Gemini ---------------- */

async function callAI(system, userText, maxTokens = 4000) {
  if (!GEMINI_API_KEY) throw new Error('Chưa có API key — tạo file .env với VITE_GEMINI_API_KEY=... (xem .env.example) rồi chạy lại');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Lỗi gọi Gemini API");
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("\n").trim();
  if (!text) throw new Error("Gemini không trả về nội dung (có thể bị chặn bởi safety filter)");
  return text;
}

function parseJsonLoose(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("Không tìm thấy JSON trong phản hồi");
  const raw = clean.slice(start);

  // Thử parse trực tiếp
  const end = raw.lastIndexOf("}");
  if (end !== -1) {
    try { return JSON.parse(raw.slice(0, end + 1)); } catch {}
  }

  // Vá JSON bị cắt cụt: giữ lại các phần tử hoàn chỉnh trong mảng chapters
  const arrStart = raw.indexOf("[");
  if (arrStart !== -1) {
    const head = raw.slice(0, arrStart + 1);
    const body = raw.slice(arrStart + 1);
    // Tìm vị trí kết thúc của object chương hoàn chỉnh cuối cùng ("}" theo sau là "," hoặc hết chuỗi)
    let lastComplete = -1, depth = 0;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) lastComplete = i; }
    }
    if (lastComplete !== -1) {
      const repaired = head + body.slice(0, lastComplete + 1) + "]}";
      try { return JSON.parse(repaired); } catch {}
    }
  }
  throw new Error("JSON trả về không hợp lệ hoặc bị cắt cụt");
}

const SUMMARY_DELIM = "===TÓM TẮT===";

/* ---------------- Prompt builders ---------------- */

function genreLabel(id) {
  const g = GENRES.find((g) => g.id === id);
  return g ? g.label : id;
}

function outlinePrompt(book) {
  return `Hãy xây dựng dàn ý cho một cuốn sách với thông tin sau:
- Thể loại: ${genreLabel(book.genre)}
- Tên sách (nếu trống hãy tự đề xuất): ${book.title || "(chưa có, hãy đề xuất)"}
- Ý tưởng / tiền đề: ${book.premise}
- Độc giả mục tiêu: ${book.audience || "đại chúng"}
- Giọng văn: ${book.tone}
- Số chương mong muốn: ${book.numChapters}

Trả về CHỈ MỘT đối tượng JSON, không có lời dẫn, không có markdown, theo đúng cấu trúc:
{"title":"tên sách","logline":"1-2 câu mô tả cuốn sách","chapters":[{"title":"tên chương","summary":"2-3 câu tóm tắt nội dung chương"}]}
Số phần tử trong "chapters" phải đúng bằng ${book.numChapters}. Viết hoàn toàn bằng tiếng Việt.`;
}

function chapterContext(book, idx) {
  const lines = [];
  lines.push(`THÔNG TIN SÁCH`);
  lines.push(`- Tên: ${book.outline.title}`);
  lines.push(`- Thể loại: ${genreLabel(book.genre)} | Giọng văn: ${book.tone} | Độc giả: ${book.audience || "đại chúng"}`);
  lines.push(`- Tiền đề: ${book.premise}`);
  lines.push(`\nDÀN Ý TOÀN SÁCH:`);
  book.outline.chapters.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.title} — ${c.summary}`);
  });
  const prevSummaries = [];
  for (let i = 0; i < idx; i++) {
    const ch = book.chapters[i];
    if (ch && ch.summary) prevSummaries.push(`Chương ${i + 1}: ${ch.summary}`);
  }
  if (prevSummaries.length) {
    lines.push(`\nTÓM TẮT CÁC CHƯƠNG ĐÃ VIẾT:`);
    lines.push(prevSummaries.join("\n"));
  }
  const prev = book.chapters[idx - 1];
  if (prev && prev.content) {
    lines.push(`\nĐOẠN KẾT CHƯƠNG TRƯỚC (để nối mạch):`);
    lines.push("…" + prev.content.slice(-600));
  }
  return lines.join("\n");
}

function writeChapterPrompt(book, idx, instruction) {
  const ch = book.outline.chapters[idx];
  return `${chapterContext(book, idx)}

NHIỆM VỤ: Viết nội dung Chương ${idx + 1}: "${ch.title}".
Định hướng chương: ${ch.summary}
${instruction ? "Yêu cầu thêm từ tác giả: " + instruction : ""}
Viết bằng tiếng Việt, đúng giọng văn đã chọn, mạch lạc và liền mạch với các chương trước. Chỉ viết văn bản chương, không lặp lại tiêu đề, không thêm lời dẫn.
Sau khi viết xong, xuống dòng và ghi đúng một dòng "${SUMMARY_DELIM}", rồi tóm tắt chương vừa viết trong 2-3 câu.`;
}

function continuePrompt(book, idx) {
  const ch = book.outline.chapters[idx];
  const current = book.chapters[idx];
  return `${chapterContext(book, idx)}

Chương ${idx + 1}: "${ch.title}" đang viết dở. Phần đã viết (đoạn cuối):
…${(current.content || "").slice(-1200)}

NHIỆM VỤ: Viết TIẾP chương này một cách liền mạch từ đúng chỗ đang dừng. Không lặp lại phần đã viết, không thêm lời dẫn. Chỉ trả về phần văn bản viết tiếp.`;
}

/* ---------------- Small UI atoms ---------------- */

function Btn({ children, onClick, kind = "ghost", disabled, small, title }) {
  return (
    <button
      className={`btn btn-${kind} ${small ? "btn-sm" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return <Loader2 size={16} className="spin" />;
}

/* ---------------- Main App ---------------- */

export default function XuongVietSach() {
  const [view, setView] = useState("library"); // library | setup | workspace
  const [books, setBooks] = useState([]); // index entries {id,title,genre,updatedAt}
  const [book, setBook] = useState(null); // full current book
  const [loadingLib, setLoadingLib] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const idx = await loadIndex();
      setBooks(idx);
      setLoadingLib(false);
    })();
  }, []);

  const persistBook = useCallback(async (b) => {
    b.updatedAt = Date.now();
    setBook({ ...b });
    await saveBookToStorage(b);
    const idx = await loadIndex();
    const entry = { id: b.id, title: b.outline?.title || b.title || "Sách chưa đặt tên", genre: b.genre, updatedAt: b.updatedAt };
    const next = [entry, ...idx.filter((e) => e.id !== b.id)];
    setBooks(next);
    await saveIndex(next);
  }, []);

  const openBook = async (id) => {
    const b = await loadBook(id);
    if (b) { setBook(b); setView("workspace"); }
  };

  const removeBook = async (id) => {
    const next = books.filter((b) => b.id !== id);
    setBooks(next);
    await saveIndex(next);
    await deleteBookFromStorage(id);
  };

  return (
    <div className="app">
      <StyleTag />
      <header className="topbar">
        <div className="brand" onClick={() => setView("library")}>
          <BookOpen size={20} strokeWidth={1.75} />
          <span className="brand-name">Xưởng Viết Sách</span>
        </div>
        {view !== "library" && (
          <Btn small onClick={() => setView("library")}>
            <Library size={14} /> Tủ sách
          </Btn>
        )}
      </header>

      {error && (
        <div className="error-bar" onClick={() => setError("")}>
          {error} <span className="dim">(bấm để đóng)</span>
        </div>
      )}

      {view === "library" && (
        <LibraryView
          books={books}
          loading={loadingLib}
          onNew={() => setView("setup")}
          onOpen={openBook}
          onDelete={removeBook}
        />
      )}

      {view === "setup" && (
        <SetupView
          onCancel={() => setView("library")}
          onCreate={async (draft) => {
            const b = { ...draft, id: "b" + Date.now(), outline: null, chapters: {}, updatedAt: Date.now() };
            await persistBook(b);
            setView("workspace");
          }}
        />
      )}

      {view === "workspace" && book && (
        <Workspace book={book} persist={persistBook} setError={setError} />
      )}
    </div>
  );
}

/* ---------------- Library ---------------- */

function LibraryView({ books, loading, onNew, onOpen, onDelete }) {
  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Trợ lý viết sách bằng AI</p>
        <h1>Từ một ý tưởng<br />thành một bản thảo.</h1>
        <p className="lede">Chọn thể loại, mô tả ý tưởng — AI dựng dàn ý và cùng bạn viết từng chương, nhớ mạch truyện xuyên suốt.</p>
        <Btn kind="primary" onClick={onNew}><Plus size={16} /> Bắt đầu sách mới</Btn>
      </div>

      <section className="shelf">
        <h2 className="shelf-title">Tủ sách của bạn</h2>
        {loading ? (
          <p className="dim">Đang mở tủ sách…</p>
        ) : books.length === 0 ? (
          <p className="dim">Chưa có cuốn nào. Bản thảo bạn tạo sẽ được lưu lại ở đây để viết tiếp lần sau.</p>
        ) : (
          <div className="book-list">
            {books.map((b) => (
              <div key={b.id} className="book-card" onClick={() => onOpen(b.id)}>
                <div className="book-spine" />
                <div className="book-meta">
                  <div className="book-title">{b.title}</div>
                  <div className="book-sub">{genreLabel(b.genre)} · {new Date(b.updatedAt).toLocaleDateString("vi-VN")}</div>
                </div>
                <button
                  className="icon-btn"
                  title="Xoá sách"
                  onClick={(e) => { e.stopPropagation(); if (confirm("Xoá vĩnh viễn cuốn sách này?")) onDelete(b.id); }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------------- Setup wizard ---------------- */

function SetupView({ onCreate, onCancel }) {
  const [step, setStep] = useState(1);
  const [genre, setGenre] = useState(null);
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(TONES[1]);
  const [numChapters, setNumChapters] = useState(10);

  return (
    <main className="page narrow">
      <button className="back-link" onClick={step === 1 ? onCancel : () => setStep(1)}>
        <ChevronLeft size={15} /> {step === 1 ? "Tủ sách" : "Chọn lại thể loại"}
      </button>

      {step === 1 && (
        <>
          <p className="eyebrow">Bước 1 / 2</p>
          <h1 className="h2">Cuốn sách này thuộc thể loại nào?</h1>
          <div className="genre-grid">
            {GENRES.map((g) => (
              <button
                key={g.id}
                className={`genre-card ${genre === g.id ? "sel" : ""}`}
                onClick={() => { setGenre(g.id); setStep(2); }}
              >
                <span className="genre-label">{g.label}</span>
                <span className="genre-desc">{g.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="eyebrow">Bước 2 / 2 · {genreLabel(genre)}</p>
          <h1 className="h2">Kể cho AI nghe ý tưởng của bạn</h1>

          <label className="field">
            <span>Tên sách <em>(để trống nếu muốn AI đề xuất)</em></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Người gác đèn cuối cùng" />
          </label>

          <label className="field">
            <span>Ý tưởng / tiền đề *</span>
            <textarea
              rows={4}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder="Cuốn sách nói về điều gì? Nhân vật chính là ai? Thông điệp bạn muốn gửi gắm?"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Độc giả mục tiêu</span>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="VD: người trẻ 20–30 tuổi" />
            </label>
            <label className="field">
              <span>Số chương</span>
              <input
                type="number" min={3} max={30} value={numChapters}
                onChange={(e) => setNumChapters(Math.max(3, Math.min(30, Number(e.target.value) || 3)))}
              />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Giọng văn</span>
            <div className="chip-row">
              {TONES.map((t) => (
                <button key={t} className={`chip ${tone === t ? "sel" : ""}`} onClick={() => setTone(t)}>{t}</button>
              ))}
            </div>
          </div>

          <Btn kind="primary" disabled={!premise.trim()} onClick={() => onCreate({ genre, title: title.trim(), premise: premise.trim(), audience: audience.trim(), tone, numChapters })}>
            <Sparkles size={16} /> Tạo sách & sang bàn viết
          </Btn>
        </>
      )}
    </main>
  );
}

/* ---------------- Workspace ---------------- */

function Workspace({ book, persist, setError }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(""); // "" | "outline" | "write" | "continue" | "rewrite"
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const saveTimer = useRef(null);

  const outline = book.outline;
  const chapter = outline ? book.chapters[activeIdx] : null;

  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try { await fn(); }
    catch (e) { setError("Có lỗi: " + e.message + ". Hãy thử lại."); }
    finally { setBusy(""); }
  };

  const generateOutline = () => run("outline", async () => {
    const text = await callAI(
      "Bạn là biên tập viên trưởng của một nhà xuất bản Việt Nam, giàu kinh nghiệm xây dựng cấu trúc sách. Trả về CHỈ JSON hợp lệ, không markdown, không lời dẫn.",
      outlinePrompt(book)
    );
    const parsed = parseJsonLoose(text);
    if (!parsed.chapters || !parsed.chapters.length) throw new Error("Dàn ý trả về không hợp lệ");
    await persist({ ...book, outline: parsed });
    setActiveIdx(0);
  });

  const writeChapter = (extra) => run(extra ? "rewrite" : "write", async () => {
    const text = await callAI(
      "Bạn là một nhà văn Việt Nam chuyên nghiệp, văn phong tự nhiên, giàu hình ảnh, đúng thể loại được yêu cầu.",
      writeChapterPrompt(book, activeIdx, extra)
    );
    let content = text, summary = "";
    if (text.includes(SUMMARY_DELIM)) {
      const parts = text.split(SUMMARY_DELIM);
      content = parts[0].trim();
      summary = (parts[1] || "").trim();
    }
    const chapters = { ...book.chapters, [activeIdx]: { content, summary } };
    await persist({ ...book, chapters });
    setInstruction("");
  });

  const continueChapter = () => run("continue", async () => {
    const more = await callAI(
      "Bạn là một nhà văn Việt Nam chuyên nghiệp. Viết tiếp văn bản một cách liền mạch, không lặp lại, không lời dẫn.",
      continuePrompt(book, activeIdx)
    );
    const cur = book.chapters[activeIdx] || { content: "", summary: "" };
    const content = (cur.content + "\n\n" + more).trim();
    let summary = cur.summary;
    try {
      summary = await callAI(
        "Tóm tắt văn bản trong 2-3 câu tiếng Việt, chỉ trả về phần tóm tắt.",
        content.slice(-4000),
        500
      );
    } catch {}
    const chapters = { ...book.chapters, [activeIdx]: { content, summary } };
    await persist({ ...book, chapters });
  });

  const onEditContent = (val) => {
    const chapters = { ...book.chapters, [activeIdx]: { ...(book.chapters[activeIdx] || { summary: "" }), content: val } };
    const next = { ...book, chapters };
    // debounce save
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 800);
  };

  const exportBook = () => {
    const lines = [`# ${outline.title}`, "", outline.logline || "", ""];
    outline.chapters.forEach((c, i) => {
      lines.push(`\n## Chương ${i + 1}: ${c.title}\n`);
      lines.push(book.chapters[i]?.content || "_(chưa viết)_");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (outline.title || "ban-thao") + ".md";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* --- chưa có dàn ý --- */
  if (!outline) {
    return (
      <main className="page narrow">
        <p className="eyebrow">{genreLabel(book.genre)} · {book.tone}</p>
        <h1 className="h2">{book.title || "Sách chưa đặt tên"}</h1>
        <p className="lede">{book.premise}</p>
        <Btn kind="primary" disabled={!!busy} onClick={generateOutline}>
          {busy === "outline" ? <Spinner /> : <Sparkles size={16} />}
          {busy === "outline" ? "Đang dựng dàn ý…" : `Dựng dàn ý ${book.numChapters} chương bằng AI`}
        </Btn>
      </main>
    );
  }

  const doneCount = outline.chapters.filter((_, i) => book.chapters[i]?.content).length;

  return (
    <div className="workspace">
      {/* Sidebar: mục lục */}
      <aside className="toc">
        <div className="toc-head">
          <div className="toc-title">{outline.title}</div>
          <div className="toc-progress">{doneCount}/{outline.chapters.length} chương</div>
        </div>
        <div className="toc-list">
          {outline.chapters.map((c, i) => {
            const written = !!book.chapters[i]?.content;
            return (
              <button
                key={i}
                className={`toc-item ${i === activeIdx ? "active" : ""}`}
                onClick={() => { setActiveIdx(i); setEditing(false); }}
              >
                <span className={`toc-dot ${written ? "done" : ""}`}>{written ? <Check size={10} strokeWidth={3} /> : i + 1}</span>
                <span className="toc-label">{c.title}</span>
              </button>
            );
          })}
        </div>
        <div className="toc-foot">
          <Btn small onClick={exportBook} title="Tải bản thảo .md"><Download size={14} /> Xuất bản thảo</Btn>
          <Btn small onClick={() => { if (confirm("Dựng lại dàn ý sẽ giữ nguyên chương đã viết nhưng thay cấu trúc. Tiếp tục?")) generateOutline(); }} disabled={!!busy}>
            <RefreshCw size={14} /> Dàn ý mới
          </Btn>
        </div>
      </aside>

      {/* Trang bản thảo */}
      <main className="sheet-wrap">
        <article className="sheet">
          <p className="running-head">{genreLabel(book.genre)} · Chương {activeIdx + 1} / {outline.chapters.length}</p>
          <h1 className="ch-title">{outline.chapters[activeIdx].title}</h1>
          <p className="ch-brief">{outline.chapters[activeIdx].summary}</p>
          <div className="rule" />

          {!chapter?.content ? (
            <div className="empty-ch">
              <p>Chương này chưa được viết. AI sẽ viết dựa trên dàn ý và tóm tắt các chương trước để giữ mạch xuyên suốt.</p>
              <Btn kind="primary" disabled={!!busy} onClick={() => writeChapter("")}>
                {busy === "write" ? <Spinner /> : <PenLine size={16} />}
                {busy === "write" ? "Đang viết chương…" : "Viết chương này"}
              </Btn>
            </div>
          ) : editing ? (
            <textarea
              className="editor"
              defaultValue={chapter.content}
              onChange={(e) => onEditContent(e.target.value)}
              rows={22}
            />
          ) : (
            <div className="prose">
              {chapter.content.split(/\n{2,}/).map((p, i) => (
                <p key={i} className={i === 0 ? "first-para" : ""}>{p}</p>
              ))}
            </div>
          )}

          {chapter?.content && (
            <>
              <div className="rule" />
              <div className="action-row">
                <Btn small onClick={() => setEditing(!editing)}>
                  <FileText size={14} /> {editing ? "Xem trang" : "Sửa tay"}
                </Btn>
                <Btn small disabled={!!busy} onClick={continueChapter}>
                  {busy === "continue" ? <Spinner /> : <PenLine size={14} />} Viết tiếp
                </Btn>
              </div>
              <div className="rewrite-row">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Yêu cầu viết lại — VD: thêm hội thoại, ngắn gọn hơn, kịch tính hơn…"
                />
                <Btn small kind="primary" disabled={!!busy || !instruction.trim()} onClick={() => writeChapter(instruction.trim())}>
                  {busy === "rewrite" ? <Spinner /> : <RefreshCw size={14} />} Viết lại
                </Btn>
              </div>
              {chapter.summary && <p className="ch-summary"><strong>Tóm tắt (dùng làm ngữ cảnh):</strong> {chapter.summary}</p>}
            </>
          )}
        </article>
      </main>
    </div>
  );
}

/* ---------------- Styles ---------------- */

function StyleTag() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Be+Vietnam+Pro:wght@400;500;600&display=swap');

      :root {
        --paper: #FBFAF6;
        --sheet: #FFFFFF;
        --ink: #26323F;
        --ink-soft: #5C6672;
        --line: #E5E1D6;
        --seal: #B2372E;
        --seal-dark: #93291f;
        --shadow: 0 1px 2px rgba(38,50,63,.06), 0 8px 28px rgba(38,50,63,.07);
      }
      * { box-sizing: border-box; }
      .app {
        min-height: 100vh; background: var(--paper); color: var(--ink);
        font-family: 'Be Vietnam Pro', system-ui, sans-serif; font-size: 15px; line-height: 1.6;
      }
      .topbar {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 22px; border-bottom: 1px solid var(--line);
      }
      .brand { display:flex; align-items:center; gap:9px; cursor:pointer; color: var(--ink); }
      .brand-name { font-family:'Lora',serif; font-weight:600; font-size:17px; letter-spacing:.01em; }
      .topbar-right { display:flex; align-items:center; gap:10px; }
      .provider-pill {
        display:inline-flex; align-items:center; gap:6px; font:inherit; font-size:12.5px; font-weight:600;
        color:var(--ink-soft); background:#F3F0E8; border:1px solid var(--line);
        border-radius:999px; padding:5px 12px; cursor:pointer;
      }
      .provider-pill:hover { color:var(--ink); border-color:var(--ink-soft); }
      .settings-panel {
        border-bottom:1px solid var(--line); background:#F6F4EC; padding:16px 22px;
        display:flex; flex-direction:column; gap:12px;
      }
      .settings-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
      .settings-label { font-size:13px; font-weight:600; min-width:110px; }
      .settings-input {
        flex:1; min-width:220px; max-width:420px; background:var(--sheet);
        border:1px solid var(--line); border-radius:8px; padding:8px 12px; font:inherit; font-size:13.5px;
      }
      .settings-input:focus { outline:none; border-color:var(--seal); }
      .settings-note { font-size:12.5px; color:var(--ink-soft); margin:0; max-width:70ch; }

      .error-bar { background:#FBEAE8; color:var(--seal-dark); padding:9px 22px; font-size:13.5px; cursor:pointer; }
      .dim { color: var(--ink-soft); font-size: 13.5px; }

      .page { max-width: 880px; margin: 0 auto; padding: 44px 24px 80px; }
      .page.narrow { max-width: 620px; }

      .eyebrow {
        font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--seal); font-weight: 600; margin: 0 0 10px;
      }
      h1 { font-family:'Lora',serif; font-weight:600; font-size: 40px; line-height:1.15; margin: 0 0 14px; }
      .h2 { font-size: 28px; }
      .lede { color: var(--ink-soft); font-size: 16.5px; max-width: 52ch; margin: 0 0 26px; }

      .btn {
        display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line);
        background: var(--sheet); color: var(--ink); border-radius: 8px;
        padding: 10px 16px; font: inherit; font-weight:500; cursor:pointer;
        transition: border-color .15s, background .15s;
      }
      .btn:hover:not(:disabled) { border-color: var(--ink-soft); }
      .btn:disabled { opacity:.55; cursor: default; }
      .btn-primary { background: var(--seal); border-color: var(--seal); color:#fff; }
      .btn-primary:hover:not(:disabled) { background: var(--seal-dark); border-color: var(--seal-dark); }
      .btn-sm { padding: 6px 11px; font-size: 13.5px; border-radius: 7px; }
      .btn:focus-visible { outline: 2px solid var(--seal); outline-offset: 2px; }
      .icon-btn { background:none; border:none; color:var(--ink-soft); cursor:pointer; padding:6px; border-radius:6px; }
      .icon-btn:hover { color: var(--seal); background:#F3F0E8; }

      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

      /* Library */
      .hero { padding: 18px 0 46px; border-bottom: 1px solid var(--line); }
      .shelf { padding-top: 34px; }
      .shelf-title { font-family:'Lora',serif; font-size:19px; font-weight:600; margin:0 0 16px; }
      .book-list { display:flex; flex-direction:column; gap:10px; }
      .book-card {
        display:flex; align-items:center; gap:14px; background:var(--sheet);
        border:1px solid var(--line); border-radius:10px; padding:14px 16px; cursor:pointer;
        transition: box-shadow .15s, border-color .15s;
      }
      .book-card:hover { box-shadow: var(--shadow); border-color:#D8D3C4; }
      .book-spine { width:5px; align-self:stretch; border-radius:3px; background: linear-gradient(var(--seal), #7d241c); }
      .book-meta { flex:1; min-width:0; }
      .book-title { font-family:'Lora',serif; font-weight:600; font-size:16.5px; }
      .book-sub { color:var(--ink-soft); font-size:13px; margin-top:2px; }

      /* Setup */
      .back-link { display:inline-flex; align-items:center; gap:4px; background:none; border:none; color:var(--ink-soft); font:inherit; font-size:13.5px; cursor:pointer; padding:0; margin-bottom:22px; }
      .back-link:hover { color: var(--ink); }
      .genre-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap:10px; margin-top:8px; }
      .genre-card {
        text-align:left; background:var(--sheet); border:1px solid var(--line); border-radius:10px;
        padding:14px; cursor:pointer; font:inherit; display:flex; flex-direction:column; gap:4px;
        transition: border-color .15s, box-shadow .15s;
      }
      .genre-card:hover { border-color: var(--ink-soft); }
      .genre-card.sel { border-color: var(--seal); box-shadow: 0 0 0 1px var(--seal); }
      .genre-label { font-weight:600; }
      .genre-desc { font-size:12.5px; color:var(--ink-soft); }

      .field { display:block; margin-bottom:18px; }
      .field > span, .field-label { display:block; font-size:13px; font-weight:600; margin-bottom:6px; }
      .field em { font-weight:400; color:var(--ink-soft); font-style:normal; }
      .field input, .field textarea, .rewrite-row input {
        width:100%; background:var(--sheet); border:1px solid var(--line); border-radius:8px;
        padding:10px 12px; font:inherit; color:var(--ink); resize:vertical;
      }
      .field input:focus, .field textarea:focus, .rewrite-row input:focus { outline:none; border-color:var(--seal); }
      .field-row { display:grid; grid-template-columns: 1fr 130px; gap:14px; }
      .chip-row { display:flex; flex-wrap:wrap; gap:8px; }
      .chip { border:1px solid var(--line); background:var(--sheet); border-radius:999px; padding:6px 14px; font:inherit; font-size:13.5px; cursor:pointer; }
      .chip.sel { border-color:var(--seal); color:var(--seal); font-weight:600; }
      .field:has(.chip-row) { margin-bottom:26px; }

      /* Workspace */
      .workspace { display:grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 53px); }
      .toc { border-right:1px solid var(--line); display:flex; flex-direction:column; background:#F6F4EC; }
      .toc-head { padding:18px 18px 12px; border-bottom:1px solid var(--line); }
      .toc-title { font-family:'Lora',serif; font-weight:600; font-size:15.5px; line-height:1.3; }
      .toc-progress { font-size:12px; color:var(--ink-soft); margin-top:4px; }
      .toc-list { flex:1; overflow:auto; padding:10px 8px; }
      .toc-item {
        display:flex; align-items:center; gap:10px; width:100%; text-align:left;
        background:none; border:none; font:inherit; font-size:13.5px; color:var(--ink);
        padding:8px 10px; border-radius:8px; cursor:pointer;
      }
      .toc-item:hover { background:#EFEBDF; }
      .toc-item.active { background:#EAE5D6; font-weight:600; }
      .toc-dot {
        flex:none; width:20px; height:20px; border-radius:50%; border:1px solid var(--line);
        background:var(--sheet); display:flex; align-items:center; justify-content:center;
        font-size:10.5px; color:var(--ink-soft);
      }
      .toc-dot.done { background:var(--seal); border-color:var(--seal); color:#fff; }
      .toc-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .toc-foot { padding:12px; border-top:1px solid var(--line); display:flex; gap:8px; flex-wrap:wrap; }

      .sheet-wrap { padding: 34px 28px 90px; overflow:auto; }
      .sheet {
        max-width: 660px; margin: 0 auto; background: var(--sheet);
        border:1px solid var(--line); border-radius: 4px; box-shadow: var(--shadow);
        padding: 52px 58px 46px;
      }
      .running-head { font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-soft); margin:0 0 18px; text-align:center; }
      .ch-title { font-family:'Lora',serif; font-size:30px; font-weight:600; text-align:center; margin:0 0 10px; }
      .ch-brief { text-align:center; color:var(--ink-soft); font-size:14px; font-style:italic; font-family:'Lora',serif; margin:0 auto 6px; max-width:46ch; }
      .rule { height:1px; background:var(--line); margin:26px auto; width:64px; }

      .prose { font-family:'Lora',serif; font-size:16.5px; line-height:1.85; }
      .prose p { margin: 0 0 1.1em; text-align: justify; }
      .prose .first-para::first-letter {
        font-size: 3.1em; float:left; line-height:.82; padding: 4px 8px 0 0;
        color: var(--seal); font-weight:600;
      }
      .empty-ch { text-align:center; color:var(--ink-soft); padding: 10px 0 6px; }
      .empty-ch p { max-width:46ch; margin:0 auto 20px; }

      .editor {
        width:100%; font-family:'Lora',serif; font-size:15.5px; line-height:1.8;
        border:1px solid var(--line); border-radius:8px; padding:16px; color:var(--ink); background:#FFFDF8;
      }
      .editor:focus { outline:none; border-color: var(--seal); }

      .action-row { display:flex; gap:8px; justify-content:center; margin-bottom:14px; flex-wrap:wrap; }
      .rewrite-row { display:flex; gap:8px; }
      .rewrite-row input { flex:1; }
      .ch-summary { margin-top:18px; font-size:12.5px; color:var(--ink-soft); background:#F7F5EE; border-radius:8px; padding:10px 12px; }

      @media (max-width: 760px) {
        .workspace { grid-template-columns: 1fr; }
        .toc { border-right:none; border-bottom:1px solid var(--line); max-height:38vh; }
        .sheet { padding: 30px 22px; }
        h1 { font-size: 30px; }
        .field-row { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
