import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function CatalogPage() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}catalog.json`.replace(/\/\//g, "/");
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load catalog (${r.status})`);
        return r.json();
      })
      .then((data) => setCatalog(data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="catalog-page">
        <h1 className="catalog-title">Library</h1>
        <p className="catalog-error">Could not load catalog: {error}</p>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="catalog-page">
        <h1 className="catalog-title">Library</h1>
        <p className="catalog-loading">Loading...</p>
      </div>
    );
  }

  const books = catalog.books || [];

  return (
    <div className="catalog-page">
      <h1 className="catalog-title">Library</h1>
      <p className="catalog-subtitle">
        {books.length} {books.length === 1 ? "book" : "books"} available
      </p>

      {books.length === 0 && (
        <p className="catalog-empty">
          No books yet. Run <code>add-book.sh</code> to add your first book.
        </p>
      )}

      <div className="catalog-grid">
        {books.map((book) => (
          <Link
            key={book.id}
            to={`/books/${book.id}`}
            className="catalog-card"
          >
            {book.coverImage && (
              <img
                src={`${import.meta.env.BASE_URL}books/${book.id}/${book.coverImage}`.replace(/\/\//g, "/")}
                alt={`${book.title} cover`}
                className="catalog-card-cover"
              />
            )}
            <div className="catalog-card-body">
              <h2 className="catalog-card-title">{book.title}</h2>
              <p className="catalog-card-author">{book.author}</p>
              <div className="catalog-card-stats">
                {book.chapterCount && (
                  <span>{book.chapterCount} chapters</span>
                )}
                {book.characterCount && (
                  <span>{book.characterCount} characters</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Deep-link refresh may 404 on GitHub Pages until SPA fallback is added */}
    </div>
  );
}
